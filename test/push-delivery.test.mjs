import assert from 'node:assert/strict';
import test from 'node:test';
import { campaignBounds } from '../shared/push-campaign.mjs';
import {
  deliverQueueMessage,
  enqueueWelcomeNotification,
  notificationConfiguration,
  prepareDailyCampaign,
} from '../worker/push-delivery.mjs';
import { STORE_KEYS, readJson, writeJson } from '../worker/store.mjs';

const configurationOk = () => ({ ok: true, missing: [] });

function subscription(id) {
  return {
    endpoint: `https://push.example/${id}`,
    expirationTime: null,
    keys: { auth: `auth-${id}`, p256dh: `key-${id}` },
  };
}

function queueFixture() {
  const batches = [];
  const delayed = [];
  return {
    batches,
    delayed,
    binding: {
      async sendBatch(messages) { batches.push(messages); },
      async send(body, options) { delayed.push({ body, options }); },
    },
  };
}

function message(body) {
  let acknowledgements = 0;
  return {
    body,
    ack() { acknowledgements += 1; },
    get acknowledgements() { return acknowledgements; },
  };
}

async function preparedFixture(date, ids = ['one']) {
  const queue = queueFixture();
  const records = ids.map((id) => ({ sub: subscription(`${date}-${id}`), createdAt: 1, lastSeen: 1 }));
  await writeJson({}, STORE_KEYS.subs, records);
  const env = { PUSH_ENABLED: 'true', PUSH_DELIVERY_QUEUE: queue.binding };
  const now = campaignBounds(date).scheduledAt + 1000;
  const result = await prepareDailyCampaign(env, {
    now,
    scheduledTime: campaignBounds(date).scheduledAt,
    cocktails: [{ id: 'test-drink', name: 'Test Drink', thumb: '/test.webp' }],
    facts: ['A reviewed fact.'],
    validateConfiguration: configurationOk,
  });
  return { env, now, queue, records, result, messages: queue.batches.flat().map((entry) => entry.body) };
}

test('configuration validation exposes names only and scheduler stays disabled by default', async () => {
  assert.deepEqual(notificationConfiguration({}, 'consumer'), {
    ok: false,
    missing: ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'PUSH_DELIVERY_QUEUE', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'],
  });
  const result = await prepareDailyCampaign({ PUSH_DELIVERY_QUEUE: queueFixture().binding });
  assert.deepEqual(result, { status: 'disabled', published: 0 });
});

test('a new opt-in welcome is queued and delivered once without enabling the daily campaign', async () => {
  const queue = queueFixture();
  const original = subscription('welcome-once');
  const refreshed = {
    ...original,
    keys: { auth: 'welcome-refreshed-auth', p256dh: 'welcome-refreshed-key' },
  };
  await writeJson({}, STORE_KEYS.subs, [{ sub: refreshed, createdAt: 1, lastSeen: 2 }]);
  const env = { PUSH_ENABLED: 'false', PUSH_DELIVERY_QUEUE: queue.binding };

  assert.equal(await enqueueWelcomeNotification(env, original), true);
  assert.equal(queue.delayed.length, 1);
  assert.equal(queue.delayed[0].body.kind, 'welcome');
  assert.equal(queue.delayed[0].body.attempt, 0);

  let observed = null;
  const first = message(queue.delayed[0].body);
  const result = await deliverQueueMessage(env, first, {
    now: Date.parse('2031-01-01T12:00:00Z'),
    validateConfiguration: configurationOk,
    buildRequest: async (current, payload, _env, ttl, topic) => {
      observed = { current, payload, ttl, topic };
      return { endpoint: 'https://provider.example/send', method: 'POST', headers: {}, body: 'ciphertext' };
    },
    fetch: async () => new Response(null, { status: 201 }),
  });
  assert.deepEqual(result, { status: 'accepted', ttlSeconds: 3600 });
  assert.equal(first.acknowledgements, 1);
  assert.deepEqual(observed.current.keys, refreshed.keys);
  assert.equal(observed.payload.tag, 'welcome');
  assert.equal(observed.topic, 'welcome');

  const duplicate = message(queue.delayed[0].body);
  assert.equal((await deliverQueueMessage(env, duplicate, {
    now: Date.parse('2031-01-01T12:00:01Z'),
    validateConfiguration: configurationOk,
    buildRequest: async () => { throw new Error('welcome must not be submitted twice'); },
  })).status, 'deduplicated');
});

test('campaign preparation freezes recipient hashes, publishes in bounded batches, and resumes idempotently', async () => {
  const ids = Array.from({ length: 51 }, (_, index) => `recipient-${index}`);
  const fixture = await preparedFixture('2031-01-02', ids);
  assert.equal(fixture.result.status, 'prepared');
  assert.deepEqual(fixture.queue.batches.map((batch) => batch.length), [50, 1]);
  assert.equal(fixture.messages.length, 51);

  const campaign = await readJson({}, 'pubcrawl:push:campaign:2031-01-02', null);
  assert.equal(campaign.recipientCount, 51);
  assert.equal(campaign.publishedCount, 51);
  assert.ok(campaign.recipients.every((recipient) => /^[a-f0-9]{32}$/.test(recipient.hash)));
  assert.equal(JSON.stringify(campaign).includes('https://push.example'), false);

  const again = await prepareDailyCampaign(fixture.env, {
    now: fixture.now + 1000,
    scheduledTime: campaignBounds('2031-01-02').scheduledAt,
    cocktails: [{ id: 'ignored', name: 'Ignored', thumb: '/ignored.webp' }],
    facts: ['Ignored'],
    validateConfiguration: configurationOk,
  });
  assert.equal(again.published, 51);
  assert.equal(fixture.queue.batches.length, 2);
});

test('fan-out stays bounded for 10, 100, and 500 synthetic recipients', async () => {
  for (const [date, count] of [['2032-01-02', 10], ['2032-01-03', 100], ['2032-01-04', 500]]) {
    const ids = Array.from({ length: count }, (_, index) => `budget-${count}-${index}`);
    const fixture = await preparedFixture(date, ids);
    assert.equal(fixture.messages.length, count);
    assert.ok(fixture.queue.batches.every((batch) => batch.length > 0 && batch.length <= 50));
    assert.equal(fixture.queue.batches.length, Math.ceil(count / 50));
  }
});

test('campaign preparation resumes after a partial fan-out failure without republishing completed batches', async () => {
  const date = '2032-01-05';
  const records = Array.from({ length: 101 }, (_, index) => ({
    sub: subscription(`${date}-partial-${index}`), createdAt: 1, lastSeen: 1,
  }));
  await writeJson({}, STORE_KEYS.subs, records);
  const deliveredBatches = [];
  let failSecondBatch = true;
  const queue = {
    async sendBatch(messages) {
      if (failSecondBatch && deliveredBatches.length === 1) {
        failSecondBatch = false;
        throw new Error('fixture publication failure');
      }
      deliveredBatches.push(messages);
    },
    async send() {},
  };
  const env = { PUSH_ENABLED: 'true', PUSH_DELIVERY_QUEUE: queue };
  const now = campaignBounds(date).scheduledAt + 1000;
  const options = {
    now,
    scheduledTime: campaignBounds(date).scheduledAt,
    cocktails: [{ id: 'test-drink', name: 'Test Drink', thumb: '/test.webp' }],
    facts: ['A reviewed fact.'],
    validateConfiguration: configurationOk,
  };
  await assert.rejects(prepareDailyCampaign(env, options), /fixture publication failure/);
  assert.equal((await readJson({}, `pubcrawl:push:campaign:${date}`, null)).publishedCount, 50);
  const resumed = await prepareDailyCampaign(env, { ...options, now: now + 1000 });
  assert.equal(resumed.published, 101);
  assert.deepEqual(deliveredBatches.map((batch) => batch.length), [50, 50, 1]);
});

test('an accepted delivery is deduplicated and records the earliest provider acceptance', async () => {
  const fixture = await preparedFixture('2031-01-03');
  const first = message(fixture.messages[0]);
  const response = await deliverQueueMessage(fixture.env, first, {
    now: fixture.now + 5000,
    validateConfiguration: configurationOk,
    buildRequest: async () => ({ endpoint: 'https://provider.example/send', method: 'POST', headers: {}, body: 'ciphertext' }),
    fetch: async () => new Response(null, { status: 201 }),
  });
  assert.equal(response.status, 'accepted');
  assert.equal(first.acknowledgements, 1);

  const duplicate = message(fixture.messages[0]);
  assert.equal((await deliverQueueMessage(fixture.env, duplicate, {
    now: fixture.now + 10000,
    validateConfiguration: configurationOk,
    buildRequest: async () => { throw new Error('must not build duplicate request'); },
  })).status, 'deduplicated');
  const campaign = await readJson({}, 'pubcrawl:push:campaign:2031-01-03', null);
  assert.equal(campaign.accepted, 1);
  assert.equal(campaign.deduplicated, 1);
  assert.equal(campaign.firstProviderAcceptance, fixture.now + 5000);
  assert.equal(campaign.lastProviderAcceptance, fixture.now + 5000);
});

test('campaign acceptance bounds remain chronological when deliveries complete out of order', async () => {
  const fixture = await preparedFixture('2031-01-13', ['one', 'two']);
  const common = {
    validateConfiguration: configurationOk,
    buildRequest: async () => ({ endpoint: 'https://provider.example/send', method: 'POST', headers: {}, body: 'ciphertext' }),
    fetch: async () => new Response(null, { status: 201 }),
  };
  await deliverQueueMessage(fixture.env, message(fixture.messages[0]), { ...common, now: fixture.now + 10_000 });
  await deliverQueueMessage(fixture.env, message(fixture.messages[1]), { ...common, now: fixture.now + 5_000 });
  const campaign = await readJson({}, 'pubcrawl:push:campaign:2031-01-13', null);
  assert.equal(campaign.firstProviderAcceptance, fixture.now + 5_000);
  assert.equal(campaign.lastProviderAcceptance, fixture.now + 10_000);
});

test('delivery TTL is the remaining whole campaign window, not a refreshed default', async () => {
  const date = '2031-01-11';
  const fixture = await preparedFixture(date);
  const now = campaignBounds(date).expiresAt - 6500;
  let observedTtl = null;
  const delivery = message(fixture.messages[0]);
  const result = await deliverQueueMessage(fixture.env, delivery, {
    now,
    validateConfiguration: configurationOk,
    buildRequest: async (_subscription, _payload, _env, ttl) => {
      observedTtl = ttl;
      return { endpoint: 'https://provider.example/send', method: 'POST', headers: {}, body: 'ciphertext' };
    },
    fetch: async () => new Response(null, { status: 201 }),
  });
  assert.equal(result.status, 'accepted');
  assert.equal(observedTtl, 6);
});

test('retryable results queue only two bounded retries with the original deadline', async () => {
  const fixture = await preparedFixture('2031-01-04');
  const first = message(fixture.messages[0]);
  const common = {
    validateConfiguration: configurationOk,
    buildRequest: async () => ({ endpoint: 'https://provider.example/send', method: 'POST', headers: {}, body: 'ciphertext' }),
    fetch: async () => new Response(null, { status: 503, headers: { 'retry-after': '90' } }),
  };
  assert.deepEqual(await deliverQueueMessage(fixture.env, first, { ...common, now: fixture.now }), {
    status: 'retrying', delaySeconds: 90,
  });
  assert.equal(fixture.queue.delayed[0].body.attempt, 1);
  assert.equal(fixture.queue.delayed[0].options.delaySeconds, 90);

  const second = message(fixture.queue.delayed[0].body);
  assert.deepEqual(await deliverQueueMessage(fixture.env, second, { ...common, now: fixture.now + 90_000 }), {
    status: 'retrying', delaySeconds: 300,
  });
  const third = message(fixture.queue.delayed[1].body);
  assert.equal((await deliverQueueMessage(fixture.env, third, { ...common, now: fixture.now + 390_000 })).status, 'failed');
  assert.equal(fixture.queue.delayed.length, 2);
});

test('a failed retry publication terminates without repeating the provider submission', async () => {
  const fixture = await preparedFixture('2031-01-12');
  fixture.env.PUSH_DELIVERY_QUEUE.send = async () => { throw new Error('queue unavailable'); };
  let submissions = 0;
  const first = message(fixture.messages[0]);
  const result = await deliverQueueMessage(fixture.env, first, {
    now: fixture.now,
    validateConfiguration: configurationOk,
    buildRequest: async () => ({ endpoint: 'https://provider.example/send', method: 'POST', headers: {}, body: 'ciphertext' }),
    fetch: async () => {
      submissions += 1;
      return new Response(null, { status: 503 });
    },
  });
  assert.equal(result.status, 'failed');
  assert.equal(first.acknowledgements, 1);
  assert.equal(submissions, 1);
  const duplicate = message(fixture.messages[0]);
  assert.equal((await deliverQueueMessage(fixture.env, duplicate, {
    now: fixture.now + 1000,
    validateConfiguration: configurationOk,
    buildRequest: async () => { throw new Error('terminal receipt must deduplicate'); },
  })).status, 'deduplicated');
});

test('a transport uncertainty is terminal and never blindly resubmitted', async () => {
  const fixture = await preparedFixture('2031-01-05');
  const first = message(fixture.messages[0]);
  assert.equal((await deliverQueueMessage(fixture.env, first, {
    now: fixture.now,
    validateConfiguration: configurationOk,
    buildRequest: async () => ({ endpoint: 'https://provider.example/send', method: 'POST', headers: {}, body: 'ciphertext' }),
    fetch: async () => { throw new Error('connection outcome unknown'); },
  })).status, 'uncertain');
  const duplicate = message(fixture.messages[0]);
  assert.equal((await deliverQueueMessage(fixture.env, duplicate, {
    now: fixture.now + 1000,
    validateConfiguration: configurationOk,
  })).status, 'deduplicated');
});

test('a stale submitting receipt is resolved as uncertain without another provider request', async () => {
  const fixture = await preparedFixture('2031-01-09');
  const body = fixture.messages[0];
  const receiptKey = `pubcrawl:push:delivery:2031-01-09:${body.recipientHash}`;
  await writeJson({}, receiptKey, { status: 'submitting', attempt: 0, startedAt: fixture.now - 31_000 });
  const stale = message(body);
  const result = await deliverQueueMessage(fixture.env, stale, {
    now: fixture.now,
    validateConfiguration: configurationOk,
    buildRequest: async () => { throw new Error('stale work must not be submitted again'); },
  });
  assert.equal(result.status, 'uncertain');
  assert.equal(stale.acknowledgements, 1);
  const campaign = await readJson({}, 'pubcrawl:push:campaign:2031-01-09', null);
  assert.equal(campaign.uncertain, 1);
});

test('delivery uses refreshed subscription keys for the frozen endpoint', async () => {
  const fixture = await preparedFixture('2031-01-10');
  const original = fixture.records[0];
  const refreshed = {
    ...original,
    sub: { ...original.sub, keys: { auth: 'refreshed-auth', p256dh: 'refreshed-key' } },
    lastSeen: 2,
  };
  await writeJson({}, STORE_KEYS.subs, [refreshed]);
  let requestSubscription = null;
  const delivered = message(fixture.messages[0]);
  const result = await deliverQueueMessage(fixture.env, delivered, {
    now: fixture.now,
    validateConfiguration: configurationOk,
    buildRequest: async (current) => {
      requestSubscription = current;
      return { endpoint: 'https://provider.example/send', method: 'POST', headers: {}, body: 'ciphertext' };
    },
    fetch: async () => new Response(null, { status: 201 }),
  });
  assert.equal(result.status, 'accepted');
  assert.deepEqual(requestSubscription.keys, refreshed.sub.keys);
});

test('404/410 cleanup removes only the expired endpoint from the current list', async () => {
  const fixture = await preparedFixture('2031-01-06', ['expired', 'keep']);
  const addedDuringBatch = { sub: subscription('added-during-batch'), createdAt: 2, lastSeen: 2 };
  await writeJson({}, STORE_KEYS.subs, [...fixture.records, addedDuringBatch]);
  const expired = message(fixture.messages[0]);
  assert.equal((await deliverQueueMessage(fixture.env, expired, {
    now: fixture.now,
    validateConfiguration: configurationOk,
    buildRequest: async () => ({ endpoint: 'https://provider.example/send', method: 'POST', headers: {}, body: 'ciphertext' }),
    fetch: async () => new Response(null, { status: 410 }),
  })).status, 'expired-subscription');
  const records = await readJson({}, STORE_KEYS.subs, []);
  assert.equal(records.some((record) => record.sub.endpoint === fixture.messages[0].subscription.endpoint), false);
  assert.equal(records.some((record) => record.sub.endpoint === addedDuringBatch.sub.endpoint), true);
  const campaign = await readJson({}, 'pubcrawl:push:campaign:2031-01-06', null);
  assert.equal(campaign.expiredSubscriptionsRemoved, 1);
});

test('configuration rejection halts later recipient submissions and expiry never sends', async () => {
  const fixture = await preparedFixture('2031-01-07', ['one', 'two']);
  const denied = message(fixture.messages[0]);
  assert.equal((await deliverQueueMessage(fixture.env, denied, {
    now: fixture.now,
    validateConfiguration: configurationOk,
    buildRequest: async () => ({ endpoint: 'https://provider.example/send', method: 'POST', headers: {}, body: 'ciphertext' }),
    fetch: async () => new Response(null, { status: 403 }),
  })).status, 'configuration-failure');
  const later = message(fixture.messages[1]);
  assert.equal((await deliverQueueMessage(fixture.env, later, {
    now: fixture.now + 1000,
    validateConfiguration: configurationOk,
    buildRequest: async () => { throw new Error('must not submit after configuration failure'); },
  })).status, 'configuration-failure');

  const expiredFixture = await preparedFixture('2031-01-08');
  const afterDeadline = message(expiredFixture.messages[0]);
  assert.equal((await deliverQueueMessage(expiredFixture.env, afterDeadline, {
    now: campaignBounds('2031-01-08').expiresAt,
    validateConfiguration: configurationOk,
    buildRequest: async () => { throw new Error('must not submit after deadline'); },
  })).status, 'expired');
});

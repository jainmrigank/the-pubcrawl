import webpush from 'web-push';
import catalogue from '../src/generated/client_catalog.json' with { type: 'json' };
import facts from '../data/facts.json' with { type: 'json' };
import {
  CAMPAIGN_RESULT_TTL_SECONDS,
  DELIVERY_RECEIPT_TTL_SECONDS,
  WELCOME_NOTIFICATION,
  buildCampaign,
  classifyPushResult,
  deliveryWindow,
  istDateKey,
  retryDelaySeconds,
} from '../shared/push-campaign.mjs';
import {
  STORE_KEYS,
  claimDeliveryAttemptAtomic,
  createJsonIfAbsent,
  markStaleSubmissionUncertainAtomic,
  readJson,
  removeSubscriptionAtomic,
  updateCampaignAtomic,
  writeJsonWithExpiry,
} from './store.mjs';

const CAMPAIGN_PREFIX = 'pubcrawl:push:campaign:';
const RECEIPT_PREFIX = 'pubcrawl:push:delivery:';
const WELCOME_RECEIPT_PREFIX = 'pubcrawl:push:welcome:';
const MAX_FANOUT_BATCH = 50;
const STALE_SUBMISSION_MS = 30_000;
const WELCOME_TTL_SECONDS = 60 * 60;

export function notificationConfiguration(env, mode = 'producer') {
  const missing = [];
  if (!String(env.KV_REST_API_URL || '').trim()) missing.push('KV_REST_API_URL');
  if (!String(env.KV_REST_API_TOKEN || '').trim()) missing.push('KV_REST_API_TOKEN');
  if (!env.PUSH_DELIVERY_QUEUE) missing.push('PUSH_DELIVERY_QUEUE');
  if (mode === 'consumer') {
    if (!String(env.VAPID_PUBLIC_KEY || '').trim()) missing.push('VAPID_PUBLIC_KEY');
    if (!String(env.VAPID_PRIVATE_KEY || '').trim()) missing.push('VAPID_PRIVATE_KEY');
  }
  return { ok: missing.length === 0, missing };
}

export async function recipientId(endpoint) {
  const material = new TextEncoder().encode(String(endpoint));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', material));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function campaignKey(date) {
  return `${CAMPAIGN_PREFIX}${date}`;
}

function receiptKey(date, hash) {
  return `${RECEIPT_PREFIX}${date}:${hash}`;
}

function welcomeReceiptKey(hash) {
  return `${WELCOME_RECEIPT_PREFIX}${hash}`;
}

function validRecord(record) {
  return record?.sub?.endpoint && typeof record.sub.endpoint === 'string' && record.sub.endpoint.startsWith('https://');
}

async function freezeRecipients(records) {
  const frozen = [];
  for (const record of records.filter(validRecord)) {
    frozen.push({ hash: await recipientId(record.sub.endpoint) });
  }
  return frozen;
}

async function subscriptionsByRecipient(records) {
  const entries = [];
  for (const record of records.filter(validRecord)) {
    entries.push([await recipientId(record.sub.endpoint), record.sub]);
  }
  return new Map(entries);
}

/** Called by Cloudflare Cron. It prepares once and safely resumes partial fan-out. */
export async function prepareDailyCampaign(env, options = {}) {
  if (String(env.PUSH_ENABLED || '').toLowerCase() !== 'true') return { status: 'disabled', published: 0 };
  const validateConfiguration = options.validateConfiguration || notificationConfiguration;
  const config = validateConfiguration(env, 'producer');
  if (!config.ok) return { status: 'configuration-error', missing: config.missing, published: 0 };

  const now = Number(options.now ?? Date.now());
  const scheduledTime = Number(options.scheduledTime ?? now);
  const date = istDateKey(scheduledTime);
  const window = deliveryWindow(now, date);
  if (!window.eligible) return { status: window.reason, published: 0, date };

  const campaign = buildCampaign(date, {
    cocktails: options.cocktails || catalogue.recipes,
    facts: options.facts || facts,
  });
  const key = campaignKey(date);
  let stored = await readJson(env, key, null);
  if (!stored) {
    const records = await readJson(env, STORE_KEYS.subs, []);
    const recipients = await freezeRecipients(Array.isArray(records) ? records : []);
    stored = {
      ...campaign,
      recipientCount: recipients.length,
      recipients,
      publishedCount: 0,
      actualStartTime: now,
      firstProviderAcceptance: null,
      lastProviderAcceptance: null,
      accepted: 0,
      failed: 0,
      uncertain: 0,
      expired: 0,
      deduplicated: 0,
      expiredSubscriptionsRemoved: 0,
    };
    const created = await createJsonIfAbsent(env, key, stored, CAMPAIGN_RESULT_TTL_SECONDS);
    if (!created) stored = await readJson(env, key, stored);
  }

  const currentRecords = await readJson(env, STORE_KEYS.subs, []);
  const currentByRecipient = await subscriptionsByRecipient(Array.isArray(currentRecords) ? currentRecords : []);
  const recipients = Array.isArray(stored.recipients) ? stored.recipients : [];
  let published = Math.max(0, Number(stored.publishedCount) || 0);
  for (let start = published; start < recipients.length; start += MAX_FANOUT_BATCH) {
    const slice = recipients.slice(start, start + MAX_FANOUT_BATCH);
    const messages = slice
      .map((recipient) => ({ recipient, subscription: currentByRecipient.get(recipient.hash) }))
      .filter((entry) => entry.subscription)
      .map((entry) => ({
        body: {
          kind: 'daily',
          campaignDate: date,
          recipientHash: entry.recipient.hash,
          subscription: entry.subscription,
          attempt: 0,
        },
      }));
    if (messages.length) await env.PUSH_DELIVERY_QUEUE.sendBatch(messages);
    published = Math.min(recipients.length, start + slice.length);
    await updateCampaignAtomic(env, key, { publishedCount: published }, {}, CAMPAIGN_RESULT_TTL_SECONDS);
  }
  return { status: 'prepared', date, published, recipientCount: recipients.length };
}

/** Queue the existing one-time opt-in welcome without enabling daily sends. */
export async function enqueueWelcomeNotification(env, subscription) {
  if (!env.PUSH_DELIVERY_QUEUE || !validRecord({ sub: subscription })) return false;
  await env.PUSH_DELIVERY_QUEUE.send({
    kind: 'welcome',
    recipientHash: await recipientId(subscription.endpoint),
    subscription,
    attempt: 0,
  });
  return true;
}

function requestDetails(subscription, payload, env, ttlSeconds, date) {
  return webpush.generateRequestDetails(subscription, JSON.stringify(payload), {
    TTL: ttlSeconds,
    topic: `pc-${date.replaceAll('-', '')}`,
    vapidDetails: {
      subject: String(env.VAPID_SUBJECT || 'mailto:hello@the-pubcrawl.app'),
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    },
  });
}

async function deliverWelcomeQueueMessage(env, message, options = {}) {
  const now = Number(options.now ?? Date.now());
  const body = message.body || {};
  const hash = String(body.recipientHash || '');
  const subscription = body.subscription;
  const key = welcomeReceiptKey(hash);
  const validateConfiguration = options.validateConfiguration || notificationConfiguration;
  const config = validateConfiguration(env, 'consumer');
  if (!config.ok) {
    message.ack();
    return { status: 'configuration-error', missing: config.missing };
  }
  if (!validRecord({ sub: subscription }) || await recipientId(subscription.endpoint) !== hash) {
    message.ack();
    return { status: 'invalid-recipient' };
  }
  const current = await readJson(env, STORE_KEYS.subs, []);
  const currentRecord = Array.isArray(current)
    ? current.find((record) => record?.sub?.endpoint === subscription.endpoint)
    : null;
  if (!currentRecord) {
    message.ack();
    return { status: 'unsubscribed' };
  }

  const claimed = await claimDeliveryAttemptAtomic(env, key, 0, {
    status: 'submitting', attempt: 0, startedAt: now,
  }, DELIVERY_RECEIPT_TTL_SECONDS);
  if (!claimed) {
    const recovered = await markStaleSubmissionUncertainAtomic(env, key, 0, now - STALE_SUBMISSION_MS, {
      status: 'uncertain', attempt: 0, at: now, reason: 'stale-submission',
    }, DELIVERY_RECEIPT_TTL_SECONDS);
    message.ack();
    return { status: recovered ? 'uncertain' : 'deduplicated' };
  }

  let response;
  try {
    const buildRequest = options.buildRequest || requestDetails;
    const details = await buildRequest(
      currentRecord.sub,
      WELCOME_NOTIFICATION,
      env,
      WELCOME_TTL_SECONDS,
      'welcome',
    );
    const transport = options.fetch || fetch;
    response = await transport(details.endpoint, {
      method: details.method || 'POST',
      headers: details.headers,
      body: details.body,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    const finishedAt = options.now == null ? Date.now() : now;
    await markReceipt(env, key, { status: 'uncertain', attempt: 0, at: finishedAt });
    message.ack();
    return { status: 'uncertain' };
  }

  const finishedAt = options.now == null ? Date.now() : now;
  const result = classifyPushResult(response.status);
  if (result === 'accepted') {
    await markReceipt(env, key, { status: 'accepted', attempt: 0, at: finishedAt });
    message.ack();
    return { status: 'accepted', ttlSeconds: WELCOME_TTL_SECONDS };
  }
  if (result === 'expired-subscription') {
    await removeSubscriptionAtomic(env, STORE_KEYS.subs, currentRecord.sub.endpoint);
    await markReceipt(env, key, { status: 'expired-subscription', attempt: 0, at: finishedAt });
    message.ack();
    return { status: 'expired-subscription' };
  }
  const status = result === 'configuration-failure' ? 'configuration-failure' : 'failed';
  await markReceipt(env, key, { status, attempt: 0, at: finishedAt, providerStatus: response.status });
  message.ack();
  return { status };
}

async function markReceipt(env, key, value) {
  return writeJsonWithExpiry(env, key, value, DELIVERY_RECEIPT_TTL_SECONDS);
}

async function addResult(env, date, status, now, { patch: extraPatch = {}, increments: extraIncrements = {} } = {}) {
  const increments = { ...extraIncrements };
  const patch = { ...extraPatch };
  if (status === 'accepted') {
    increments.accepted = 1;
    patch.firstProviderAcceptance = now;
    patch.lastProviderAcceptance = now;
  } else if (status === 'uncertain') increments.uncertain = 1;
  else if (status === 'expired') increments.expired = 1;
  else increments.failed = 1;
  return updateCampaignAtomic(env, campaignKey(date), patch, increments, CAMPAIGN_RESULT_TTL_SECONDS);
}

/** Deliver exactly one Queue message. Tests inject transport/request generation. */
export async function deliverQueueMessage(env, message, options = {}) {
  if (message.body?.kind === 'welcome') return deliverWelcomeQueueMessage(env, message, options);
  const now = Number(options.now ?? Date.now());
  const body = message.body || {};
  const date = String(body.campaignDate || '');
  const hash = String(body.recipientHash || '');
  const attempt = Math.max(0, Math.floor(Number(body.attempt) || 0));
  const key = receiptKey(date, hash);

  if (String(env.PUSH_ENABLED || '').toLowerCase() !== 'true') {
    message.ack();
    return { status: 'disabled' };
  }
  const validateConfiguration = options.validateConfiguration || notificationConfiguration;
  const config = validateConfiguration(env, 'consumer');
  if (!config.ok) {
    message.ack();
    return { status: 'configuration-error', missing: config.missing };
  }
  const window = deliveryWindow(now, date);
  if (!window.eligible) {
    const claimed = await claimDeliveryAttemptAtomic(env, key, attempt, {
      status: 'expiring', attempt, startedAt: now,
    }, DELIVERY_RECEIPT_TTL_SECONDS);
    if (!claimed) {
      await updateCampaignAtomic(env, campaignKey(date), {}, { deduplicated: 1 }, CAMPAIGN_RESULT_TTL_SECONDS);
      message.ack();
      return { status: 'deduplicated' };
    }
    await markReceipt(env, key, { status: 'expired', at: now, attempt });
    await addResult(env, date, 'expired', now);
    message.ack();
    return { status: 'expired' };
  }

  const campaign = await readJson(env, campaignKey(date), null);
  if (!campaign?.payload || Number(campaign.expiresAt) !== window.expiresAt) {
    message.ack();
    return { status: 'invalid-campaign' };
  }
  if (campaign.configurationFailedAt) {
    await markReceipt(env, key, { status: 'configuration-failure', attempt, at: now });
    await addResult(env, date, 'failed', now);
    message.ack();
    return { status: 'configuration-failure' };
  }
  const subscription = body.subscription;
  if (!validRecord({ sub: subscription }) || await recipientId(subscription.endpoint) !== hash) {
    message.ack();
    return { status: 'invalid-recipient' };
  }
  const current = await readJson(env, STORE_KEYS.subs, []);
  const currentRecord = Array.isArray(current)
    ? current.find((record) => record?.sub?.endpoint === subscription.endpoint)
    : null;
  if (!currentRecord) {
    message.ack();
    return { status: 'unsubscribed' };
  }
  // The endpoint defines campaign membership, but use its latest keys in case
  // the browser refreshed the subscription after the Queue message was made.
  const activeSubscription = currentRecord.sub;

  const claimed = await claimDeliveryAttemptAtomic(env, key, attempt, {
    status: 'submitting',
    attempt,
    startedAt: now,
  }, DELIVERY_RECEIPT_TTL_SECONDS);
  if (!claimed) {
    const recovered = await markStaleSubmissionUncertainAtomic(env, key, attempt, now - STALE_SUBMISSION_MS, {
      status: 'uncertain', attempt, at: now, reason: 'stale-submission',
    }, DELIVERY_RECEIPT_TTL_SECONDS);
    if (recovered) {
      await addResult(env, date, 'uncertain', now);
      message.ack();
      return { status: 'uncertain' };
    }
    await updateCampaignAtomic(env, campaignKey(date), {}, { deduplicated: 1 }, CAMPAIGN_RESULT_TTL_SECONDS);
    message.ack();
    return { status: 'deduplicated' };
  }

  let response;
  try {
    const buildRequest = options.buildRequest || requestDetails;
    const details = await buildRequest(activeSubscription, campaign.payload, env, window.ttlSeconds, date);
    const transport = options.fetch || fetch;
    response = await transport(details.endpoint, {
      method: details.method || 'POST',
      headers: details.headers,
      body: details.body,
      signal: AbortSignal.timeout(Math.min(15000, Math.max(1000, window.ttlSeconds * 1000))),
    });
  } catch {
    const finishedAt = options.now == null ? Date.now() : now;
    await markReceipt(env, key, { status: 'uncertain', attempt, at: finishedAt });
    await addResult(env, date, 'uncertain', finishedAt);
    message.ack();
    return { status: 'uncertain' };
  }

  const finishedAt = options.now == null ? Date.now() : now;
  const result = classifyPushResult(response.status);
  if (result === 'accepted') {
    await markReceipt(env, key, { status: 'accepted', attempt, at: finishedAt });
    await addResult(env, date, 'accepted', finishedAt);
    message.ack();
    return { status: 'accepted', ttlSeconds: window.ttlSeconds };
  }
  if (result === 'expired-subscription') {
    await removeSubscriptionAtomic(env, STORE_KEYS.subs, activeSubscription.endpoint);
    await markReceipt(env, key, { status: 'expired-subscription', attempt, at: finishedAt });
    await addResult(env, date, 'failed', finishedAt, { increments: { expiredSubscriptionsRemoved: 1 } });
    message.ack();
    return { status: 'expired-subscription' };
  }
  if (result === 'retryable') {
    const retryAfterHeader = response.headers?.get?.('retry-after');
    const retryAfter = retryAfterHeader && /^\d+$/.test(retryAfterHeader) ? Number(retryAfterHeader) : null;
    const delaySeconds = retryDelaySeconds(attempt, retryAfter, now, window.expiresAt);
    if (delaySeconds != null) {
      try {
        await env.PUSH_DELIVERY_QUEUE.send({ ...body, attempt: attempt + 1 }, { delaySeconds });
      } catch {
        // The provider already gave an authoritative retryable response. If
        // publishing the successor fails, terminate this recipient instead of
        // letting infrastructure redelivery repeat the same provider attempt
        // beyond the campaign's strict one-plus-two submission budget.
        await markReceipt(env, key, { status: 'failed', attempt, at: finishedAt, reason: 'retry-publication-failed' });
        await addResult(env, date, 'failed', finishedAt);
        message.ack();
        return { status: 'failed' };
      }
      await markReceipt(env, key, { status: 'retryable', attempt, nextAttempt: attempt + 1, at: finishedAt });
      message.ack();
      return { status: 'retrying', delaySeconds };
    }
  }

  const terminal = result === 'configuration-failure' ? 'configuration-failure' : 'failed';
  await markReceipt(env, key, { status: terminal, attempt, at: finishedAt, providerStatus: response.status });
  await addResult(env, date, 'failed', finishedAt, terminal === 'configuration-failure'
    ? { patch: { configurationFailedAt: finishedAt, configurationStatus: response.status } }
    : undefined);
  message.ack();
  return { status: terminal };
}

export async function consumeDeliveryBatch(env, batch, options = {}) {
  const results = [];
  for (const message of batch.messages || []) results.push(await deliverQueueMessage(env, message, options));
  return results;
}

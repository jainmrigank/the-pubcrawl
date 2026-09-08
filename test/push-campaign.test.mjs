import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCampaign,
  campaignBounds,
  campaignKindForDate,
  classifyPushResult,
  deliveryWindow,
  retryDelaySeconds,
} from '../shared/push-campaign.mjs';

test('daily campaign rotates deterministically from the approved reference date', () => {
  assert.equal(campaignKindForDate('2026-09-07'), 'drink');
  assert.equal(campaignKindForDate('2026-09-08'), 'fact');
  assert.equal(campaignKindForDate('2026-09-09'), 'quiz');
  assert.equal(campaignKindForDate('2026-09-10'), 'drink');
});

test('delivery opens at 17:30 IST and expires before 18:00 without catch-up', () => {
  const { scheduledAt, expiresAt } = campaignBounds('2026-09-07');
  assert.equal(new Date(scheduledAt).toISOString(), '2026-09-07T12:00:00.000Z');
  assert.equal(new Date(expiresAt).toISOString(), '2026-09-07T12:30:00.000Z');
  assert.equal(deliveryWindow(scheduledAt - 1, '2026-09-07').reason, 'too-early');
  assert.equal(deliveryWindow(scheduledAt, '2026-09-07').ttlSeconds, 1800);
  assert.equal(deliveryWindow(expiresAt - 1001, '2026-09-07').ttlSeconds, 1);
  assert.equal(deliveryWindow(expiresAt, '2026-09-07').reason, 'expired');
  assert.equal(deliveryWindow(expiresAt + 86400000, '2026-09-07').eligible, false);
});

test('campaign content is stable for reruns and keeps established destinations', () => {
  const input = {
    cocktails: [{ id: 'one', name: 'Negroni', thumb: 'x' }, { id: 'two', name: 'Daiquiri', thumb: 'x' }],
    facts: ['Fact A', 'Fact B'],
  };
  const first = buildCampaign('2026-09-07', input);
  assert.deepEqual(buildCampaign('2026-09-07', input), first);
  assert.match(first.payload.url, /^\/#\/menu\?q=/);
  assert.equal(buildCampaign('2026-09-08', input).payload.url, '/#/menu');
  assert.equal(buildCampaign('2026-09-09', input).payload.url, '/#/quiz?daily=1');
});

test('retries never extend beyond the campaign expiry', () => {
  const now = Date.parse('2026-09-07T12:20:00Z');
  const expiry = Date.parse('2026-09-07T12:30:00Z');
  assert.equal(retryDelaySeconds(0, null, now, expiry), 60);
  assert.equal(retryDelaySeconds(1, null, now, expiry), 300);
  assert.equal(retryDelaySeconds(2, null, now, expiry), null);
  assert.equal(retryDelaySeconds(1, 700, now, expiry), null);
  assert.equal(retryDelaySeconds(0, 120, now, expiry), 120);
});

test('push response classes separate terminal, retryable, and configuration outcomes', () => {
  assert.equal(classifyPushResult(201), 'accepted');
  assert.equal(classifyPushResult(410), 'expired-subscription');
  assert.equal(classifyPushResult(403), 'configuration-failure');
  assert.equal(classifyPushResult(429), 'retryable');
  assert.equal(classifyPushResult(500), 'failed');
});

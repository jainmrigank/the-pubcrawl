import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readTrustedChannels } from '../scripts/shorts_common.mjs';
import {
  filterDeadShorts,
  limitShorts,
  MAX_SHORTS,
  MAX_SHORT_DURATION_SECONDS,
  validateShort,
  validateShortCatalogue,
  validateShortSession,
  recipeQueryHasPhoto,
} from '../server/shorts-schema.mjs';
import { SHORTS } from '../server/shorts.mjs';

const base = (overrides = {}) => ({
  id: 'abcdefghijk',
  title: 'A quick Negroni pour',
  channel: 'A trusted bartender',
  channelId: 'UC1234567890',
  lane: 'craft',
  rank: 1,
  addedAt: '2026-08-01',
  publishedAt: '2026-07-31T00:00:00Z',
  durationSeconds: 28,
  thumbnail: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',
  ...overrides,
});

test('validates the Shorts schema and rejects invalid lanes/durations', () => {
  assert.equal(validateShort(base()).ok, true);
  assert.equal(validateShort(base({ lane: 'random' })).ok, false);
  assert.equal(validateShort(base({ durationSeconds: 181 })).ok, false);
  assert.equal(validateShort(base({ durationSeconds: 0 })).ok, false);
});

test('catalogue validation catches duplicate IDs', () => {
  const result = validateShortCatalogue([base(), base({ rank: 2 })]);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /duplicate id/);
});

test('dead-video filtering removes only marked IDs', () => {
  const shorts = [base(), base({ id: 'lmnopqrstuv', rank: 2 })];
  assert.deepEqual(filterDeadShorts(shorts, { abcdefghijk: { dead: true } }).map((short) => short.id), ['lmnopqrstuv']);
});

test('catalogue capacity fails explicitly and rank repair never truncates', () => {
  const shorts = Array.from({ length: 5 }, (_, i) => base({ id: `id${String(i).padStart(9, '0')}`, rank: 99 }));
  assert.throws(() => limitShorts(shorts, 3), /5 entries.*3-entry limit/);
  const repaired = limitShorts(shorts, 5);
  assert.equal(repaired.length, 5);
  assert.deepEqual(repaired.map((short) => short.rank), [1, 2, 3, 4, 5]);
  assert.equal(shorts[0].rank, 99);
});

test('catalogue size and individual duration are separate shared policies', () => {
  assert.equal(MAX_SHORTS, 300);
  assert.equal(MAX_SHORT_DURATION_SECONDS, 180);
  const over = Array.from({ length: MAX_SHORTS + 1 }, (_, index) => base({
    id: `${index.toString(36).padStart(11, '0')}`,
    rank: index + 1,
  }));
  const result = validateShortCatalogue(over);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /cannot exceed 300/);
});

test('session metrics are capped, integer-only, and source-scoped', () => {
  const valid = validateShortSession({ source: 'landing', videosStarted: 2.9, advances: 1, shares: 0, recipeClicks: 1, autoplayFailures: 0 });
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.value, {
    source: 'landing',
    videosStarted: 2,
    advances: 1,
    shares: 0,
    recipeClicks: 1,
    autoplayFailures: 0,
    unavailableSkips: 0,
    bufferingEvents: 0,
    startupMsTotal: 0,
  });
  assert.equal(validateShortSession({ source: 'landing', videosStarted: 51 }).ok, false);
  assert.equal(validateShortSession({ source: 'landing', startupMsTotal: -1 }).ok, false);
  assert.equal(validateShortSession({ source: 'landing', startupMsTotal: 300000 }).ok, true);
  assert.equal(validateShortSession({ source: 'landing', startupMsTotal: 300001 }).ok, false);
  assert.equal(validateShortSession({ source: 'unknown' }).ok, false);
});

test('launch catalogue has at least 60 entries across all four lanes', () => {
  const catalogue = JSON.parse(readFileSync(join(process.cwd(), 'data', 'shorts.json'), 'utf8'));
  const result = validateShortCatalogue(catalogue, { min: 60 });
  assert.equal(result.ok, true, result.errors.join('; '));
  assert.equal(new Set(result.shorts.map((short) => short.lane)).size, 4);
});

test('reviewed expansion preserves the original catalogue and reaches every runtime entry', () => {
  const catalogue = JSON.parse(readFileSync(join(process.cwd(), 'data', 'shorts.json'), 'utf8')).shorts;
  const review = JSON.parse(readFileSync(join(process.cwd(), 'data', 'shorts-review-2026-09-10.json'), 'utf8'));
  const originalHash = createHash('sha256').update(catalogue.slice(0, 104).map((short) => short.id).join('\n')).digest('hex');
  const originalMetadataHash = createHash('sha256').update(JSON.stringify(catalogue.slice(0, 104))).digest('hex');

  assert.equal(originalHash, '94cbf58847b2742b95121c373f95d1c5062482f9ab824a1765c1ed2a1632f12f');
  assert.equal(originalMetadataHash, '6a80c5d6d5be4e563aa655ac489723d0178041772c188f545e287d1dbd1fdf27');
  assert.equal(catalogue.length, 204);
  assert.equal(SHORTS.length, 204);
  assert.equal(SHORTS.at(180)?.id, catalogue[180].id);
  assert.equal(SHORTS.at(-1)?.id, catalogue.at(-1).id);

  assert.equal(review.entries.length, 100);
  assert.deepEqual(review.summary, {
    'indian-comedy': 30,
    'international-comedy': 15,
    'indian-knowledge': 30,
    'international-knowledge': 25,
  });
  const reviewedIds = new Set(review.entries.map((entry) => entry.id));
  assert.equal(reviewedIds.size, 100);
  assert.deepEqual([...reviewedIds].sort(), catalogue.slice(104).map((entry) => entry.id).sort());
  assert.equal(review.entries.every((entry) => entry.status === 'accepted'), true);

  const channelCounts = review.entries.reduce((counts, entry) => {
    counts.set(entry.channelId, (counts.get(entry.channelId) ?? 0) + 1);
    return counts;
  }, new Map());
  assert.equal(channelCounts.size >= review.creatorPolicy.minimumDistinctCreators, true);
  assert.equal(Math.max(...channelCounts.values()) <= review.creatorPolicy.maximumAcceptedPerChannel, true);
});

test('recipe-linked Shorts resolve to a photographed recipe', () => {
  assert.equal(recipeQueryHasPhoto('Margarita'), true);
  assert.equal(recipeQueryHasPhoto('A drink with no photograph'), false);
  assert.equal(validateShortCatalogue([base({ recipeQuery: 'A drink with no photograph' })]).ok, false);
});

test('Shorts-specific trusted channels survive the Watch-derived channel list', () => {
  const supplement = JSON.parse(readFileSync(join(process.cwd(), 'data', 'shorts-channels.json'), 'utf8')).channels;
  const trusted = readTrustedChannels();
  for (const channel of supplement) {
    assert.equal(trusted.filter((candidate) => candidate.id === channel.id).length, 1);
    assert.equal(trusted.find((candidate) => candidate.id === channel.id)?.name, channel.name);
  }
});

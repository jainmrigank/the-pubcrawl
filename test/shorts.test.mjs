import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  filterDeadShorts,
  limitShorts,
  validateShort,
  validateShortCatalogue,
  validateShortSession,
  recipeQueryHasPhoto,
} from '../server/shorts-schema.mjs';

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

test('catalogue limit keeps the cap and repairs ranks', () => {
  const shorts = Array.from({ length: 5 }, (_, i) => base({ id: `id${String(i).padStart(9, '0')}`, rank: 99 }));
  const limited = limitShorts(shorts, 3);
  assert.equal(limited.length, 3);
  assert.deepEqual(limited.map((short) => short.rank), [1, 2, 3]);
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

test('recipe-linked Shorts resolve to a photographed recipe', () => {
  assert.equal(recipeQueryHasPhoto('Margarita'), true);
  assert.equal(recipeQueryHasPhoto('A drink with no photograph'), false);
  assert.equal(validateShortCatalogue([base({ recipeQuery: 'A drink with no photograph' })]).ok, false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampShortsRate,
  clampShortsVolume,
  defaultShortsRatePreference,
  defaultShortsSoundPreference,
  healShortsSoundPreference,
  parseShortsRatePreference,
  parseShortsSoundPreference,
  readShortsRatePreference,
  readShortsSoundPreference,
  SHORTS_RATE_SESSION_KEY,
  SHORTS_SOUND_NORMALIZED_KEY,
  SHORTS_SOUND_SESSION_KEY,
  SHORTS_SOUND_ZERO_INTENT_KEY,
  writeShortsRatePreference,
  writeShortsSoundPreference,
} from '../src/shortsSoundPolicy.ts';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test('fresh sound sessions are muted and volume is clamped without changing intent', () => {
  assert.deepEqual(defaultShortsSoundPreference(), { version: 1, desiredAudible: false, volume: 100 });
  assert.equal(clampShortsVolume(-5), 0);
  assert.equal(clampShortsVolume(38.4), 38);
  assert.equal(clampShortsVolume(145), 100);
  assert.equal(clampShortsVolume(Number.NaN), 100);
  assert.deepEqual(parseShortsSoundPreference(null), defaultShortsSoundPreference());
  assert.deepEqual(parseShortsSoundPreference('{"version":2,"desiredAudible":true,"volume":55}'), defaultShortsSoundPreference());
  assert.deepEqual(parseShortsSoundPreference('{"version":1,"desiredAudible":true,"volume":145}'), {
    version: 1,
    desiredAudible: true,
    volume: 100,
  });
});

test('the legacy audible-at-zero state is healed once, while a deliberate zero remains valid afterward', () => {
  const storage = memoryStorage({
    [SHORTS_SOUND_SESSION_KEY]: JSON.stringify({ version: 1, desiredAudible: true, volume: 0 }),
  });
  assert.deepEqual(readShortsSoundPreference(storage), { version: 1, desiredAudible: true, volume: 100 });
  assert.equal(storage.values.get(SHORTS_SOUND_NORMALIZED_KEY), '1');
  assert.equal(storage.values.get(SHORTS_SOUND_SESSION_KEY), JSON.stringify({ version: 1, desiredAudible: true, volume: 100 }));

  const deliberate = writeShortsSoundPreference({ version: 1, desiredAudible: true, volume: 0 }, storage);
  assert.deepEqual(deliberate, { version: 1, desiredAudible: true, volume: 0 });
  assert.deepEqual(readShortsSoundPreference(storage), deliberate);
  assert.deepEqual(healShortsSoundPreference(deliberate), { version: 1, desiredAudible: true, volume: 100 });
});

test('a normalized marker from an older release cannot preserve an unusable audible zero', () => {
  const storage = memoryStorage({
    [SHORTS_SOUND_SESSION_KEY]: JSON.stringify({ version: 1, desiredAudible: true, volume: 0 }),
    [SHORTS_SOUND_NORMALIZED_KEY]: '1',
  });
  assert.deepEqual(readShortsSoundPreference(storage), { version: 1, desiredAudible: true, volume: 100 });
  assert.equal(storage.values.has(SHORTS_SOUND_ZERO_INTENT_KEY), false);
});

test('sound writes retain the desired audible flag and normalized level', () => {
  const storage = memoryStorage();
  const enabled = writeShortsSoundPreference({ version: 1, desiredAudible: true, volume: 72.4 }, storage);
  assert.deepEqual(enabled, { version: 1, desiredAudible: true, volume: 72 });
  assert.deepEqual(readShortsSoundPreference(storage), enabled);
  const muted = writeShortsSoundPreference({ version: 1, desiredAudible: false, volume: -1 }, storage);
  assert.deepEqual(muted, { version: 1, desiredAudible: false, volume: 0 });
  assert.deepEqual(readShortsSoundPreference(storage), muted);
});

test('rate preferences have a stable one-to-two range and session storage key', () => {
  assert.deepEqual(defaultShortsRatePreference(), { version: 1, preferredRate: 1 });
  assert.equal(clampShortsRate(0), 1);
  assert.equal(clampShortsRate(0.1), 0.25);
  assert.equal(clampShortsRate(1.5), 1.5);
  assert.equal(clampShortsRate(4), 2);
  assert.deepEqual(parseShortsRatePreference('{"version":1,"preferredRate":1.5}'), { version: 1, preferredRate: 1.5 });
  assert.deepEqual(parseShortsRatePreference('{"version":2,"preferredRate":1.5}'), defaultShortsRatePreference());

  const storage = memoryStorage();
  const written = writeShortsRatePreference({ version: 1, preferredRate: 4 }, storage);
  assert.deepEqual(written, { version: 1, preferredRate: 2 });
  assert.equal(storage.values.get(SHORTS_RATE_SESSION_KEY), JSON.stringify(written));
  assert.deepEqual(readShortsRatePreference(storage), written);
});

test('storage failures fall back to safe defaults instead of breaking Shorts', () => {
  const broken = {
    getItem() { throw new Error('storage unavailable'); },
    setItem() { throw new Error('storage unavailable'); },
  };
  assert.deepEqual(readShortsSoundPreference(broken), defaultShortsSoundPreference());
  assert.deepEqual(readShortsRatePreference(broken), defaultShortsRatePreference());
  assert.deepEqual(writeShortsSoundPreference({ version: 1, desiredAudible: true, volume: 50 }, broken), {
    version: 1,
    desiredAudible: true,
    volume: 50,
  });
  assert.deepEqual(writeShortsRatePreference({ version: 1, preferredRate: 1.5 }, broken), {
    version: 1,
    preferredRate: 1.5,
  });
});

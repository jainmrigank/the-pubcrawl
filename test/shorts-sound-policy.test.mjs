import test from 'node:test';
import assert from 'node:assert/strict';
import {
  audibleAuthorizationMatches,
  claimShortsStart,
  createShortsStartCommand,
  defaultShortsSoundPreference,
  markShortsStartProgress,
  mutedFallbackAuthorization,
  nextShortsStartAttempt,
  parseShortsSoundPreference,
  playerReadyForStart,
  readShortsSoundPreference,
  resetShortsStartForManualRecovery,
  SHORTS_SOUND_SESSION_KEY,
  shouldRevokeShortsLease,
  startModeForGesture,
  writeShortsSoundPreference,
} from '../src/shortsSoundPolicy.ts';

const authorization = { index: 4, generation: 9, mode: 'gesture-audible', fallbackUsed: false };

test('sound preference and gesture jointly choose the start mode', () => {
  assert.equal(startModeForGesture(true, true), 'muted-autoplay');
  assert.equal(startModeForGesture(false, false), 'muted-autoplay');
  assert.equal(startModeForGesture(false, true), 'gesture-audible');
});

test('only cued/paused/buffering/playing players are eligible for a direct start', () => {
  for (const state of [1, 2, 3, 5]) assert.equal(playerReadyForStart(state), true);
  for (const state of [-1, 0, 4, 99]) assert.equal(playerReadyForStart(state), false);
});

test('audible authorization is scoped to the desired lease and preference', () => {
  assert.equal(audibleAuthorizationMatches(authorization, 4, 9, false), true);
  assert.equal(audibleAuthorizationMatches(authorization, 3, 9, false), false);
  assert.equal(audibleAuthorizationMatches(authorization, 4, 8, false), false);
  assert.equal(audibleAuthorizationMatches(authorization, 4, 9, true), false);
});

test('muted fallback is one-shot and preserves the desired-sound preference', () => {
  const fallback = mutedFallbackAuthorization(authorization, 4, 9);
  assert.deepEqual(fallback, { index: 4, generation: 9, mode: 'muted-autoplay', fallbackUsed: true });
  assert.equal(mutedFallbackAuthorization(fallback, 4, 9), null);
  assert.equal(mutedFallbackAuthorization(authorization, 3, 9), null);
  assert.equal(mutedFallbackAuthorization(authorization, 4, 8), null);
});

test('a new session starts muted and persisted native sound is normalized', () => {
  assert.deepEqual(defaultShortsSoundPreference(), { version: 1, desiredAudible: false, volume: 100 });
  assert.deepEqual(parseShortsSoundPreference(null), defaultShortsSoundPreference());
  assert.deepEqual(parseShortsSoundPreference('{"version":1,"desiredAudible":true,"volume":145}'), {
    version: 1,
    desiredAudible: true,
    volume: 100,
  });
  assert.deepEqual(parseShortsSoundPreference('{"version":2,"desiredAudible":true,"volume":55}'), defaultShortsSoundPreference());

  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const written = writeShortsSoundPreference({ version: 1, desiredAudible: true, volume: -8 }, storage);
  assert.deepEqual(written, { version: 1, desiredAudible: true, volume: 0 });
  assert.equal(values.has(SHORTS_SOUND_SESSION_KEY), true);
  assert.deepEqual(readShortsSoundPreference(storage), written);
});

test('one initial and one controlled retry may claim a lease command', () => {
  let command = createShortsStartCommand('short-1', 2, 7, true);
  let claim = claimShortsStart(command, 'initial');
  assert.equal(claim.allowed, true);
  command = claim.command;
  assert.equal(claimShortsStart(command, 'initial').allowed, false);

  claim = claimShortsStart(command, 'retry');
  assert.equal(claim.allowed, true);
  command = claim.command;
  assert.equal(claimShortsStart(command, 'retry').allowed, false);
});

test('a genuine manual gesture can renew an exhausted or stalled command', () => {
  let command = createShortsStartCommand('short-gesture', 6, 12, false);
  command = claimShortsStart(command, 'initial').command;
  command = claimShortsStart(command, 'retry').command;
  assert.equal(nextShortsStartAttempt(command), null);

  const renewed = resetShortsStartForManualRecovery(command);
  assert.equal(nextShortsStartAttempt(renewed), 'initial');
  assert.equal(claimShortsStart(renewed, 'initial').allowed, true);

  const progressed = markShortsStartProgress(command);
  const recoveredAfterProgress = resetShortsStartForManualRecovery(progressed);
  assert.equal(nextShortsStartAttempt(recoveredAfterProgress), 'initial');
  assert.equal(claimShortsStart(recoveredAfterProgress, 'initial').allowed, true);
});

test('error recovery selects initial before any issued command and retry afterward', () => {
  let command = createShortsStartCommand('short-error', 1, 3, false);
  assert.equal(nextShortsStartAttempt(undefined), 'initial');
  assert.equal(nextShortsStartAttempt(command), 'initial');
  command = claimShortsStart(command, 'initial').command;
  assert.equal(nextShortsStartAttempt(command), 'retry');
  command = claimShortsStart(command, 'retry').command;
  assert.equal(nextShortsStartAttempt(command), null);
});

test('playing, buffering, or time advancement cancels every later retry', () => {
  let command = createShortsStartCommand('short-2', 3, 8, false);
  command = claimShortsStart(command, 'initial').command;
  command = markShortsStartProgress(command);
  assert.equal(command.progressed, true);
  assert.equal(claimShortsStart(command, 'initial').allowed, false);
  assert.equal(claimShortsStart(command, 'retry').allowed, false);
});

test('same-card snap correction retains its lease until a real destination wins', () => {
  assert.equal(shouldRevokeShortsLease(4, 4, 1, 844), false);
  assert.equal(shouldRevokeShortsLease(4, 4, 294, 844), false);
  assert.equal(shouldRevokeShortsLease(4, 4, 296, 844), true);
  assert.equal(shouldRevokeShortsLease(4, 5, 1, 844), true);
});

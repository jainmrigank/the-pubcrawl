import test from 'node:test';
import assert from 'node:assert/strict';
import {
  audibleAuthorizationMatches,
  mutedFallbackAuthorization,
  playerReadyForStart,
  startModeForGesture,
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

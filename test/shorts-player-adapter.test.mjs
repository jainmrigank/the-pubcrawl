import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMutedSound, applySound, YT_PLAYER_STATES } from '../src/shortsPlayer.ts';

function fakePlayer() {
  const events = [];
  return {
    events,
    setVolume(value) { events.push(['setVolume', value]); },
    mute() { events.push(['mute']); },
    unMute() { events.push(['unMute']); },
  };
}

test('the active muted policy sets the retained volume and mutes without pausing', () => {
  const player = fakePlayer();
  applyMutedSound(player, 138);
  assert.deepEqual(player.events, [['setVolume', 100], ['mute']]);
  assert.equal(player.events.some(([method]) => method === 'unMute'), false);
});

test('an eligible audible gesture primes, unmutes, and restores the same volume in one command sequence', () => {
  const player = fakePlayer();
  applySound(player, false, 72.4);
  assert.deepEqual(player.events, [['setVolume', 72], ['unMute'], ['setVolume', 72]]);
});

test('muted application sound never calls unMute even at the minimum level', () => {
  const player = fakePlayer();
  applySound(player, true, 0);
  assert.deepEqual(player.events, [['setVolume', 0], ['mute']]);
});

test('YouTube state constants remain aligned with the documented iframe API', () => {
  assert.deepEqual(YT_PLAYER_STATES, {
    UNSTARTED: -1,
    ENDED: 0,
    PLAYING: 1,
    PAUSED: 2,
    BUFFERING: 3,
    CUED: 5,
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pauseOthers,
  playbackMode,
  poolWindow,
  preparePlayerSound,
  soundPreference,
  startupFacadeState,
} from '../server/shorts-playback.mjs';

test('directional five-player pool keeps one previous and three upcoming players', () => {
  assert.deepEqual(poolWindow(0, 8), [0, 1, 2, 3]);
  assert.deepEqual(poolWindow(4, 8), [3, 4, 5, 6, 7]);
  assert.deepEqual(poolWindow(7, 8), [3, 4, 5, 6, 7]);
  assert.deepEqual(poolWindow(4, 8, 'pool', 'backward'), [1, 2, 3, 4, 5]);
  assert.deepEqual(poolWindow(12, 30, 'pool', 'forward', 15), [12, 15, 16, 17, 18]);
  assert.deepEqual(poolWindow(12, 30, 'pool', 'backward', 15), [12, 13, 14, 15, 16]);
  assert.deepEqual(poolWindow(4, 8, 'balanced'), [3, 4, 5]);
  assert.deepEqual(poolWindow(1, 8, 'pool', 'forward', 4), [1, 4, 5, 6, 7]);
  assert.deepEqual(poolWindow(4, 8, 'manual'), [4]);
});

test('save-data, reduced motion, and slow connections use one-player fallback', () => {
  assert.equal(playbackMode({ saveData: true }), 'manual');
  assert.equal(playbackMode({ reducedMotion: true }), 'manual');
  assert.equal(playbackMode({ effectiveType: '2g' }), 'manual');
  assert.equal(playbackMode({ effectiveType: '3g' }), 'balanced');
  assert.equal(playbackMode(), 'pool');
});

test('only the active player remains playing', () => {
  const paused = [];
  const players = new Map([
    [2, { pauseVideo: () => paused.push(2) }],
    [3, { pauseVideo: () => paused.push(3) }],
    [4, { pauseVideo: () => paused.push(4) }],
  ]);
  pauseOthers(players, 3);
  assert.deepEqual(paused, [2, 4]);
});

test('prepared sound policy keeps every prepared player muted and paused', () => {
  const events = [];
  const players = [
    { setVolume: (v) => events.push(['volume', v]), mute: () => events.push(['mute']), pauseVideo: () => events.push(['pause']), unMute: () => events.push(['unmute']) },
    { setVolume: (v) => events.push(['volume', v]), mute: () => events.push(['mute']), pauseVideo: () => events.push(['pause']), unMute: () => events.push(['unmute']) },
  ];
  assert.deepEqual(preparePlayerSound(players, 138), { muted: true, volume: 100 });
  assert.deepEqual(events, [
    ['volume', 100], ['mute'], ['pause'],
    ['volume', 100], ['mute'], ['pause'],
  ]);
  assert.equal(events.some(([event]) => event === 'unmute'), false);
  assert.deepEqual(soundPreference({ isMuted: () => true, getVolume: () => 12 }, { muted: false, volume: 38 }), { muted: true, volume: 38 });
  assert.deepEqual(soundPreference({ isMuted: () => false, getVolume: () => 67 }), { muted: false, volume: 67 });
});

test('startup buffering stays behind the facade until playback advances', () => {
  let state = startupFacadeState(undefined, { state: 'playing', currentTime: 0, stable: false });
  assert.deepEqual(state, { revealed: false, confirmed: false });
  state = startupFacadeState(state, { state: 'buffering', currentTime: 0 });
  assert.deepEqual(state, { revealed: false, confirmed: false });
  state = startupFacadeState(state, { state: 'playing', currentTime: 0.16, stable: true });
  assert.deepEqual(state, { revealed: true, confirmed: true });
  state = startupFacadeState(state, { state: 'buffering', currentTime: 2.4 });
  assert.deepEqual(state, { revealed: true, confirmed: true });
  state = startupFacadeState(state, { state: 'buffering', currentTime: 0 });
  assert.deepEqual(state, { revealed: true, confirmed: true });
});

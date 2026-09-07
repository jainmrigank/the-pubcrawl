import test from 'node:test';
import assert from 'node:assert/strict';
import { ShortsController } from '../src/shortsController.ts';

function fixture(t, sound = { version: 1, desiredAudible: false, volume: 100 }) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const calls = [], writes = [], samples = [], pending = [];
  const native = { id: 'first', state: 5, time: 0, muted: false, volume: 0, rate: 1 };
  const player = {
    getVideoUrl: () => `https://www.youtube.com/watch?v=${native.id}`,
    getPlayerState: () => native.state, getCurrentTime: () => native.time,
    isMuted: () => native.muted, getVolume: () => native.volume,
    getPlaybackRate: () => native.rate, getAvailablePlaybackRates: () => [1, 1.5, 2],
    setPlaybackRate(value) { calls.push(['rate', value]); pending.push(() => { native.rate = value; }); },
    setVolume(value) { calls.push(['volume', value]); pending.push(() => { native.volume = value; }); },
    mute() { calls.push(['mute']); pending.push(() => { native.muted = true; }); },
    unMute() { calls.push(['unmute']); pending.push(() => { native.muted = false; }); },
    playVideo() { calls.push(['play', native.id]); },
    pauseVideo() { calls.push(['pause', native.id]); native.state = 2; },
    seekTo(value) { calls.push(['seek', value]); native.time = value; },
    loadVideoById(id) {
      calls.push(['load', id]);
      native.id = id; native.state = 5; native.time = 0; native.muted = false; native.volume = 0;
    },
  };
  const control = new ShortsController({ sound, preferredRate: 1, now: Date.now,
    onSound: (s) => writes.push(s), onRate() {}, onSnapshot() {}, onMotion: (s) => samples.push(s),
    onFailure() {}, onBuffering() {},
  });
  t.after(() => control.dispose());
  control.select({ videoId: 'first', index: 0 });
  control.attach(player);
  const acknowledge = () => {
    pending.splice(0).forEach((command) => command());
    native.state = 1; native.time = 0.2;
    control.onState(player, 1);
    control.sample();
  };
  return { control, native, player, calls, writes, samples, acknowledge };
}

test('active muted startup retains volume without an unmute or extra pause', (t) => {
  const f = fixture(t);
  assert.deepEqual(f.calls, [['volume', 100], ['mute'], ['play', 'first']]);
});

test('audible activation applies the desired volume and unmutes before the initial play', (t) => {
  const f = fixture(t, { version: 1, desiredAudible: true, volume: 72 });
  assert.deepEqual(f.calls, [['volume', 72], ['unmute'], ['play', 'first']]);
});

test('intentional zero with muted sound stays muted through navigation', (t) => {
  const f = fixture(t, { version: 1, desiredAudible: false, volume: 0 });
  f.acknowledge();
  f.control.select({ videoId: 'second', index: 1 });
  f.acknowledge();
  assert.equal(f.calls.some(([method]) => method === 'unmute'), false);
  assert.equal(f.native.volume, 0);
  assert.equal(f.native.muted, true);
});

test('delayed application volume/mute acknowledgments never become user preference', (t) => {
  const f = fixture(t);
  // Exceed the retired fixed 700ms suppression window while native reads still
  // return the load-time unmuted-at-zero state.
  f.native.state = 1; f.native.time = 0.2;
  t.mock.timers.tick(1000);
  f.control.captureNativeSound();
  assert.deepEqual(f.writes, []);
  assert.equal(f.control.snapshot().volume, 100);
  f.acknowledge();
  assert.equal(f.control.snapshot().soundAcknowledged, true);
  f.native.muted = false; f.native.volume = 84;
  f.control.captureNativeSound();
  assert.deepEqual(f.writes.at(-1), { version: 1, desiredAudible: true, volume: 84 });
  f.control.select({ videoId: 'second', index: 1 });
  assert.equal(f.control.snapshot().volume, 84);
  f.control.captureNativeSound();
  assert.equal(f.writes.length, 1);
  f.acknowledge();
  assert.equal(f.native.volume, 84);
  assert.equal(f.native.muted, false);
});

test('one activation command, same selection no-op, and stale state ignored', (t) => {
  const f = fixture(t);
  f.acknowledge();
  f.control.select({ videoId: 'first', index: 0 });
  assert.equal(f.calls.filter(([m]) => m === 'play').length, 1);
  f.control.select({ videoId: 'second', index: 1 });
  f.control.select({ videoId: 'second', index: 1 });
  assert.deepEqual(f.calls.filter(([m]) => m === 'load'), [['load', 'second']]);
  f.native.state = 1; f.native.time = 0.3;
  f.control.onState(f.player, 0); // delayed ENDED while native state is PLAYING
  assert.equal(f.calls.some(([m]) => m === 'seek'), false);
  f.native.id = 'first';
  f.control.onBlocked(f.player);
  assert.equal(f.calls.filter(([m]) => m === 'play').length, 1);
});

test('a blocked audible start recovers once muted without erasing desired sound', (t) => {
  const f = fixture(t, { version: 1, desiredAudible: true, volume: 72 });
  f.native.state = 2;
  f.control.onBlocked(f.player);
  assert.equal(f.calls.filter(([m]) => m === 'play').length, 2);
  f.control.onBlocked(f.player);
  assert.equal(f.calls.filter(([m]) => m === 'play').length, 2);
  assert.equal(f.control.snapshot().desiredAudible, true);
  assert.equal(f.control.snapshot().volume, 72);
  f.acknowledge();
  assert.deepEqual(f.writes, []);
  assert.equal(f.native.muted, true);
});

test('manual pause survives a hide/show cycle without replay or reload', (t) => {
  const f = fixture(t);
  f.acknowledge();
  f.native.state = 2;
  f.control.onState(f.player, 2);
  f.control.onBlocked(f.player); // delayed notification cannot undo native pause
  f.control.suspend('hidden', true);
  f.control.suspend('hidden', false);
  t.mock.timers.tick(2000);
  assert.equal(f.calls.filter(([m]) => m === 'play').length, 1);
  assert.equal(f.calls.some(([m]) => m === 'load'), false);
});

test('looping has one seek/restart and never creates another startup sample', (t) => {
  const f = fixture(t);
  f.acknowledge();
  f.native.state = 0;
  f.control.onState(f.player, 0);
  f.control.onState(f.player, 0);
  t.mock.timers.tick(120);
  assert.equal(f.calls.filter(([m]) => m === 'seek').length, 1);
  assert.equal(f.calls.filter(([m]) => m === 'play').length, 2);
  assert.equal(f.calls.some(([m]) => m === 'load'), false);
  f.acknowledge();
  assert.equal(f.samples.length, 1);
});

test('suspension reasons compose and a previous activation cannot retry', (t) => {
  const f = fixture(t);
  f.control.suspend('overlay', true);
  f.control.suspend('hidden', true);
  f.control.select({ videoId: 'second', index: 1 });
  f.control.suspend('overlay', false);
  t.mock.timers.tick(2000);
  assert.equal(f.calls.some(([m]) => m === 'load'), false);
  f.control.suspend('hidden', false);
  assert.deepEqual(f.calls.filter(([m]) => m === 'load'), [['load', 'second']]);
  f.acknowledge();
  t.mock.timers.tick(2000);
  assert.equal(f.calls.filter(([m]) => m === 'play').length, 1);
});

test('a silent cued startup gets one recovery then a bounded failure', (t) => {
  const f = fixture(t);
  t.mock.timers.tick(1500);
  assert.equal(f.calls.filter(([method]) => method === 'play').length, 2);
  t.mock.timers.tick(1500);
  assert.equal(f.control.snapshot().phase, 'blocked');
  t.mock.timers.tick(5000);
  assert.equal(f.calls.filter(([method]) => method === 'play').length, 2);
});

test('buffering and progress cancel startup retry without changing player identity', (t) => {
  const f = fixture(t);
  f.native.state = 3;
  f.control.onState(f.player, 3);
  t.mock.timers.tick(5000);
  assert.equal(f.calls.filter(([method]) => method === 'play').length, 1);
  f.acknowledge();
  const generation = f.control.snapshot().generation;
  f.native.state = 3;
  f.control.onState(f.player, 3);
  assert.equal(f.control.snapshot().motion, true);
  assert.equal(f.control.snapshot().generation, generation);
  assert.equal(f.calls.some(([method]) => method === 'load' || method === 'seek'), false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LANDING_PREVIEW_DURATION_MS,
  LANDING_PREVIEW_STARTUP_TIMEOUT_MS,
  LandingPreviewController,
} from '../src/landingPreviewController.ts';
import {
  nextEligiblePreview,
  previewVisibilityRatio,
  selectLandingShorts,
} from '../src/landingPreviewPolicy.ts';

function playerFixture() {
  const calls = [];
  const native = { time: 0 };
  const player = {
    setVolume(value) { calls.push(['volume', value]); },
    mute() { calls.push(['mute']); },
    playVideo() { calls.push(['play']); },
    pauseVideo() { calls.push(['pause']); },
    getCurrentTime() { return native.time; },
  };
  return { calls, native, player };
}

test('landing Shorts selection is stable, ranked, unique, and limited to six', () => {
  const rows = [
    { id: 'ccccccccccc', rank: 3 }, { id: 'aaaaaaaaaaa', rank: 1 }, { id: 'aaaaaaaaaaa', rank: 2 },
    { id: '', rank: 4 }, { id: 'bbbbbbbbbbb', rank: 2 }, { id: 'ddddddddddd', rank: 4 },
    { id: 'eeeeeeeeeee', rank: 5 }, { id: 'fffffffffff', rank: 6 }, { id: 'ggggggggggg', rank: 7 },
  ];
  assert.deepEqual(selectLandingShorts(rows).map((row) => row.id), [
    'aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd', 'eeeeeeeeeee', 'fffffffffff',
  ]);
});

test('preview visibility uses the intersection of viewport and horizontal rail', () => {
  const viewport = { top: 0, left: 0, right: 400, bottom: 800, width: 400, height: 800 };
  const rail = { top: 100, left: 20, right: 380, bottom: 700, width: 360, height: 600 };
  const full = { top: 100, left: 20, right: 220, bottom: 500, width: 200, height: 400 };
  const half = { top: 100, left: -80, right: 120, bottom: 500, width: 200, height: 400 };
  assert.equal(previewVisibilityRatio(full, viewport, rail), 1);
  assert.equal(previewVisibilityRatio(half, viewport, rail), 0.5);
  assert.equal(nextEligiblePreview(['a', 'b'], new Set(['a'])), 'b');
});

test('controller issues one muted start and counts 2.5 seconds of real progress', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const completed = [];
  const progress = [];
  const controller = new LandingPreviewController({
    onComplete: (id) => completed.push(id),
    onProgress: (id, ms) => progress.push([id, ms]),
  });
  const fixture = playerFixture();
  const token = controller.activate('one');
  assert.equal(controller.attach(token, fixture.player), true);
  assert.deepEqual(fixture.calls, [['volume', 100], ['mute'], ['play']]);

  for (let index = 0; index < 15; index += 1) {
    fixture.native.time += 0.2;
    t.mock.timers.tick(200);
  }
  assert.deepEqual(completed, ['one']);
  assert.equal(controller.snapshot().playedMs, LANDING_PREVIEW_DURATION_MS);
  assert.equal(fixture.calls.filter(([method]) => method === 'play').length, 1);
  assert.equal(fixture.calls.filter(([method]) => method === 'pause').length, 1);
  assert.ok(progress.length > 0);
});

test('stale player callbacks cannot affect a replacement activation', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const controller = new LandingPreviewController();
  const first = playerFixture();
  const firstToken = controller.activate('one');
  controller.attach(firstToken, first.player);
  controller.deactivate();
  const second = playerFixture();
  const secondToken = controller.activate('two');
  controller.attach(secondToken, second.player);
  controller.handleAutoplayBlocked(firstToken, first.player);
  assert.equal(controller.snapshot().videoId, 'two');
  assert.equal(controller.snapshot().phase, 'loading');
  assert.equal(second.calls.filter(([method]) => method === 'play').length, 1);
});

test('a player becoming ready during suspension is retained and starts only after resume', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const controller = new LandingPreviewController();
  const fixture = playerFixture();
  const token = controller.activate('prepared');
  controller.suspend();
  assert.equal(controller.attach(token, fixture.player), true);
  assert.deepEqual(fixture.calls, [['volume', 100], ['mute']]);
  controller.resume();
  assert.equal(fixture.calls.filter(([method]) => method === 'play').length, 1);
});

test('startup failure is bounded and a user pause is not automatically overridden', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const failed = [];
  const manual = [];
  const controller = new LandingPreviewController({
    onFailure: (id) => failed.push(id),
    onManualPause: (id) => manual.push(id),
  });
  const first = playerFixture();
  const token = controller.activate('timeout');
  controller.attach(token, first.player);
  t.mock.timers.tick(LANDING_PREVIEW_STARTUP_TIMEOUT_MS);
  assert.deepEqual(failed, ['timeout']);
  assert.equal(first.calls.filter(([method]) => method === 'play').length, 1);

  const second = playerFixture();
  const secondToken = controller.activate('manual');
  controller.attach(secondToken, second.player);
  controller.handleState(secondToken, second.player, 1);
  second.native.time = 0.3;
  t.mock.timers.tick(200);
  second.native.time = 0.6;
  t.mock.timers.tick(200);
  controller.handleState(secondToken, second.player, 2);
  assert.deepEqual(manual, ['manual']);
  t.mock.timers.tick(10_000);
  assert.equal(second.calls.filter(([method]) => method === 'play').length, 1);
});

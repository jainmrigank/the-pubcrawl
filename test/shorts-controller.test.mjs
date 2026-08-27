import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createShortsControllerState,
  leaseMatches,
  nearestShortIndex,
  shortsPreparationPriority,
  shortsPreparationWindow,
  transitionShortsController,
} from '../server/shorts-controller.mjs';

test('scroll start revokes the old lease and settle grants only the destination', () => {
  let state = transitionShortsController(createShortsControllerState(4), { type: 'route-enter', index: 4 });
  const oldGeneration = state.generation;
  state = transitionShortsController(state, { type: 'scroll-start', direction: 'forward' });
  assert.equal(state.phase, 'scrolling');
  assert.equal(state.lease, null);
  assert.ok(state.generation > oldGeneration);
  state = transitionShortsController(state, { type: 'scroll-intent', index: 11, direction: 'forward' });
  state = transitionShortsController(state, { type: 'scroll-settle', index: 11 });
  assert.equal(state.lease.index, 11);
  assert.equal(leaseMatches(state, 11, state.generation), true);
  assert.equal(leaseMatches(state, 4, oldGeneration), false);
});

test('duplicate mobile settle and late snap intent preserve the active autoplay lease', () => {
  let state = transitionShortsController(createShortsControllerState(0), { type: 'route-enter', index: 0 });
  const lease = state.lease;
  const generation = state.generation;

  state = transitionShortsController(state, { type: 'scroll-settle', index: 0 });
  assert.equal(state.generation, generation);
  assert.deepEqual(state.lease, lease);

  state = transitionShortsController(state, { type: 'scroll-intent', index: 1, direction: 'forward' });
  assert.equal(state.phase, 'idle');
  assert.equal(state.generation, generation);
  assert.deepEqual(state.lease, lease);
});

test('snap-back corrections do not change a committed destination', () => {
  let state = transitionShortsController(createShortsControllerState(2), { type: 'route-enter', index: 2 });
  state = transitionShortsController(state, { type: 'scroll-start', direction: 'forward' });
  state = transitionShortsController(state, { type: 'scroll-intent', index: 8, direction: 'forward' });
  state = transitionShortsController(state, { type: 'scroll-intent', index: 7, direction: 'forward' });
  state = transitionShortsController(state, { type: 'scroll-settle', index: 7 });
  assert.equal(state.settledIndex, 7);
  assert.equal(state.lease.index, 7);
});

test('forward and reverse windows prioritize exact fling targets', () => {
  assert.deepEqual(shortsPreparationWindow(4, 10, 30, 'pool', 'forward'), [4, 10, 11, 12, 13]);
  assert.deepEqual(shortsPreparationWindow(10, 4, 30, 'pool', 'backward'), [1, 2, 3, 4, 10]);
  assert.equal(shortsPreparationPriority(10, 4, 10, 'forward'), 0);
  assert.equal(shortsPreparationPriority(9, 10, 10, 'backward'), 1);
});

test('nearest card uses actual geometry rather than instantaneous direction', () => {
  assert.equal(nearestShortIndex([0, 842, 1684, 2526], 1669), 2);
  assert.equal(nearestShortIndex([0, 842, 1684, 2526], 1701), 2);
});

test('rapid reversals keep one lease and stale callbacks are rejected', () => {
  let state = transitionShortsController(createShortsControllerState(0), { type: 'route-enter', index: 0 });
  state = transitionShortsController(state, { type: 'scroll-start', direction: 'forward' });
  state = transitionShortsController(state, { type: 'scroll-intent', index: 7, direction: 'forward' });
  state = transitionShortsController(state, { type: 'scroll-intent', index: 3, direction: 'backward' });
  state = transitionShortsController(state, { type: 'scroll-settle', index: 3 });
  assert.equal(leaseMatches(state, 7, state.generation - 1), false);
  assert.equal(leaseMatches(state, 3, state.generation), true);
});

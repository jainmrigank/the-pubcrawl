import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createShortsControllerState,
  leaseMatches,
  nearestShortIndex,
  shortsPreparationPriority,
  shortsPreparationWindow,
  shortsContentWindow,
  shortsPlayerWindow,
  transitionShortsController,
} from '../server/shorts-controller.mjs';
import {
  createShortsFeedState,
  shortsFeedLeaseMatches,
  shortsFeedReducer,
} from '../src/shortsController.ts';

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

test('content shells use the ±5 window while players stay capped at five', () => {
  assert.deepEqual(shortsContentWindow(0, 30), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(shortsContentWindow(5, 30), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(shortsContentWindow(28, 30), [23, 24, 25, 26, 27, 28, 29]);
  assert.deepEqual(shortsPlayerWindow(0, 30), [0, 1, 2]);
  assert.deepEqual(shortsPlayerWindow(10, 30), [8, 9, 10, 11, 12]);
  assert.deepEqual(shortsPlayerWindow(29, 30), [27, 28, 29]);
  assert.deepEqual(shortsPlayerWindow(10, 30, 1), [10]);
});

test('the canonical feed reducer owns one settled lease and rejects stale generations', () => {
  let state = shortsFeedReducer(createShortsFeedState(0), { type: 'ROUTE_ENTER', index: 0 });
  const firstLease = state.lease;
  assert.equal(state.phase, 'settled');
  assert.equal(shortsFeedLeaseMatches(state, 0, firstLease.generation), true);

  state = shortsFeedReducer(state, { type: 'SCROLL_START', direction: 'forward' });
  assert.equal(state.lease, null);
  state = shortsFeedReducer(state, { type: 'SCROLL_INTENT', index: 4, direction: 'forward' });
  assert.equal(state.lease, null);
  state = shortsFeedReducer(state, { type: 'SCROLL_SETTLE', index: 4 });
  const settledLease = state.lease;
  assert.equal(state.activeIndex, 4);
  assert.equal(shortsFeedLeaseMatches(state, 4, settledLease.generation), true);
  assert.equal(shortsFeedLeaseMatches(state, 0, firstLease.generation), false);

  const duplicate = shortsFeedReducer(state, { type: 'SCROLL_SETTLE', index: 4 });
  assert.deepEqual(duplicate, state);
  state = shortsFeedReducer(state, { type: 'OVERLAY_OPEN' });
  assert.equal(state.lease, null);
  state = shortsFeedReducer(state, { type: 'OVERLAY_CLOSE', resume: false });
  assert.equal(state.phase, 'settled');
  assert.equal(state.lease, null);
  state = shortsFeedReducer(state, { type: 'VISIBILITY_HIDDEN' });
  state = shortsFeedReducer(state, { type: 'VISIBILITY_VISIBLE', resume: true });
  assert.equal(state.lease.index, 4);
  state = shortsFeedReducer(state, { type: 'ROUTE_LEAVE' });
  assert.equal(state.phase, 'inactive');
  assert.equal(state.lease, null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { TOUR_STORAGE_KEYS, TOURS, tourStep } from '../src/tutorial.ts';

const ids = ['landing', 'menu', 'bar', 'basics', 'tab', 'quiz', 'watch', 'shorts'];

test('every user-facing page owns one independent versioned tutorial key', () => {
  assert.deepEqual(Object.keys(TOURS), ids);
  assert.deepEqual(Object.keys(TOUR_STORAGE_KEYS), ids);
  assert.equal(new Set(Object.values(TOUR_STORAGE_KEYS)).size, ids.length);
  for (const id of ids) {
    assert.equal(TOURS[id].id, id);
    assert.equal(TOURS[id].storageKey, `pubcrawl.tour.${id}.v1`);
    assert.equal(TOURS[id].steps.length >= 2, true);
  }
});

test('tutorial steps have stable unique ids, targets, labels, and placement', () => {
  for (const id of ids) {
    const definition = TOURS[id];
    assert.equal(new Set(definition.steps.map((step) => step.id)).size, definition.steps.length);
    for (const [index, step] of definition.steps.entries()) {
      assert.match(step.target, /^\[data-tour="[a-z-]+"\]$/);
      assert.equal(step.label.length > 0, true);
      assert.equal(step.body.length > 0, true);
      assert.equal(['top', 'right', 'bottom', 'left'].includes(step.preferredSide), true);
      assert.deepEqual(tourStep(id, index), step);
    }
    assert.equal(tourStep(id, definition.steps.length), null);
  }
});

test('Tab, Watch, and Shorts have the requested stable tutorial coverage', () => {
  assert.deepEqual(TOURS.tab.steps.map((step) => step.id), ['lineup', 'cards', 'actions']);
  assert.equal(TOURS.tab.steps[0].optional, undefined);
  assert.equal(TOURS.tab.steps[1].optional, true);
  assert.equal(TOURS.tab.steps[2].optional, true);
  assert.deepEqual(TOURS.watch.steps.map((step) => step.id), ['controls', 'ranking', 'videos']);
  assert.match(TOURS.shorts.steps[0].body, /Swipe up or scroll down/);
  assert.match(TOURS.shorts.steps[1].body, /YouTube’s controls for sound and playback/);
  assert.doesNotMatch(TOURS.shorts.steps.map((step) => step.body).join(' '), /side areas|Previous and Next|Make This/i);
});

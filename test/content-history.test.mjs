import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceContentReturn, CONTENT_RETURN_KEY as key, readContentReturn } from '../src/contentHistory.ts';

test('content journeys keep their origin across destination filters and recipe-reader entries', () => {
  const source = { unrelated: { visit: 'home-1' }, [key]: { token: 'study-link', depth: 0 } };
  const filter = advanceContentReturn(source);
  const reader = advanceContentReturn(filter);
  assert.deepEqual(readContentReturn(reader), { token: 'study-link', depth: 2 });
  assert.equal(readContentReturn(source).depth, 0);
  assert.deepEqual(reader.unrelated, source.unrelated);
  // Native history Back supplies the earlier entry, with the earlier depth.
  assert.equal(readContentReturn(filter).depth, 1);
  assert.deepEqual(advanceContentReturn({ other: true }), { other: true });
});

test('unrelated or malformed history never becomes a content Back action', () => {
  for (const value of [null, 'state', {}, { token: '', depth: 0 }, { token: 'x', depth: -1 }, { token: 'x', depth: 1.5 }, { token: 'x', depth: '2' }, { token: 'x', depth: Infinity }]) {
    assert.equal(readContentReturn({ [key]: value }), null);
  }
});

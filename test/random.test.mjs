import assert from 'node:assert/strict';
import test from 'node:test';
import { sampleUnique, shuffle } from '../src/random.ts';
import { createShortsVisitOrder } from '../src/shortsVisit.ts';

const short = (id, rank) => ({ id, rank });

test('Fisher-Yates shuffle is deterministic with injected randomness and leaves its source unchanged', () => {
  const source = [1, 2, 3];
  assert.deepEqual(shuffle(source, () => 0), [2, 3, 1]);
  assert.deepEqual(source, [1, 2, 3]);
});

test('unique samples deduplicate before drawing from the complete pool', () => {
  const source = [{ id: 'a' }, { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const result = sampleUnique(source, 3, (item) => item.id, () => 0);
  assert.equal(result.length, 3);
  assert.equal(new Set(result.map((item) => item.id)).size, 3);
  assert.ok(result.some((item) => item.id === 'd'));
});

test('a Shorts deep link is first once and the remaining complete catalogue is shuffled', () => {
  const source = [
    short('aaaaaaaaaaa', 1), short('bbbbbbbbbbb', 2), short('ccccccccccc', 3), short('ddddddddddd', 4),
  ];
  const result = createShortsVisitOrder(source, 'ccccccccccc', () => 0);
  assert.equal(result[0].id, 'ccccccccccc');
  assert.equal(result.length, source.length);
  assert.deepEqual(new Set(result.map((item) => item.id)), new Set(source.map((item) => item.id)));
  assert.deepEqual(source.map((item) => item.id), ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd']);
});

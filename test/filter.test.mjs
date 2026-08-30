import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBrowseFilter, serializeBrowseFilter, VIBE_ORDER } from '../src/filter.ts';

test('browse filters have stable canonical serialization', () => {
  assert.deepEqual(parseBrowseFilter('all'), { kind: 'all' });
  assert.deepEqual(parseBrowseFilter('category:zeroproof'), { kind: 'category', id: 'zeroproof' });
  assert.deepEqual(parseBrowseFilter('collection:india'), { kind: 'collection', id: 'india' });
  assert.deepEqual(parseBrowseFilter('collection:house'), { kind: 'collection', id: 'house' });
  assert.deepEqual(parseBrowseFilter('zeroproof'), { kind: 'all' });
  for (const id of VIBE_ORDER) assert.equal(serializeBrowseFilter({ kind: 'category', id }), `category:${id}`);
  assert.equal(serializeBrowseFilter({ kind: 'collection', id: 'india' }), 'collection:india');
});

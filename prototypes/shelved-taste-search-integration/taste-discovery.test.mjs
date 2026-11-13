import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { queryRecipes } from '../shared/catalog-engine.mjs';
import { mappedRecipeMatches, offersTartIntent, hasTasteFlavour, TASTE_CONNECTIONS, TASTE_PROFILES, shelfAvailability } from '../src/tasteProfiles.ts';

const { recipes, vibes } = JSON.parse(await readFile(new URL('../src/generated/client_catalog.json', import.meta.url), 'utf8'));
const vibeLookup = Object.fromEntries(vibes.map(v => [v.id, v]));

test('mapped coverage is a strict subset of the same full-library keyword and category search', () => {
  for (const q of ['sour', 'fresh & citrus', 'gin', 'coffee', 'Vesper', 'not-a-drink']) {
    for (const filter of [{kind:'all'}, {kind:'category', id:'boozy'}, {kind:'collection', id:'india'}]) {
      const full = queryRecipes(recipes, {q, category: filter.kind === 'category' ? filter.id : '', collection: filter.kind === 'collection' ? filter.id : '', limit:48, vibes:vibeLookup});
      const mapped = mappedRecipeMatches(recipes, q, filter, vibes);
      assert.ok(mapped.length <= full.total);
      for (const recipe of mapped) assert.equal(queryRecipes([recipe], {q, category:filter.kind === 'category' ? filter.id : '', collection:filter.kind === 'collection' ? filter.id : '', vibes:vibeLookup}).total, 1);
    }
  }
  assert.equal(queryRecipes(recipes, {q:'sour', vibes:vibeLookup}).total, 55);
  assert.deepEqual(mappedRecipeMatches(recipes, 'sour', {kind:'all'}, vibes).map(r=>r.name), ['Daiquiri']);
});

test('tart taste intent is an explicit small vocabulary, independent of names and sweetness positions', () => {
  for (const query of ['sour', ' SOUR ', 'tart', 'citrusy', 'acidic']) assert.equal(offersTartIntent(query), true);
  for (const query of ['Whiskey Sour', 'Sour Apple Martini', '', '<script>']) assert.equal(offersTartIntent(query), false);
  const tart = TASTE_PROFILES.filter(p=>hasTasteFlavour(p, 'tart'));
  assert.equal(tart.length, 6);
  assert.ok(tart.some(p=>p.id === '11007'));
  assert.ok(!tart.some(p=>p.id === '11005'));
});

test('every reviewed neighbour has a directed explanation and a real catalogue recipe', () => {
  for (const profile of TASTE_PROFILES) {
    assert.ok(recipes.some(r=>r.id === profile.id));
    assert.equal(new Set(profile.neighbours).size, 3);
    for (const id of profile.neighbours) {
      assert.notEqual(id, profile.id);
      assert.ok(TASTE_PROFILES.some(p=>p.id === id));
      assert.ok(TASTE_CONNECTIONS[profile.id]?.[id]?.length > 20);
    }
  }
});

test('shelf overlays distinguish can make and one away using the existing matcher without moving profiles', () => {
  const negroni = recipes.find(r=>r.id === '11003');
  const before = JSON.stringify(TASTE_PROFILES);
  assert.deepEqual(shelfAvailability(negroni, ['Gin', 'Campari']).missing, ['Sweet Vermouth']);
  assert.equal(shelfAvailability(negroni, ['Gin', 'Campari', 'Sweet Vermouth']).available, true);
  assert.equal(shelfAvailability(negroni, ['Gin']).matched, 1);
  assert.equal(JSON.stringify(TASTE_PROFILES), before);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TASTE_PROFILES, FLAVOUR_PATHS, ingredientDifferences, shelfAvailability } from '../src/tasteProfiles.ts';

const { recipes } = JSON.parse(await readFile(new URL('../src/generated/client_catalog.json', import.meta.url), 'utf8'));

test('illustrated classics and their related recipes resolve to the audited catalogue', () => {
  const ids = new Set(TASTE_PROFILES.map(profile => profile.id));
  assert.equal(ids.size, 16);
  for (const profile of TASTE_PROFILES) {
    assert.ok(recipes.some(recipe => recipe.id === profile.id));
    for (const id of profile.neighbours) {
      assert.notEqual(id, profile.id);
      assert.ok(ids.has(id));
    }
  }
  for (const path of FLAVOUR_PATHS) for (const word of path.words) {
    assert.ok(TASTE_PROFILES.some(profile => profile.flavours.includes(word)), `Empty flavour: ${word}`);
  }
});

test('shelf availability uses actual ingredients and excludes optional ingredients and staples', () => {
  const negroni = recipes.find(recipe => recipe.id === '11003');
  assert.deepEqual(shelfAvailability(negroni, ['Gin', 'Campari']).missing, ['Sweet Vermouth']);
  assert.equal(shelfAvailability(negroni, ['Gin', 'Campari', 'Sweet Vermouth']).available, true);
  assert.equal(shelfAvailability(negroni, ['Gin']).matched, 1);
  const optional = { ...negroni, ingredients: [...negroni.ingredients, {name: 'Ice', measure: ''}, {name: 'Orange', measure: '', optional: true}] };
  assert.equal(shelfAvailability(optional, ['Gin', 'Campari', 'Sweet Vermouth']).available, true);
});

test('comparison separates ingredient substitutions from equivalent liquid quantities', () => {
  const negroni = recipes.find(recipe => recipe.id === '11003');
  const boulevardier = recipes.find(recipe => recipe.id === '17251');
  const rows = ingredientDifferences(negroni, boulevardier);
  assert.equal(rows.find(row => row.name === 'Campari').status, 'shared');
  assert.equal(rows.find(row => row.name === 'Campari').differentMeasure, false);
  assert.equal(rows.find(row => row.name === 'Gin').status, 'left');
  assert.ok(rows.some(row => row.status === 'right'));
});

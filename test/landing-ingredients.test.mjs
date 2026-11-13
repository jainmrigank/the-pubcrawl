import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildLandingIngredients } from '../scripts/landing_ingredients.mjs';

test('ingredient summaries count recipes once and keep exact ingredient boundaries', () => {
  const recipes = [
    { id: '1', name: 'Zulu', iba: 'Classic', ingredients: [{ name: 'GIN' }, { name: ' gin ' }] },
    { id: '2', name: 'Alpha', ingredients: [{ name: 'Gin' }] },
    { id: '3', name: 'Beta', ingredients: [{ name: 'Sloe gin' }] },
    { id: '1', name: 'Zulu', iba: 'Classic', ingredients: [{ name: 'Gin' }] },
  ];
  const result = buildLandingIngredients(recipes, 'test').ingredients.find(({ name }) => name === 'Gin');
  assert.equal(result.count, 2);
  assert.deepEqual(result.recipes.map(({ name }) => name), ['Zulu', 'Alpha']);
});

test('generated landing counts and every linked recipe agree with the catalogue', () => {
  const catalogue = JSON.parse(readFileSync(new URL('../src/generated/client_catalog.json', import.meta.url)));
  const summary = JSON.parse(readFileSync(new URL('../src/generated/landing_ingredients.json', import.meta.url)));
  assert.equal(summary.dataVersion, catalogue.dataVersion);
  assert.equal(summary.catalogueCount, catalogue.recipes.length);
  for (const ingredient of summary.ingredients) {
    const matching = catalogue.recipes.filter((recipe) => new Set(recipe.ingredients.map(({ name }) => name.trim().toLowerCase())).has(ingredient.name.toLowerCase()));
    assert.equal(ingredient.count, new Set(matching.map(({ id }) => id)).size);
    assert.equal(ingredient.recipes.length, Math.min(8, matching.length));
    for (const sample of ingredient.recipes) {
      assert.ok(matching.some(({ id, name }) => id === sample.id && name === sample.name));
      assert.deepEqual(Object.keys(sample).sort(), ['id', 'name']);
    }
  }
  assert.ok(JSON.stringify(summary).length < 8000, 'Landing summary must stay small');
});

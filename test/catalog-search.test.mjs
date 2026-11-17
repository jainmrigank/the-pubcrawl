import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog, matchRecipes, searchIngredients } from '../server/catalog.mjs';
import { ingredientMatches, queryRecipes, recipeSearchScore, shelfMatchRecipes } from '../shared/catalog-engine.mjs';
import { recipeContent } from '../src/recipeContent.ts';
import clientCatalogue from '../src/generated/client_catalog.json' with { type: 'json' };

const { cocktails, ingredients } = loadCatalog();
const named = name => cocktails.find(recipe => recipe.name === name);
const find = q => queryRecipes(cocktails, { q, limit: 48 }).recipes;

test('Peach discovers every peach ingredient form without marking any of them owned', () => {
  const results = shelfMatchRecipes(cocktails, ['Peach']);
  for (const name of ['Abilene', 'Bellini', 'Zinger', '410 Gone', 'Derby', 'Spiced Peach Punch']) {
    const result = results.find(recipe => recipe.name === name);
    assert.ok(result, name);
    assert.ok(result.relatedIngredients.some(item => item.owned === 'Peach'));
    assert.equal(result.matched, 0);
    assert.ok(result.missingCount > 0);
    for (const item of result.relatedIngredients) {
      assert.equal(result.ingredients.find(ingredient => ingredient.name === item.required).have, false);
      assert.ok(result.missing.includes(item.required));
    }
  }
  assert.equal(results.length, find('peach').length);
  assert.deepEqual(shelfMatchRecipes(clientCatalogue.recipes, ['Peach']), results);
  assert.deepEqual(matchRecipes(cocktails, ['Peach']).canMake, []);
  assert.deepEqual(matchRecipes(cocktails, ['Peach']).almost, results);
  for (const form of ['Peach nectar', 'Peach Vodka', 'Peach schnapps', 'Peachtree schnapps']) {
    assert.equal(ingredientMatches('Peach', form), false);
  }
});

test('direct Shelf results rank before keyword suggestions, with no two-missing-ingredient cutoff', () => {
  const results = shelfMatchRecipes(cocktails, ['Peach nectar']);
  assert.equal(results[0].name, 'Abilene');
  const punch = results.find(recipe => recipe.name === 'Spiced Peach Punch');
  assert.ok(punch.missingCount > 2);
  assert.equal(punch.relatedIngredients, undefined);
  const firstRelated = results.findIndex(recipe => recipe.relatedIngredients?.length);
  assert.ok(firstRelated > results.indexOf(punch));
  assert.ok(results.slice(firstRelated).every(recipe => recipe.relatedIngredients?.length));
  const owned = shelfMatchRecipes(cocktails, ['Peach nectar', 'Orange juice', 'Dark rum']);
  const abilene = owned.find(recipe => recipe.name === 'Abilene');
  assert.equal(abilene.missingCount, 0);
  assert.equal(abilene.relatedIngredients, undefined);
});

test('aliases, plural forms and reordered words search deeply while filters still apply', () => {
  assert.equal(searchIngredients(ingredients, 'peaches')[0].name, 'Peach');
  assert.ok(searchIngredients(ingredients, 'liqueur peach').some(item => item.name === 'Peachtree'));
  assert.ok(searchIngredients(ingredients, 'spiced sweet whisky').some(item => item.name === 'Southern Comfort'));
  assert.ok(shelfMatchRecipes(cocktails, ['Peaches']).some(recipe => recipe.name === 'Abilene'));
  assert.deepEqual(shelfMatchRecipes(cocktails, []), []);
  assert.deepEqual(shelfMatchRecipes(cocktails, ['not-an-ingredient-fixture']), []);
  assert.deepEqual(shelfMatchRecipes(cocktails, ['Peach'], { query: 'not-a-drink-fixture' }), []);
  const filtered = shelfMatchRecipes(cocktails, ['Peach'], { category: 'tropical' });
  assert.ok(filtered.length > 0);
  assert.ok(filtered.every(recipe => recipe.vibe === 'tropical'));
  assert.ok(shelfMatchRecipes(cocktails, ['Sugar']).some(recipe => recipe.name === 'Caipirinha'));
  const coffee = shelfMatchRecipes(cocktails, ['Coffee']).find(recipe => recipe.name === 'Black Russian');
  assert.ok(coffee.relatedIngredients.some(item => item.required === 'Coffee liqueur'));
  assert.ok(coffee.missing.includes('Coffee liqueur'));
  const gin = shelfMatchRecipes(cocktails, ['Gin']);
  assert.ok(gin.length > 24);
  const fallback = matchRecipes(cocktails, ['Gin']);
  assert.deepEqual([...fallback.canMake, ...fallback.almost], gin);
});

test('discovery and search use whole keywords, not Gin/Ginger or Rum/Drambuie substrings', () => {
  const gingerOnly = { ...named('Mojito'), name: 'Ginger Cooler', ingredients: [{ name: 'Ginger', measure: '1 slice' }], instructions: 'Stir.', tags: [], tagline: '', glass: 'Tumbler', vibe: 'refreshing' };
  assert.equal(recipeSearchScore(gingerOnly, 'gin'), -1);
  assert.deepEqual(shelfMatchRecipes([gingerOnly], ['Gin']), []);
  const drambuieOnly = { ...gingerOnly, name: 'Drambuie Drink', ingredients: [{ name: 'Drambuie', measure: '30 ml' }] };
  assert.deepEqual(shelfMatchRecipes([drambuieOnly], ['Rum']), []);
});

test('Drinks search combines spirit, flavour, vibe, category, brand type and method', () => {
  for (const [query, name] of [
    ['citrusy gin', 'Gimlet'], ['bitter gin', 'Negroni'],
    ['tropical rum', 'Mai Tai'], ['creamy vodka', 'White Russian'],
    ['nutty vodka', 'Godmother'], ['whisky sour', 'Whiskey Sour'],
    ['shot', 'ABC'], ['shooter', 'ABC'], ['spirit forward gin', 'Dry Martini'],
    ['almond liqueur vodka', 'Godmother'], ['double strain', 'Picante'],
    ['shaken gin', 'Aviation'], ['trop rum', 'Mai Tai'], ['floral gin', 'Pink Moon'],
    ['coffee liqueur vodka', 'Black Russian'], ['orange liqueur tequila', 'Margarita'],
  ]) {
    const recipe = named(name);
    assert.ok(recipe, name);
    assert.ok(recipeSearchScore(recipe, query) >= 0, `${query} -> ${name}`);
  }
  assert.equal(find('whisky sour')[0].name, 'Whiskey Sour');
  assert.equal(find('Negroni')[0].name, 'Negroni');
  assert.ok(recipeSearchScore(named('Margarita'), 'gin citrusy') < 0);
  assert.ok(recipeSearchScore(named('Negroni'), 'nutty vodka') < 0);
  assert.ok(recipeSearchScore(named('Army special'), 'floral gin') < 0);
  const zeroProof = find('alcohol free citrus');
  assert.ok(zeroProof.length > 0);
  assert.ok(zeroProof.every(recipe => recipe.vibe === 'zeroproof'));
  assert.equal(recipeSearchScore(named('Mojito'), 'mocktail'), -1);
});

test('Shelf keyword connections never travel into saved/public recipe content', () => {
  const result = shelfMatchRecipes(cocktails, ['Peach']).find(recipe => recipe.name === 'Bellini');
  const clean = recipeContent(result);
  assert.equal('relatedIngredients' in clean, false);
  assert.equal('missing' in clean, false);
  assert.deepEqual(clean, named('Bellini'));
});

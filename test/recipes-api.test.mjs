import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../server/catalog.mjs';
import { normaliseRecipeQuery, recipePage, RecipeQueryError } from '../server/recipe-query.mjs';

const { cocktails } = loadCatalog();
const noLikes = {};
const ids = (page) => page.recipes.map((recipe) => recipe.id);

test('recipe pages expose metadata and paginate the filtered total', () => {
  const page = recipePage(cocktails, noLikes, {});
  assert.equal(Array.isArray(page), false);
  assert.deepEqual(Object.keys(page), ['recipes', 'total', 'offset', 'limit', 'hasMore']);
  assert.equal(page.limit, 12);
  assert.equal(page.recipes.length, 12);
  assert.equal(page.total, 691);
  assert.equal(page.offset, 0);
  assert.equal(page.hasMore, true);

  const next = recipePage(cocktails, noLikes, { offset: 12, limit: 12, seed: 'same' });
  const first = recipePage(cocktails, noLikes, { offset: 0, limit: 12, seed: 'same' });
  assert.equal(next.total, 691);
  assert.equal(next.hasMore, true);
  assert.equal(new Set([...ids(first), ...ids(next)]).size, 24);
});

test('seed and sort ordering are server-authoritative and stable', () => {
  assert.deepEqual(
    ids(recipePage(cocktails, noLikes, { seed: 'stable', limit: 24 })),
    ids(recipePage(cocktails, noLikes, { seed: 'stable', limit: 24 }))
  );
  const chosen = cocktails[42];
  const liked = { [chosen.id]: 999 };
  assert.equal(recipePage(cocktails, liked, { sort: 'likes', limit: 1 }).recipes[0].id, chosen.id);
});

test('category, collection, search and combined filters compute totals before slicing', () => {
  const zeroProof = recipePage(cocktails, noLikes, { category: 'zeroproof', limit: 48 });
  assert.ok(zeroProof.total > 0);
  assert.ok(zeroProof.recipes.every((recipe) => recipe.vibe === 'zeroproof'));

  const india = recipePage(cocktails, noLikes, { collection: 'india', limit: 48 });
  assert.equal(india.total, 80);
  assert.ok(india.recipes.every((recipe) => recipe.tags.includes('India')));

  const house = recipePage(cocktails, noLikes, { collection: 'house', limit: 48 });
  assert.equal(house.total, 7);
  assert.equal(house.hasMore, false);
  assert.ok(house.recipes.every((recipe) => recipe.houseOriginal === true));

  const search = recipePage(cocktails, noLikes, { q: 'Masala Chai', limit: 48 });
  assert.equal(search.total, 2);
  assert.ok(search.recipes.some((recipe) => recipe.name === 'Masala Chai'));

  const combinedCategory = recipePage(cocktails, noLikes, { q: 'Masala Chai', category: 'zeroproof', limit: 48 });
  assert.equal(combinedCategory.total, 1);
  assert.equal(combinedCategory.recipes[0].name, 'Masala Chai');
  const combinedCollection = recipePage(cocktails, noLikes, { q: 'toddy', collection: 'india', limit: 48 });
  assert.ok(combinedCollection.recipes.every((recipe) => recipe.tags.includes('India')));
});

test('legacy vibe aliases map to canonical filters and canonical values win', () => {
  assert.equal(recipePage(cocktails, noLikes, { vibe: 'indian', limit: 48 }).total, 80);
  assert.equal(recipePage(cocktails, noLikes, { vibe: 'house', limit: 48 }).total, 7);
  assert.equal(
    recipePage(cocktails, noLikes, { vibe: 'zeroproof', category: 'boozy', limit: 48 }).recipes.every((recipe) => recipe.vibe === 'boozy'),
    true
  );
  assert.deepEqual(normaliseRecipeQuery({ vibe: 'refreshing' }).category, 'refreshing');
});

test('invalid query values fail clearly while offset/limit stay bounded', () => {
  assert.throws(() => recipePage(cocktails, noLikes, { category: 'not-a-vibe' }), RecipeQueryError);
  assert.throws(() => recipePage(cocktails, noLikes, { collection: 'not-a-collection' }), RecipeQueryError);
  assert.throws(() => recipePage(cocktails, noLikes, { sort: 'name' }), RecipeQueryError);

  const bounded = recipePage(cocktails, noLikes, { offset: -12, limit: 999 });
  assert.equal(bounded.offset, 0);
  assert.equal(bounded.limit, 48);
  assert.equal(bounded.recipes.length, 48);
  assert.equal(recipePage(cocktails, noLikes, { category: 'zeroproof', limit: 48, offset: 48 }).hasMore, false);
});

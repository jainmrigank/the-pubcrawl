import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog, hasRecipeImage, matchRecipes, visibleRecipes } from '../server/catalog.mjs';

test('catalogue keeps image-less recipes for matching but the browse shelf has photos only', () => {
  const { cocktails } = loadCatalog();
  const photographed = cocktails.filter(hasRecipeImage);
  const withoutPhoto = cocktails.find((recipe) => !hasRecipeImage(recipe));
  assert.equal(cocktails.length, 690);
  assert.equal(photographed.length, 624);
  assert.ok(withoutPhoto);
  const ingredients = withoutPhoto.ingredients.map((ingredient) => ingredient.name);
  assert.ok(matchRecipes(cocktails, ingredients).canMake.some((recipe) => recipe.id === withoutPhoto.id));
});

test('the GET /api/recipes admission boundary never returns an empty thumb', () => {
  const { cocktails } = loadCatalog();
  const recipes = visibleRecipes(cocktails);
  assert.equal(recipes.length, 624);
  assert.ok(recipes.every((recipe) => typeof recipe.thumb === 'string' && recipe.thumb.trim().length > 0));
});

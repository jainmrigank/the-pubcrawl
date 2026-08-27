import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCatalog,
  hasRecipeImage,
  isBrowseableRecipe,
  matchRecipes,
  recipeSearchScore,
  visibleRecipes,
} from '../server/catalog.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('every catalogue entry is a browseable flashcard with an image', () => {
  const { cocktails } = loadCatalog();
  const photographed = cocktails.filter(hasRecipeImage);
  assert.equal(cocktails.length, 684);
  assert.equal(photographed.length, 684);
  assert.equal(visibleRecipes(cocktails).length, cocktails.length);
  assert.ok(visibleRecipes(cocktails).every(hasRecipeImage));
  const localImages = photographed.filter((recipe) => recipe.thumb.startsWith('/images/'));
  assert.equal(localImages.length, 60);
  assert.ok(localImages.every((recipe) => existsSync(join(ROOT, 'public', recipe.thumb))));
});

test('the GET /api/recipes admission boundary requires a photo or explicit browse admission', () => {
  const { cocktails } = loadCatalog();
  const recipes = visibleRecipes(cocktails);
  assert.equal(recipes.length, 684);
  assert.ok(recipes.every(isBrowseableRecipe));
  assert.ok(recipes.every(hasRecipeImage));
});

test('the India collection is unique, complete, dated and entirely browseable', () => {
  const { cocktails } = loadCatalog();
  const india = cocktails.filter((recipe) => recipe.tags?.includes('India'));
  assert.equal(india.length, 80);
  assert.equal(new Set(india.map((recipe) => recipe.id)).size, india.length);
  assert.equal(new Set(india.map((recipe) => recipe.name.toLowerCase())).size, india.length);
  assert.ok(india.every(isBrowseableRecipe));
  assert.ok(india.every((recipe) => recipe.instructions.length >= 20));
  assert.ok(india.every((recipe) => recipe.ingredients.length >= 2));
  assert.ok(india.every((recipe) => recipe.evidence?.length));
  assert.ok(india.every((recipe) => recipe.india?.researchDate === '2026-08-27'));
  assert.ok(india.every(hasRecipeImage));
  assert.ok(india.every((recipe) => /^https:\/\/(?:www\.)?youtube\.com\/watch\?v=[\w-]{11}(?:&|$)/.test(recipe.video || '')));
  assert.ok(india.every((recipe) => recipe.videoTitle?.trim()));
  assert.ok(india.every((recipe) => ['exact', 'technique'].includes(recipe.videoKind)));
  assert.deepEqual(
    new Set(india.map((recipe) => recipe.india?.lane)),
    new Set(['everyday', 'modern-bar', 'regional', 'zero-proof'])
  );
  assert.ok(india.filter((recipe) => recipe.india?.lane === 'zero-proof')
    .every((recipe) => recipe.alcoholic.toLowerCase().includes('non')));

  const localImages = india.filter((recipe) => recipe.thumb.startsWith('/images/india/'));
  assert.equal(localImages.length, 59);
  assert.equal(new Set(localImages.map((recipe) => recipe.thumb)).size, localImages.length);
  assert.ok(localImages.every((recipe) => existsSync(join(ROOT, 'public', recipe.thumb))));

  // Every India recipe participates in the same matcher used by the shelf.
  // Exact-name prefiltering mirrors shelf search before its 24-card page cap.
  for (const recipe of india) {
    const pantry = recipe.ingredients
      .filter((ingredient) => !ingredient.optional)
      .map((ingredient) => ingredient.name);
    const candidates = cocktails.filter((candidate) => recipeSearchScore(candidate, recipe.name) >= 0);
    assert.ok(matchRecipes(candidates, pantry).canMake.some((candidate) => candidate.id === recipe.id));
  }
});

test('India index repairs incomplete source specs without duplicate classics', () => {
  const { cocktails } = loadCatalog();
  const espresso = cocktails.find((recipe) => recipe.id === '17212');
  const longIsland = cocktails.find((recipe) => recipe.id === '17204');
  const jagerbomb = cocktails.find((recipe) => recipe.id === 'x-jagerbomb');
  assert.ok(espresso.ingredients.some((ingredient) => ingredient.name === 'Fresh Espresso'));
  assert.ok(longIsland.ingredients.some((ingredient) => ingredient.name === 'Cointreau'));
  assert.ok(longIsland.ingredients.some((ingredient) => ingredient.name === 'Lemon Juice'));
  assert.doesNotMatch(jagerbomb.instructions, /drop the (full )?shot glass/i);
  assert.match(jagerbomb.videoTitle, /highball/i);
  assert.doesNotMatch(jagerbomb.videoTitle, /bomb/i);
  assert.equal(cocktails.filter((recipe) => recipe.name === 'Mojito').length, 1);
});

test('recipe search indexes research lane, access, glass, vibe, place, ingredient and method', () => {
  const { cocktails } = loadCatalog();
  const find = (q) => cocktails.filter((recipe) => recipeSearchScore(recipe, q) >= 0);
  assert.ok(find('lane regional').some((recipe) => recipe.name === 'Mahua Sour'));
  assert.ok(find('access tier 3').some((recipe) => recipe.name === 'Kerala Toddy Cooler'));
  assert.ok(find('coupe').some((recipe) => recipe.name === 'Filter Kaapi Martini'));
  assert.ok(find('zero proof').some((recipe) => recipe.name === 'Kokum Curry Leaf Spritzer'));
  assert.ok(find('fresh citrus').some((recipe) => recipe.name === 'Vodka Soda'));
  assert.ok(find('goa').some((recipe) => recipe.name === 'Urrak Lemonade & Chilli'));
  assert.ok(find('tamarind').some((recipe) => recipe.name === 'Imli Whisky Sour'));
  assert.ok(find('double strain').some((recipe) => recipe.name === 'Picante'));
});

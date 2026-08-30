import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  categorise,
  loadCatalog,
  hasRecipeImage,
  isBrowseableRecipe,
  matchRecipes,
  recipeSearchScore,
  visibleRecipes,
} from '../server/catalog.mjs';
import { classifyVibe, VIBES } from '../server/vibes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('every catalogue entry restores the pre-audit browseable image set', () => {
  const { cocktails } = loadCatalog();
  const photographed = cocktails.filter(hasRecipeImage);
  assert.equal(cocktails.length, 691);
  assert.equal(photographed.length, 691);
  assert.equal(visibleRecipes(cocktails).length, cocktails.length);
  assert.ok(visibleRecipes(cocktails).every((recipe) => isBrowseableRecipe(recipe) && hasRecipeImage(recipe)));
  const localImages = photographed.filter((recipe) => recipe.thumb.startsWith('/images/'));
  assert.equal(localImages.length, 67);
  assert.ok(localImages.every((recipe) => existsSync(join(ROOT, 'public', recipe.thumb))));
});

test('the GET /api/recipes admission boundary requires a photo or explicit browse admission', () => {
  const { cocktails } = loadCatalog();
  const recipes = visibleRecipes(cocktails);
  assert.equal(recipes.length, 691);
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
  assert.ok(india.every((recipe) => !recipe.video || /^https:\/\/(?:www\.)?youtube\.com\/watch\?v=[\w-]{11}$/.test(recipe.video)));
  assert.ok(india.every((recipe) => recipe.video ? recipe.videoKind === 'exact' && recipe.videoTitle?.trim() : !recipe.videoTitle && !recipe.videoKind));
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
  assert.equal(jagerbomb.video, '');
  assert.equal(jagerbomb.videoTitle, undefined);
  assert.equal(jagerbomb.videoKind, undefined);
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

test('Zero Proof wins classification precedence and stays exclusive', () => {
  assert.deepEqual(Object.keys(VIBES), ['tropical', 'refreshing', 'boozy', 'sweet', 'cozy', 'party', 'zeroproof']);
  assert.equal(classifyVibe({ name: 'Masala Chai', category: 'Coffee / Tea', alcoholic: 'Non alcoholic', glass: 'Coffee Mug', instructions: 'Boil and serve hot.', ingredients: [{ name: 'Tea' }, { name: 'Milk' }] }), 'zeroproof');
  assert.equal(classifyVibe({ name: 'Masala Chai Toddy', category: 'Coffee / Tea', alcoholic: 'Alcoholic', glass: 'Coffee Mug', instructions: 'Serve hot.', ingredients: [{ name: 'Whisky' }, { name: 'Masala Chai' }] }), 'cozy');
  const { cocktails } = loadCatalog();
  const masala = cocktails.find((recipe) => recipe.name === 'Masala Chai');
  const toddy = cocktails.find((recipe) => recipe.name === 'Masala Chai Toddy');
  assert.equal(masala?.vibe, 'zeroproof');
  assert.notEqual(masala?.vibe, 'sweet');
  assert.equal(toddy?.alcoholic, 'Alcoholic');
  assert.notEqual(toddy?.vibe, 'zeroproof');
  assert.ok(cocktails.filter((recipe) => /non\s*alcohol/i.test(recipe.alcoholic)).every((recipe) => recipe.vibe === 'zeroproof'));
});

test('Mrigank house originals keep their recipes, supplied photos and shelf access', () => {
  const { cocktails } = loadCatalog();
  const expected = [
    ['x-house-mango-frozen-margarita', 'Vodka', 'Fresh Mango', 'Coupe glass'],
    ['x-house-blueberry-frozen-margarita', 'Vodka', 'Fresh Blueberries', 'Coupe glass'],
    ['x-house-date-rum-smash', 'White Rum', 'Fresh Dates', 'Coupe glass'],
    ['x-house-mango-tequila-frozen-slushie', 'Tequila', 'Fresh Mango', 'Coupe glass'],
    ['x-house-plum-kala-namak-margarita', 'Dark Rum', 'Fresh Plum', 'Coupe glass'],
    ['x-house-spiced-apple-whiskey', 'Whiskey', 'Fresh Apple', 'Old-fashioned glass'],
    ['x-house-apple-mimosa', 'Vodka', 'Apple Juice', 'Champagne flute'],
  ];
  const originals = cocktails.filter((recipe) => recipe.houseOriginal === true);
  assert.equal(originals.length, expected.length);

  for (const [id, spirit, fruit, glass] of expected) {
    const recipe = cocktails.find((candidate) => candidate.id === id);
    assert.ok(recipe, `missing ${id}`);
    assert.equal(recipe.category, 'House Special');
    assert.equal(recipe.glass, glass);
    assert.equal(recipe.houseOriginal, true);
    assert.ok(recipe.tags.includes('House Special'));
    assert.ok(recipe.ingredients.some((ingredient) => ingredient.name === spirit));
    assert.ok(recipe.ingredients.some((ingredient) => ingredient.name === fruit));
    assert.match(recipe.tagline, /Mrigank's house-made/i);
    assert.match(recipe.thumb, /^\/images\/house\//);
    assert.ok(existsSync(join(ROOT, 'public', recipe.thumb)));
    assert.ok(recipeSearchScore(recipe, 'house special') >= 0);
    assert.ok(recipeSearchScore(recipe, glass.replace(/ glass$/i, '')) >= 0);

    const pantry = recipe.ingredients.map((ingredient) => ingredient.name);
    const candidates = cocktails.filter((candidate) => recipeSearchScore(candidate, recipe.name) >= 0);
    assert.ok(matchRecipes(candidates, pantry).canMake.some((candidate) => candidate.id === recipe.id));
  }

  const mangoVodka = cocktails.find((recipe) => recipe.id === 'x-house-mango-frozen-margarita');
  const blueberry = cocktails.find((recipe) => recipe.id === 'x-house-blueberry-frozen-margarita');
  const dateSmash = cocktails.find((recipe) => recipe.id === 'x-house-date-rum-smash');
  const mangoTequila = cocktails.find((recipe) => recipe.id === 'x-house-mango-tequila-frozen-slushie');
  const plum = cocktails.find((recipe) => recipe.id === 'x-house-plum-kala-namak-margarita');
  const apple = cocktails.find((recipe) => recipe.id === 'x-house-spiced-apple-whiskey');
  const appleMimosa = cocktails.find((recipe) => recipe.id === 'x-house-apple-mimosa');
  assert.match(mangoVodka.instructions, /blender/i);
  assert.match(blueberry.instructions, /blender/i);
  assert.match(dateSmash.instructions, /fine-strain/i);
  assert.match(mangoTequila.instructions, /do not add water/i);
  assert.ok(!mangoTequila.ingredients.some((ingredient) => ingredient.name === 'Water'));
  assert.ok(plum.ingredients.some((ingredient) => ingredient.name === 'Tequila'));
  assert.ok(plum.ingredients.some((ingredient) => ingredient.name === 'Kala Namak'));
  assert.match(plum.instructions, /without straining/i);
  assert.match(plum.instructions, /pulp stays/i);
  assert.equal(apple.glass, 'Old-fashioned glass');
  assert.ok(apple.ingredients.some((ingredient) => ingredient.name === 'Cinnamon Powder'));
  assert.match(apple.instructions, /fine-strain/i);
  const appleWithJuice = matchRecipes([apple], ['Whiskey', 'Apple Juice', 'Cinnamon Powder']);
  assert.ok(appleWithJuice.canMake.some((recipe) => recipe.id === apple.id));
  assert.match(appleMimosa.instructions, /shake hard/i);
  assert.match(appleMimosa.instructions, /fine-strain/i);
  assert.equal(appleMimosa.ingredients.find((ingredient) => ingredient.name === 'Sugar')?.optional, true);
  assert.equal(categorise('Fresh Dates'), 'Fruit');
  assert.equal(categorise('Fresh Plum'), 'Fruit');
});

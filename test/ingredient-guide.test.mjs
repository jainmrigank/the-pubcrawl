import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog, matchRecipes, searchIngredients, recipeSearchScore as serverScore } from '../server/catalog.mjs';
import { ingredientMatches, recipeSearchScore, shelfMatchRecipes } from '../shared/catalog-engine.mjs';
import { ingredientGuide, ingredientGuidance, ingredientLabel, resolveIngredient, searchIngredientIndex } from '../shared/ingredient-guide.mjs';
import { pantryAnalysis } from '../src/atlasMath.ts';
const { cocktails, ingredients } = loadCatalog();
const byName = name => cocktails.find(recipe => recipe.name === name);
const match = (name, pantry) => shelfMatchRecipes([byName(name)], pantry)[0];

test('unfamiliar brands have concise explanations while ordinary ingredients stay unchanged', () => {
  assert.equal(ingredientLabel('Southern Comfort'), 'Southern Comfort / sweet spiced whisky');
  assert.equal(ingredientLabel('Hot Damn'), 'Hot Damn / cinnamon liqueur');
  assert.equal(ingredientLabel('Apfelkorn'), 'Apfelkorn / sweet apple liqueur');
  assert.equal(ingredientLabel('Gin'), 'Gin');
  assert.equal(ingredientLabel('Orange juice'), 'Orange juice');
});
test('master ingredients and canonical recipes carry concise choices without Shelf or preparation data', () => {
  for (const name of ['Southern Comfort', 'Hot Damn', 'Apfelkorn', 'Schweppes Russchian', 'Amaretto']) {
    const entry = ingredients.find(item => item.name === name);
    assert.ok(entry.guidance.description);
    assert.ok(entry.guidance.alternatives.length);
    assert.deepEqual(entry.guidance, ingredientGuidance(name));
    assert.equal('steps' in entry.guidance, false);
    assert.equal('inputs' in entry.guidance, false);
    const uses = cocktails.flatMap(recipe => recipe.ingredients.filter(item => item.name === name).map(item => ({ recipe, item })));
    assert.ok(uses.length);
    for (const { recipe, item } of uses) {
      assert.deepEqual(item.guidance, ingredientGuidance(name, recipe));
      assert.equal('alternative' in item, false);
      assert.equal('have' in item, false);
    }
  }
  assert.deepEqual(ingredientGuidance('Blue Curacao').alternatives, ['Triple sec', 'Cointreau', 'Orange liqueur']);
  assert.equal(ingredients.find(item => item.name === 'Gin').guidance, undefined);
  assert.equal(ingredientGuidance('Orange juice'), undefined);
  const guarded = ingredientGuidance('Hot Damn', byName('Herbal flame'));
  assert.equal(guarded.description, 'cinnamon liqueur · 100 proof');
  assert.deepEqual(guarded.alternatives, []);
  assert.deepEqual(ingredientGuidance('Coconut Liqueur', byName('Lazy Coconut Paloma')).alternatives, []);
});
test('plain-language ingredient search and recipe search agree across app/API engines', () => {
  for (const query of ['almond liqueur', 'cinnamon liqueur', 'sweet apple', 'aromatic citrus']) {
    assert.deepEqual(searchIngredients(ingredients, query), searchIngredientIndex(ingredients, query));
    assert.ok(searchIngredients(ingredients, query).length > 0);
  }
  const recipe = byName('Mudslinger');
  assert.ok(recipeSearchScore(recipe, 'sweet spiced whisky') >= 0);
  assert.equal(serverScore(recipe, 'sweet spiced whisky'), recipeSearchScore(recipe, 'sweet spiced whisky'));
});
test('a bottle/type alternative unlocks recipes and remains explicitly identified', () => {
  const result = match('Blue Margarita', ['Tequila', 'Triple sec', 'Lime juice']);
  assert.equal(result.missingCount, 0);
  assert.equal(result.ingredients.find(item => item.name === 'Blue Curacao').alternative.label, 'Triple sec');
  assert.deepEqual(matchRecipes([byName('Blue Margarita')], ['Tequila', 'Triple sec', 'Lime juice']).canMake, [result]);
});
test('unmeasured home ideas do not silently become owned branded liqueurs', () => {
  const recipe = byName('Mudslinger');
  const result = match('Mudslinger', ['Whisky', 'Honey', 'Orange peel', 'Orange juice', 'Pepsi Cola']);
  assert.equal(result.missingCount, 1);
  assert.ok(result.missing.includes('Southern Comfort'));
  assert.equal(result.ingredients[0].measure, recipe.ingredients[0].measure);
  const made = match('Mudslinger', ['Homemade sweet spiced whisky', 'Orange juice', 'Pepsi Cola']);
  assert.equal(made.missingCount, 0);
  assert.equal(made.ingredients[0].alternative.kind, 'prepared');
});
test('measured quick preparations need every non-staple input and show Prep first', () => {
  const enough = ['Vodka', 'Almond extract', 'Vanilla extract'];
  const prepared = match('Godmother', enough);
  assert.equal(prepared.missingCount, 0);
  assert.equal(prepared.preparationCount, 1);
  assert.equal(prepared.ingredients.find(item => item.name === 'Amaretto').alternative.kind, 'prepare');
  assert.equal(match('Godmother', ['Vodka', 'Almond extract']).missingCount, 1);
  const analysis = pantryAnalysis([{ ...byName('Godmother'), ingredients: byName('Godmother').ingredients.map(item => item.name) }], enough);
  assert.equal(analysis.availability.get(byName('Godmother').id), 'Prep first');
  assert.equal(analysis.groups[0].length, 1);
});
test('infusion inputs never count as finished liqueur and sensitive recipes retain the original', () => {
  const guide = ingredientGuide('Pisang Ambon');
  const r = byName('Avalon');
  const raw = resolveIngredient('Pisang Ambon', ['Banana', 'Rum', 'Sugar'], r, ingredientMatches, () => false);
  assert.equal(raw.have, false);
  assert.ok(guide.timing.includes('4 days'));
  const abc = match('ABC', ['Vodka', 'Almond extract', 'Vanilla extract', 'Baileys', 'Cognac']);
  assert.ok(abc.missing.includes('Amaretto'));
  const paloma = byName('Lazy Coconut Paloma');
  assert.equal(resolveIngredient('Coconut Liqueur', ['Malibu'], paloma, ingredientMatches, () => false).have, false);
  assert.equal(resolveIngredient('Hot Damn', ['Homemade cinnamon liqueur'], byName('Herbal flame'), ingredientMatches, () => false).have, false);
});
test('flavours, dairy, proof and colour do not collapse into broad ingredient equivalence', () => {
  for (const [a,b] of [['Gin','Sloe gin'], ['Rum','Coconut rum'], ['Apple juice','Apfelkorn'], ['Vodka','Cranberry vodka'], ['Cinnamon syrup','Hot Damn'], ['Irish cream','Creme de Cacao'], ['Godiva liqueur','Dark Creme de Cacao'], ['Green Creme de Menthe','White Creme de Menthe'], ['Sour apple schnapps','Apple Schnapps'], ['Blackberry brandy','Creme de Mure']]) assert.equal(ingredientMatches(a,b), false, `${a} / ${b}`);
  assert.equal(ingredientMatches('Almond liqueur','Amaretto'), true);
  assert.equal(ingredientMatches('Cinnamon liqueur','Hot Damn'), true);
  assert.equal(ingredientMatches('Triple sec','Blue Curacao'), false); // recipe-scoped alternative, not identity
});

test('saved/public recipe content cannot retain Shelf availability or replacement selections', async () => {
  const { recipeContent } = await import('../src/recipeContent.ts');
  const matched = match('Godmother', ['Vodka', 'Almond extract', 'Vanilla extract']);
  const clean = recipeContent(matched);
  assert.equal(clean.id, matched.id);
  assert.deepEqual(clean.ingredients, byName('Godmother').ingredients.map(({name, measure, optional, guidance}) => ({ name, measure, ...(optional ? {optional} : {}), ...(guidance ? {guidance} : {}) })));
  for (const key of ['missing', 'missingCount', 'preparationCount', 'matchRatio', 'alternativeCount']) assert.equal(key in clean, false);
  assert.ok(matched.ingredients.some(item => item.alternative));
  const oldSave = { ...clean, ingredients: clean.ingredients.map(({ name, measure }) => ({ name, measure })) };
  assert.deepEqual(recipeContent(oldSave).ingredients, clean.ingredients);
});

test('specific proof and base requirements need an explicitly identified bottle', () => {
  const check = (name, stock, recipe) => resolveIngredient(name, stock, byName(recipe), ingredientMatches, () => false).have;
  assert.equal(check('Hot Damn', ['Hot Damn'], 'Herbal flame'), false);
  assert.equal(check('Hot Damn', ['Hot Damn 100'], 'Herbal flame'), true);
  assert.equal(check('Coconut Liqueur', ['Coconut Liqueur'], 'Lazy Coconut Paloma'), false);
  assert.equal(check('Coconut Liqueur', ['Tequila-based coconut liqueur'], 'Lazy Coconut Paloma'), true);
});

test('home-page availability cannot reuse a generic coconut result for the tequila-specific recipe', () => {
  const analysis = pantryAnalysis([
    { id: 'layered-coconut', name: 'Other coconut recipe', ingredients: ['Coconut Liqueur'], instructions: 'Layer the ingredients.' },
    { id: '178335', name: 'Lazy Coconut Paloma', ingredients: ['Coconut Liqueur'] },
  ], ['Coconut Liqueur'], { suggestions: false });
  assert.equal(analysis.groups[0].length, 1);
  assert.equal(analysis.groups[1][0].name, 'Lazy Coconut Paloma');
});

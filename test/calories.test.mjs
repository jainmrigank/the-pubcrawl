import test from 'node:test';
import assert from 'node:assert/strict';
import { calorieDrinks, drinkEnergy, energyIngredients, roundedKcal } from '../src/calorieData.ts';
const drink = id => calorieDrinks.find(row => row.id === id);

test('calorie coverage contains all 20 surveyed classics, stated beer/wine serves and 30 ml shots', () => {
  const cocktails = calorieDrinks.filter(row => row.group === 'cocktail');
  assert.equal(cocktails.length, 20);
  assert.deepEqual(cocktails.map(row => row.rank), Array.from({ length: 20 }, (_, i) => i + 1));
  assert.equal(new Set(calorieDrinks.map(row => row.id)).size, calorieDrinks.length);
  assert.equal(drink('beer').parts[0][1], 568);
  assert.equal(drink('red-wine').parts[0][1], 150);
  assert.equal(drink('white-wine').parts[0][1], 150);
  const shots = calorieDrinks.filter(row => row.group === 'shot');
  assert.equal(shots.length, 16);
  assert.ok(shots.every(row => row.parts.length === 1 && row.parts[0][1] === 30));
  for (const row of cocktails) assert.ok(row.recipeSource.url.startsWith('https://'));
  for (const row of Object.values(energyIngredients)) {
    assert.ok(row.basis);
    assert.ok(row.source.url.startsWith('https://'));
  }
});

test('equal-strength unsweetened shots agree while liqueur sugar contributes energy', () => {
  const vodka = drinkEnergy(drink('shot-vodka'));
  assert.ok(Math.abs(vodka.total - 66.3) < .1);
  assert.equal(vodka.other, 0);
  for (const id of ['gin', 'rum', 'whisky', 'tequila', 'cognac']) assert.equal(drinkEnergy(drink('shot-' + id)).total, vodka.total);
  const orange = drinkEnergy(drink('shot-triple'));
  assert.ok(Math.abs(orange.total - 92.7) < .01);
  assert.equal(orange.alcohol, vodka.alcohol);
  assert.ok(orange.other > 26);
  assert.ok(drinkEnergy(drink('shot-coffeeLiqueur')).total > vodka.total);
});

test('published lager serving reconciles and added dilution never changes whole-serving calories', () => {
  assert.ok(Math.abs(drinkEnergy(drink('beer')).total - 238.56) < .01);
  const original = drink('negroni');
  const diluted = { ...original, parts: [...original.parts, ['soda', 200]] };
  assert.deepEqual(drinkEnergy(diluted), drinkEnergy(original));
  const doubled = { ...original, parts: original.parts.map(([id, amount]) => [id, amount * 2]) };
  assert.equal(drinkEnergy(doubled).total, drinkEnergy(original).total * 2);
});

test('all calorie rows reconcile nonnegative alcohol and other energy without masking missing ingredients', () => {
  for (const row of calorieDrinks) {
    const energy = drinkEnergy(row);
    assert.ok(Number.isFinite(energy.total) && energy.total > 0, row.name);
    assert.ok(energy.alcohol >= 0 && energy.alcohol <= energy.total, row.name);
    assert.ok(Math.abs(energy.alcohol + energy.other - energy.total) < 1e-9, row.name);
    assert.ok(Math.abs(roundedKcal(energy.total) - energy.total) <= 2.5);
  }
  assert.throws(() => drinkEnergy({ parts: [['unknown ingredient', 20]] }), /Unknown calorie ingredient/);
});

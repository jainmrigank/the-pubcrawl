import { ingredientMatches, isStaple } from '../shared/catalog-engine.mjs';
import { resolveIngredient, ingredientGuide, alternativeAllowed } from '../shared/ingredient-guide.mjs';
export type AtlasRecipe = {
  id: string;
  name: string;
  ingredients: string[];
  vibe: string;
  glass: string;
  classic: boolean;
};
export function pantryAnalysis(recipes: AtlasRecipe[], pantry: string[], options: { suggestions?: boolean } = {}) {
  const cache = new Map<string, ReturnType<typeof resolveIngredient>>();
  const resolve = (id: string, recipe: AtlasRecipe, stock = pantry, memo = cache) => {
    const guide = ingredientGuide(id);
    const variant = guide?.id === 'IC02' && recipe.id === '15813' ? '|proof100' : guide?.id === 'IC26' && recipe.id === '178335' ? '|tequila' : '';
    const cacheKey = id + variant + (guide && !alternativeAllowed(recipe, guide) ? '|original' : '|normal');
    if (!memo.has(cacheKey)) memo.set(cacheKey, resolveIngredient(id, stock, recipe, ingredientMatches, isStaple));
    return memo.get(cacheKey)!;
  };
  const availability = new Map<string, string>();
  const groups: AtlasRecipe[][] = [[], [], [], []];
  const unlocks = new Map<string, number>();
  const missing = new Map<string, string[]>();
  for (const recipe of recipes) {
    const resolved = recipe.ingredients.map(id => ({ id, ...resolve(id, recipe) }));
    const absent = resolved.filter(item => !item.have).map(item => item.id);
    availability.set(recipe.id, resolved.some(item => item.alternative?.kind === 'prepare') ? 'Prep first' : resolved.some(item => item.alternative) ? 'With alternatives' : 'Ready now');
    missing.set(recipe.id, absent);
    groups[Math.min(3, absent.length)].push(recipe);
    if (absent.length === 1)
      unlocks.set(absent[0], (unlocks.get(absent[0]) || 0) + 1);
  }
  // A name alias can unlock several exact-name rows at once. Report the
  // actual marginal change, while the catalogue's pair/count data stays exact.
  for (const candidate of options.suggestions === false ? [] : unlocks.keys()) {
    const expanded = [...pantry, candidate];
    const memo = new Map<string, ReturnType<typeof resolveIngredient>>();
    const count = recipes.filter(recipe => missing.get(recipe.id)!.length > 0 && recipe.ingredients.every(id => resolve(id, recipe, expanded, memo).have)).length;
    unlocks.set(candidate, count);
  }
  return {
    groups,
    missing,
    availability,
    next: [...unlocks].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  };
}
export function dilutedNegroni(water: number) {
  const ethanol = 30 * 0.4 + 30 * 0.25 + 30 * 0.16;
  return { ethanol, volume: 90 + water, abv: (ethanol / (90 + water)) * 100 };
}
export function alcoholUnits(ml: number, abv: number) {
  const ethanol = (ml * abv) / 100;
  // NHS equivalence: 10 ml ≈ 8 g. This is an intentionally approximate comparison.
  return {
    ethanol,
    uk: ethanol / 10,
    grams: ethanol * 0.8,
    us: (ethanol * 0.8) / 14,
  };
}
export function blendAge(ages: number[], weights: number[]) {
  const active = ages.filter((_, i) => weights[i] > 0);
  const total = weights.reduce((a, b) => a + b, 0);
  return {
    youngest: active.length ? Math.min(...active) : null,
    mean: total
      ? ages.reduce((sum, age, i) => sum + age * weights[i], 0) / total
      : null,
    total,
  };
}
export const bottlePours = (litres: number, servingMl: number) => ({
  pours: Math.floor((litres * 1000) / servingMl),
  remainder: (litres * 1000) % servingMl,
});

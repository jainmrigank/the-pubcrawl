export type AtlasRecipe = {
  id: string;
  name: string;
  ingredients: string[];
  vibe: string;
  glass: string;
  classic: boolean;
};
export function pantryAnalysis(recipes: AtlasRecipe[], pantry: string[]) {
  const shelf = new Set(pantry);
  const groups: AtlasRecipe[][] = [[], [], [], []];
  const unlocks = new Map<string, number>();
  const missing = new Map<string, string[]>();
  for (const recipe of recipes) {
    const absent = recipe.ingredients.filter((id) => !shelf.has(id));
    missing.set(recipe.id, absent);
    groups[Math.min(3, absent.length)].push(recipe);
    if (absent.length === 1)
      unlocks.set(absent[0], (unlocks.get(absent[0]) || 0) + 1);
  }
  return {
    groups,
    missing,
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

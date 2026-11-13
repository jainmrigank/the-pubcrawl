const featuredIngredients = ['Vodka', 'Gin', 'Sugar', 'Lemon juice', 'Lime juice', 'Orange juice'];
const normalize = (name) => name.trim().toLowerCase();

/** Exact ingredient mentions, never an estimate of pantry matchability. */
export function buildLandingIngredients(recipes, dataVersion) {
  return {
    dataVersion,
    catalogueCount: recipes.length,
    ingredients: featuredIngredients.map((name) => {
      const matching = recipes.filter((recipe) => recipe.ingredients.some((ingredient) => normalize(ingredient.name) === normalize(name)));
      const unique = [...new Map(matching.map((recipe) => [recipe.id, recipe])).values()];
      unique.sort((a, b) => Number(Boolean(b.iba)) - Number(Boolean(a.iba)) || a.name.localeCompare(b.name, 'en') || String(a.id).localeCompare(String(b.id), 'en'));
      return { name, count: unique.length, recipes: unique.slice(0, 8).map(({ id, name: recipeName }) => ({ id, name: recipeName })) };
    }),
  };
}

import type { Recipe } from './types';
import { ingredientGuidance } from '../shared/ingredient-guide.mjs';

/** Keep recipe content separate from the reader's current Shelf availability. */
export function recipeContent(recipe: Recipe): Recipe {
  const content = { ...recipe };
  for (const key of ['alternativeCount', 'preparationCount', 'matched', 'missing', 'total', 'missingCount', 'requiredTotal', 'matchRatio', 'relatedIngredients']) {
    delete (content as unknown as Record<string, unknown>)[key];
  }
  content.ingredients = recipe.ingredients.map(({ name, measure, optional }) => {
    const guidance = ingredientGuidance(name, recipe);
    return { name, measure, ...(optional ? { optional } : {}), ...(guidance ? { guidance } : {}) };
  });
  return content;
}

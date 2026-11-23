export const featuredRecipeSlug: string;
export interface EditorialRecipe {
  slug: string;
  id: string;
  name: string;
  type: string;
  time: number;
  description: string;
  ingredients: Array<[string, number, string]>;
  steps: string[];
  note: string;
}
export const siteRecipes: EditorialRecipe[];
export function siteRecipePath(id: string): string | null;
export function exactRecipePath(id: string): string;

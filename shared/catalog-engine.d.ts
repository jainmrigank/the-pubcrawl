export function norm(value: unknown): string;
export function ingredientMatches(pantryName: string, recipeName: string): boolean;
export function isStaple(name: string): boolean;
export function recipeSearchScore(recipe: any, query: string, vibes?: Record<string, any>): number;
export function shelfMatchRecipes(recipes: any[], pantry: string[], options?: Record<string, any>): any[];
export function queryRecipes(recipes: any[], options?: Record<string, any>): { recipes: any[]; total: number; offset: number; limit: number; hasMore: boolean };
export const VIBE_IDS: readonly string[];

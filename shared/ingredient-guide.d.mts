export interface IngredientGuide {
  id: string; names: string[]; description: string; kind: string;
  suggestion: string; timing: string; difference: string; sources: string[];
  aliases: string[]; steps: string[]; alternatives: string[]; finished?: string; inputs?: string[];
  direct?: string[]; quick?: boolean;
}
export interface IngredientGuidance { guideId: string; description: string; alternatives: string[] }
export interface IngredientAlternative { kind: 'alternative' | 'prepared' | 'prepare'; label: string; guideId: string }
export const INGREDIENT_GUIDES: IngredientGuide[];
export const GUIDE_INGREDIENTS: {name: string; category: string; image: string}[];
export function ingredientGuide(name: string): IngredientGuide | undefined;
export function ingredientGuidance(name: string, recipe?: {id?: string; instructions?: string}): IngredientGuidance | undefined;
export function ingredientLabel(name: string): string;
export function ingredientSearchText(name: string): string;
export function ingredientSearchTokens(value: unknown): string[];
export function searchIngredientIndex<T extends { name: string }>(ingredients: T[], query: string, limit?: number): T[];
export function guideIngredientMatch(pantryName: string, recipeName: string): boolean | null;
export function alternativeAllowed(recipe: {id?: string; instructions?: string}, guide: IngredientGuide): boolean;
export function resolveIngredient(name: string, pantry: string[], recipe: {id?: string; instructions?: string}, matches: (a: string, b: string) => boolean, staple: (name: string) => boolean): {have: boolean; alternative?: IngredientAlternative};

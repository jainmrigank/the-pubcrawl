export interface PartyRecipe {
  id: string;
  name: string;
  items: Array<[name: string, amount: number, unit: string, timing?: 'serve']>;
  prep: string;
  serve: string;
  extras: string[];
}
export const partyRecipes: PartyRecipe[];
export function buildPartyPlan(
  selections: Array<{ recipe: PartyRecipe; servings: number }>, pantry?: string[]
): {
  rows: Array<{ name: string; unit: string; prepare: number; serve: number; onShelf: boolean }>;
  extras: Array<{ name: string; onShelf: boolean }>;
};
export function measure(n: number, unit: string): string;

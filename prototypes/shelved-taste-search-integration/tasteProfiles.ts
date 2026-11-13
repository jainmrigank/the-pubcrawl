import type { Recipe, RecipeIngredient } from './types';
import { ingredientMatches, isStaple, norm, queryRecipes } from '../shared/catalog-engine.mjs';
import { sameRecipeMeasure } from './measure.ts';
import type { BrowseFilter, Vibe } from './types';

export interface TasteProfile {
  id: string;
  x: number;
  y: number;
  kind: 'coupe' | 'rocks' | 'tall' | 'wine' | 'flute';
  garnish?: 'none' | 'peel' | 'salt' | 'cherry';
  colour: string;
  description: string;
  flavours: string[];
  neighbours: string[];
}

/** Recipe-informed editorial guidance, not measured tasting scores or ABV.
 * Only these named classics are placed. Unannotated recipes remain searchable.
 * Coordinates are ordinal; no numbers or precision claims are shown in the UI.
 */
export const TASTE_PROFILES: TasteProfile[] = [
  { id: '11005', x: 21, y: 20, kind: 'coupe', colour: '#b7b88f', description: 'Dry, herbal and led by gin.', flavours: ['herbal', 'bold'], neighbours: ['17255', '11008', '17197'] },
  { id: '11003', x: 77, y: 24, kind: 'rocks', garnish: 'peel', colour: '#b74b33', description: 'Bitter, herbal and citrusy.', flavours: ['bitter', 'herbal', 'citrus'], neighbours: ['17251', '15941', '11008'] },
  { id: '11006', x: 28, y: 74, kind: 'coupe', colour: '#d7cb8c', description: 'Crisp lime, softened by rum and sugar.', flavours: ['citrus', 'fresh'], neighbours: ['17255', '11007', '11000'] },
  { id: '178325', x: 78, y: 78, kind: 'wine', garnish: 'peel', colour: '#e48a41', description: 'Bittersweet orange with a sparkling finish.', flavours: ['bitter', 'fruit', 'bubbly'], neighbours: ['15941', '17197', '11003'] },
  { id: '11001', x: 76, y: 18, kind: 'rocks', garnish: 'peel', colour: '#bc844b', description: 'Whiskey, gentle sweetness and aromatic bitters.', flavours: ['bold', 'spice'], neighbours: ['11008', '17251', '11003'] },
  { id: '17255', x: 24, y: 39, kind: 'coupe', colour: '#c2c896', description: 'Gin and lime with a little sweetness.', flavours: ['citrus', 'herbal', 'fresh'], neighbours: ['11006', '11005', '11007'] },
  { id: '11007', x: 28, y: 78, kind: 'coupe', garnish: 'salt', colour: '#d3ca8b', description: 'Tart lime, orange liqueur and tequila.', flavours: ['citrus', 'fresh'], neighbours: ['11006', '17255', '17196'] },
  { id: '11000', x: 79, y: 78, kind: 'tall', colour: '#b7bc72', description: 'Fresh mint, lime and a long, sparkling finish.', flavours: ['herbal', 'fresh', 'bubbly'], neighbours: ['11006', '17255', '17197'] },
  { id: '17251', x: 78, y: 17, kind: 'rocks', garnish: 'peel', colour: '#a65a39', description: 'A whiskey-led mix of bitter and sweet.', flavours: ['bitter', 'bold', 'spice'], neighbours: ['11003', '11008', '11001'] },
  { id: '11008', x: 27, y: 33, kind: 'coupe', garnish: 'cherry', colour: '#a15b37', description: 'Whiskey and vermouth, rounded by bitters.', flavours: ['bold', 'spice', 'herbal'], neighbours: ['11001', '17251', '11003'] },
  { id: '17212', x: 25, y: 75, kind: 'coupe', colour: '#765342', description: 'Coffee bitterness with a softly sweet finish.', flavours: ['coffee', 'bold'], neighbours: ['12528', '11008', '11001'] },
  { id: '17207', x: 78, y: 82, kind: 'tall', colour: '#ded2ae', description: 'Pineapple and coconut, smooth and tropical.', flavours: ['fruit', 'coconut', 'smooth'], neighbours: ['12528', '11000', '11006'] },
  { id: '15941', x: 23, y: 25, kind: 'rocks', garnish: 'peel', colour: '#c05d3d', description: 'Campari bitterness and sweet vermouth.', flavours: ['bitter', 'herbal'], neighbours: ['11003', '17251', '178325'] },
  { id: '17197', x: 77, y: 33, kind: 'flute', colour: '#cec49b', description: 'Lemon and gin, lifted by sparkling wine.', flavours: ['citrus', 'fresh', 'bubbly'], neighbours: ['17255', '178325', '11000'] },
  { id: '12528', x: 27, y: 78, kind: 'rocks', colour: '#cabba4', description: 'Creamy coffee with a vodka base.', flavours: ['coffee', 'cream', 'smooth'], neighbours: ['17212', '17207', '11008'] },
  { id: '17196', x: 78, y: 78, kind: 'coupe', colour: '#cc7380', description: 'Cranberry, orange and a tart lime edge.', flavours: ['fruit', 'citrus', 'fresh'], neighbours: ['11007', '11006', '17197'] },
];

export const FLAVOUR_PATHS = [
  { id: 'fresh', label: 'Fresh & bright', words: ['tart', 'citrus', 'herbal', 'bubbly'] },
  { id: 'smooth', label: 'Sweet & smooth', words: ['fruit', 'coconut', 'cream'] },
  { id: 'bold', label: 'Bold & rich', words: ['bitter', 'coffee', 'spice'] },
] as const;

/** Acidity is an editorial filter, never inferred from a search keyword or plot position. */
export const TART_CLASSICS = new Set(['11006', '17255', '11007', '11000', '17197', '17196']);
export function hasTasteFlavour(profile: TasteProfile, flavour: string) {
  return flavour === 'tart' ? TART_CLASSICS.has(profile.id) : profile.flavours.includes(flavour);
}

export type TasteContext =
  | { kind: 'all' }
  | { kind: 'matches' }
  | { kind: 'shelf' }
  | { kind: 'flavour'; flavour: 'tart' | 'bitter' }
  | { kind: 'related'; anchorId: string };

export const hasTasteProfile = (id: string) => TASTE_PROFILES.some(profile => profile.id === id);

/** Reuse the library's keyword and category semantics, including vibe labels. */
export function mappedRecipeMatches(recipes: Recipe[], query: string, filter: BrowseFilter, vibes: Vibe[]): Recipe[] {
  return queryRecipes(recipes.filter(recipe => hasTasteProfile(recipe.id)), {
    q: query,
    category: filter.kind === 'category' ? filter.id : '',
    collection: filter.kind === 'collection' ? filter.id : '',
    limit: TASTE_PROFILES.length,
    vibes: Object.fromEntries(vibes.map(vibe => [vibe.id, vibe])),
  }).recipes;
}

export function offersTartIntent(query: string) {
  return ['sour', 'tart', 'citrusy', 'acidic'].includes(norm(query));
}

/** Directed, authored comparisons. The anchor stays fixed as people preview neighbours. */
export const TASTE_CONNECTIONS: Record<string, Record<string, string>> = {
  '11005': { '17255': 'Keep the gin; add lime and sweetness.', '11008': 'Trade gin for whiskey and sweet vermouth.', '17197': 'Keep the gin; add lemon and sparkling wine.' },
  '11003': { '17251': 'Keep Campari and vermouth; swap gin for whiskey.', '15941': 'Keep the bitter core; swap gin for soda.', '11008': 'Keep vermouth; switch to whiskey and aromatic bitters.' },
  '11006': { '17255': 'Keep the lime; trade rum for gin.', '11007': 'Keep the tart lime; switch to tequila and orange liqueur.', '11000': 'Keep rum and lime; add mint and soda.' },
  '178325': { '15941': 'Try Campari and vermouth with soda, without sparkling wine.', '17197': 'Keep the bubbles; try gin and lemon instead of Aperol.', '11003': 'Trade the bubbles for a gin-led bitter mix.' },
  '11001': { '11008': 'Keep whiskey and bitters; add sweet vermouth.', '17251': 'Keep whiskey; add Campari and sweet vermouth.', '11003': 'Try gin, Campari and vermouth for a bitter, herbal direction.' },
  '17255': { '11006': 'Keep the lime; trade gin for rum.', '11005': 'Keep the gin; leave the lime and sugar for dry vermouth.', '11007': 'Keep tart lime; try tequila and orange liqueur.' },
  '11007': { '11006': 'Keep lime; trade tequila and orange liqueur for rum and sugar.', '17255': 'Keep lime; try gin instead of tequila.', '17196': 'Keep lime and orange liqueur; add vodka and cranberry.' },
  '11000': { '11006': 'Keep rum and lime; leave the mint and soda behind.', '17255': 'Keep the lime; try a short gin drink without bubbles.', '17197': 'Keep citrus and bubbles; trade rum and mint for gin and lemon.' },
  '17251': { '11003': 'Keep Campari and vermouth; swap whiskey for gin.', '11008': 'Keep whiskey and vermouth; replace Campari with aromatic bitters.', '11001': 'Keep whiskey; simplify to sugar and aromatic bitters.' },
  '11008': { '11001': 'Keep whiskey and bitters; trade vermouth for sugar.', '17251': 'Keep whiskey and vermouth; use Campari for a bitter turn.', '11003': 'Keep vermouth; try gin and Campari instead of whiskey.' },
  '17212': { '12528': 'Keep vodka and coffee liqueur; trade espresso for cream.', '11008': 'Leave coffee behind; try whiskey, vermouth and bitters.', '11001': 'Leave coffee behind; try whiskey, sugar and bitters.' },
  '17207': { '12528': 'Keep a creamy texture; trade tropical fruit for coffee.', '11000': 'Keep rum; trade coconut and pineapple for mint and lime.', '11006': 'Keep rum; try a shorter, tart lime drink.' },
  '15941': { '11003': 'Keep Campari and vermouth; trade soda for gin.', '17251': 'Keep Campari and vermouth; trade soda for whiskey.', '178325': 'Keep bubbles; try Aperol and sparkling wine instead.' },
  '17197': { '17255': 'Keep gin; swap lemon and bubbles for lime.', '178325': 'Keep sparkling wine; trade gin and lemon for Aperol.', '11000': 'Keep citrus and bubbles; try rum, lime and mint.' },
  '12528': { '17212': 'Keep vodka and coffee liqueur; trade cream for espresso.', '17207': 'Keep a creamy texture; try rum, coconut and pineapple.', '11008': 'Leave cream behind; try whiskey, vermouth and bitters.' },
  '17196': { '11007': 'Keep lime and orange liqueur; swap vodka and cranberry for tequila.', '11006': 'Keep tart lime; simplify to rum and sugar.', '17197': 'Trade cranberry for gin, lemon and sparkling wine.' },
};

export function shelfAvailability(recipe: Recipe, pantry: string[]) {
  const required = recipe.ingredients.filter(item => !item.optional && !isStaple(item.name));
  const missing = required.filter(item => !pantry.some(name => ingredientMatches(name, item.name))).map(item => item.name);
  return { missing, available: missing.length === 0, matched: required.length - missing.length };
}

export interface IngredientDifference {
  key: string;
  name: string;
  left?: RecipeIngredient;
  right?: RecipeIngredient;
  status: 'shared' | 'left' | 'right';
  differentMeasure: boolean;
}

/** Exact normalized names, not substitution aliases. Preserve all quantities. */
export function ingredientDifferences(left: Recipe, right: Recipe): IngredientDifference[] {
  const rows = new Map<string, IngredientDifference>();
  left.ingredients.forEach(item => rows.set(norm(item.name), { key: norm(item.name), name: item.name, left: item, status: 'left', differentMeasure: false }));
  right.ingredients.forEach(item => {
    const key = norm(item.name), row = rows.get(key);
    if (row) { row.right = item; row.status = 'shared'; row.differentMeasure = !sameRecipeMeasure(row.left?.measure || '', item.measure); }
    else rows.set(key, { key, name: item.name, right: item, status: 'right', differentMeasure: false });
  });
  return [...rows.values()];
}

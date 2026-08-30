/**
 * Canonical recipe browse query and pagination logic.
 *
 * Keeping this pure makes the API contract testable without starting an HTTP
 * listener and ensures every caller computes `total` before slicing a page.
 */
import { norm, recipeSearchScore, visibleRecipes } from './catalog.mjs';
import { VIBES } from './vibes.mjs';

export const VALID_COLLECTIONS = new Set(['india', 'house']);
export const VALID_SORTS = new Set(['likes']);

export class RecipeQueryError extends Error {
  constructor(field) {
    super(`invalid ${field}`);
    this.name = 'RecipeQueryError';
    this.field = field;
  }
}

function finiteInteger(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
}

/** Parse canonical parameters while retaining the legacy `vibe` alias. */
export function normaliseRecipeQuery(query = {}) {
  const legacyVibe = String(query.vibe || '').trim();
  const requestedCategory = String(query.category || '').trim();
  const requestedCollection = String(query.collection || '').trim();
  let category = requestedCategory;
  let collection = requestedCollection;

  // Canonical parameters win whenever either is present. This means an
  // explicit empty canonical value also prevents an old `vibe` value from
  // unexpectedly changing the query.
  const hasCanonical = Object.prototype.hasOwnProperty.call(query, 'category')
    || Object.prototype.hasOwnProperty.call(query, 'collection');
  if (!hasCanonical && legacyVibe) {
    if (legacyVibe === 'indian') collection = 'india';
    else if (legacyVibe === 'house') collection = 'house';
    else category = legacyVibe;
  }

  if (category && !Object.prototype.hasOwnProperty.call(VIBES, category)) throw new RecipeQueryError('category');
  if (collection && !VALID_COLLECTIONS.has(collection)) throw new RecipeQueryError('collection');

  const sort = String(query.sort || '').trim();
  if (sort && !VALID_SORTS.has(sort)) throw new RecipeQueryError('sort');

  const parsedOffset = finiteInteger(query.offset);
  const parsedLimit = finiteInteger(query.limit);
  const offset = parsedOffset == null ? 0 : Math.max(0, parsedOffset);
  const limit = parsedLimit == null ? 12 : Math.min(Math.max(parsedLimit, 1), 48);

  return {
    category: category || '',
    collection: collection || '',
    q: norm(String(query.q || '')),
    offset,
    limit,
    seed: String(query.seed || 'x'),
    sort: sort || '',
  };
}

function stableHash(value, seed) {
  let idHash = 7;
  for (const character of String(value.id)) idHash = (idHash * 33 + character.charCodeAt(0)) >>> 0;
  return ((idHash + seed) * 2654435761) >>> 0;
}

function seedNumber(seedString) {
  let seed = 0;
  for (const character of seedString) seed = (seed * 31 + character.charCodeAt(0)) >>> 0;
  return seed;
}

/**
 * Build the response object for GET /api/recipes.
 * `likes` is injected so the function stays deterministic in tests.
 */
export function recipePage(cocktails, likes = {}, rawQuery = {}) {
  const query = normaliseRecipeQuery(rawQuery);
  let list = visibleRecipes(cocktails);
  if (query.category) list = list.filter((recipe) => recipe.vibe === query.category);
  if (query.collection === 'india') list = list.filter((recipe) => (recipe.tags || []).includes('India'));
  if (query.collection === 'house') list = list.filter((recipe) => recipe.houseOriginal === true);

  const scores = new Map();
  if (query.q) {
    list = list.filter((recipe) => {
      const score = recipeSearchScore(recipe, query.q);
      if (score < 0) return false;
      scores.set(recipe.id, score);
      return true;
    });
  }

  const hashSeed = seedNumber(query.seed);
  const hash = (recipe) => stableHash(recipe, hashSeed);
  const ordered = query.sort === 'likes'
    ? [...list].sort((a, b) => (likes[b.id] || 0) - (likes[a.id] || 0) || hash(a) - hash(b))
    : query.q
      ? [...list].sort((a, b) => scores.get(a.id) - scores.get(b.id) || hash(a) - hash(b))
      : [...list].sort((a, b) => hash(a) - hash(b));
  const recipes = ordered.slice(query.offset, query.offset + query.limit);
  return {
    recipes,
    total: ordered.length,
    offset: query.offset,
    limit: query.limit,
    hasMore: query.offset + recipes.length < ordered.length,
  };
}

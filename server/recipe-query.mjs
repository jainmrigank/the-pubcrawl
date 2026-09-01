/**
 * Render compatibility adapter for the runtime-neutral recipe query engine.
 * Keeping the actual filtering, ordering and pagination in ../shared means the
 * browser's static catalogue, Cloudflare Worker, and Express fallback agree.
 */
import { norm, queryRecipes } from '../shared/catalog-engine.mjs';
import { VIBES } from './vibes.mjs';
import { visibleRecipes } from './catalog.mjs';

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

/**
 * Build the response object for GET /api/recipes.
 * `likes` is injected so the function stays deterministic in tests.
 */
export function recipePage(cocktails, likes = {}, rawQuery = {}) {
  const query = normaliseRecipeQuery(rawQuery);
  return queryRecipes(visibleRecipes(cocktails), { ...query, likes, vibes: VIBES });
}

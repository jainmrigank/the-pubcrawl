import { hasRecipeImage, loadCatalog, norm } from './catalog.mjs';

export const SHORT_LANES = ['craft', 'education', 'comedy', 'people'];
export const MAX_SHORTS = 180;
export const MAX_SHORT_DURATION_SECONDS = 180;
export const SESSION_CAP = 50;

const idPattern = /^[A-Za-z0-9_-]{11}$/;

const photographedRecipes = loadCatalog().cocktails.filter(hasRecipeImage);

/** Match the same name/ingredient/meta fields exposed by GET /api/recipes. */
export function recipeQueryHasPhoto(query) {
  const q = norm(String(query || ''));
  if (!q) return false;
  return photographedRecipes.some((recipe) => {
    const name = norm(recipe.name);
    if (name === q || name.startsWith(q) || name.includes(q)) return true;
    if (recipe.ingredients.some((ingredient) => norm(ingredient.name).includes(q))) return true;
    const meta = `${norm(recipe.category)} ${norm(recipe.iba || '')} ${(recipe.tags || []).map((tag) => norm(tag)).join(' ')}`;
    return meta.includes(` ${q} `);
  });
}

export function validateShort(video) {
  const errors = [];
  if (!video || typeof video !== 'object') return { ok: false, errors: ['entry must be an object'] };
  if (!idPattern.test(String(video.id || ''))) errors.push('id must be an 11-character YouTube id');
  for (const key of ['title', 'channel', 'channelId', 'addedAt', 'publishedAt', 'thumbnail']) {
    if (typeof video[key] !== 'string' || !video[key].trim()) errors.push(`${key} is required`);
  }
  if (!SHORT_LANES.includes(video.lane)) errors.push(`lane must be one of ${SHORT_LANES.join(', ')}`);
  if (!Number.isInteger(video.rank) || video.rank < 1) errors.push('rank must be a positive integer');
  if (!Number.isFinite(video.durationSeconds) || video.durationSeconds < 1 || video.durationSeconds > MAX_SHORT_DURATION_SECONDS)
    errors.push(`durationSeconds must be between 1 and ${MAX_SHORT_DURATION_SECONDS}`);
  if (video.recipeQuery != null && (typeof video.recipeQuery !== 'string' || video.recipeQuery.length > 80))
    errors.push('recipeQuery must be a short string');
  if (video.evergreen != null && typeof video.evergreen !== 'boolean') errors.push('evergreen must be boolean');
  return { ok: errors.length === 0, errors };
}

export function validateShortCatalogue(input, { max = MAX_SHORTS, min = 0 } = {}) {
  const shorts = Array.isArray(input) ? input : input?.shorts;
  const errors = [];
  if (!Array.isArray(shorts)) return { ok: false, errors: ['shorts must be an array'], shorts: [] };
  if (shorts.length < min) errors.push(`catalogue needs at least ${min} entries`);
  if (shorts.length > max) errors.push(`catalogue cannot exceed ${max} entries`);
  const seen = new Set();
  shorts.forEach((video, index) => {
    const result = validateShort(video);
    if (!result.ok) errors.push(`shorts[${index}]: ${result.errors.join('; ')}`);
    if (result.ok && video?.recipeQuery && !recipeQueryHasPhoto(video.recipeQuery)) {
      errors.push(`shorts[${index}]: recipeQuery has no photographed recipe`);
    }
    if (video?.id && seen.has(video.id)) errors.push(`duplicate id: ${video.id}`);
    if (video?.id) seen.add(video.id);
  });
  return { ok: errors.length === 0, errors, shorts };
}

/** Remove entries marked dead by the protected Monday refresh. */
export function filterDeadShorts(shorts, stats = {}) {
  return (Array.isArray(shorts) ? shorts : []).filter((video) => !stats?.[video.id]?.dead);
}

/** Keep the newest reviewed entries without silently changing their order. */
export function limitShorts(shorts, max = MAX_SHORTS) {
  return (Array.isArray(shorts) ? shorts : []).slice(0, max).map((video, index) => ({ ...video, rank: index + 1 }));
}

const counterFields = [
  'videosStarted',
  'advances',
  'shares',
  'recipeClicks',
  'autoplayFailures',
  'unavailableSkips',
  'bufferingEvents',
];
const numberFields = [...counterFields, 'startupMsTotal'];
const sources = new Set(['landing', 'nav', 'deep-link', 'direct']);
const FIELD_CAPS = Object.fromEntries([
  ...counterFields.map((field) => [field, SESSION_CAP]),
  // A session may start up to 50 Shorts. Keep this bounded while allowing a
  // realistic aggregate of measured milliseconds instead of applying the
  // event-counter cap to a duration total.
  ['startupMsTotal', 300000],
]);

/** Validate and cap the anonymous, aggregate-only session payload. */
export function validateShortSession(body) {
  const source = String(body?.source || 'direct');
  if (!sources.has(source)) return { ok: false, error: 'source must be landing, nav, deep-link, or direct' };
  const values = {};
  for (const field of numberFields) {
    const value = Number(body?.[field] ?? 0);
    const cap = FIELD_CAPS[field];
    if (!Number.isFinite(value) || value < 0 || value > cap) return { ok: false, error: `${field} must be between 0 and ${cap}` };
    values[field] = Math.floor(value);
  }
  return { ok: true, value: { source, ...values } };
}

export const emptyShortMetrics = () => ({
  sessions: 0,
  landingSessions: 0,
  navSessions: 0,
  deepLinkSessions: 0,
  videosStarted: 0,
  advances: 0,
  shares: 0,
  recipeClicks: 0,
  autoplayFailures: 0,
  unavailableSkips: 0,
  bufferingEvents: 0,
  startupMsTotal: 0,
});

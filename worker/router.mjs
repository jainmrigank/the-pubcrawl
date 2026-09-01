import catalogue from '../src/generated/client_catalog.json' with { type: 'json' };
import questionBank from '../src/generated/client_quiz.json' with { type: 'json' };
import watchData from '../data/watchlist.json' with { type: 'json' };
import shortsData from '../data/shorts.json' with { type: 'json' };
import { norm, queryRecipes, shelfMatchRecipes } from '../shared/catalog-engine.mjs';
import { generateDrink, identifyIngredients } from './ai.mjs';
import { dailyQuizQuestion, quizPlaylist } from '../shared/quiz-engine.mjs';
import {
  STORE_KEYS,
  appendUniqueAtomic,
  consumeWindowCounter,
  incrementCountersAtomic,
  prependCappedAtomic,
  readJson,
  removeSubscriptionAtomic,
  storeConfigured,
  touchSubscriptionAtomic,
  updateHighScoreAtomic,
  updateLikeAtomic,
  upsertSubscriptionAtomic,
} from './store.mjs';

const ALLOWED_ORIGINS = new Set([
  'https://the-pubcrawl.vercel.app',
  'http://127.0.0.1:5175',
  'http://localhost:5175',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
]);
const LIKE_KEY = STORE_KEYS.likes;
const KEPT_KEY = STORE_KEYS.kept;
const HIGH_KEY = STORE_KEYS.high;
const HALL_KEY = STORE_KEYS.hall;
const SHORT_METRICS_KEY = STORE_KEYS.shortMetrics;
const WATCH_METRICS_KEY = STORE_KEYS.watchMetrics;
const SUBS_KEY = STORE_KEYS.subs;

const VIBE_IDS = new Set(['tropical', 'refreshing', 'boozy', 'sweet', 'cozy', 'party', 'zeroproof']);
const COLLECTION_IDS = new Set(['india', 'house']);
const LANE_DEFS = Object.freeze([
  { id: 'craft', label: 'The Craft', color: '#8A5A24' },
  { id: 'education', label: 'Learn It', color: '#5C7A3B' },
  { id: 'comedy', label: 'For The Laugh', color: '#4A4E7A' },
  { id: 'people', label: 'People & Drink', color: '#8E4A5B' },
]);

const EMPTY_SHORT_METRICS = Object.freeze({ sessions: 0, videosStarted: 0, advances: 0, shares: 0, recipeClicks: 0, autoplayFailures: 0, unavailableSkips: 0, bufferingEvents: 0, startupMsTotal: 0 });
const EMPTY_WATCH_METRICS = Object.freeze({ impressions: 0, opens: 0, landingOpens: 0, navOpens: 0, deepLinkOpens: 0, directOpens: 0 });
const RATE_LIMIT_WINDOW_SECONDS = 24 * 60 * 60;
const RATE_LIMITS = Object.freeze({ identify: 20, generate: 40 });
const SHORT_SESSION_FIELDS = Object.freeze([
  'videosStarted', 'advances', 'shares', 'recipeClicks',
  'autoplayFailures', 'unavailableSkips', 'bufferingEvents', 'startupMsTotal',
]);

function corsHeaders(origin) {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-push-secret',
    Vary: 'Origin',
  });
  // handleApi validates the origin before any response is created, so any
  // origin reaching this helper is safe to reflect (including configured
  // preview/custom origins).
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

function json(value, status = 200, origin, extra = {}) {
  const headers = corsHeaders(origin);
  headers.set('content-type', 'application/json; charset=utf-8');
  for (const [key, entry] of Object.entries(extra)) headers.set(key, entry);
  return new Response(JSON.stringify(value), { status, headers });
}

function cacheHeaders() {
  return { 'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400', 'X-PubCrawl-Data-Version': catalogue.dataVersion };
}

const readBlob = readJson;

function clientAddress(request) {
  return request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'anonymous';
}

async function hashedClient(request, env) {
  const salt = String(env.RATE_LIMIT_SALT || '').trim();
  if (!salt) throw new Error('rate limit salt is not configured');
  const material = new TextEncoder().encode(`${salt}:${clientAddress(request)}`);
  // Workers and supported local Node versions both expose Web Crypto. Keeping
  // this implementation runtime-neutral avoids importing Node's crypto module
  // into the Worker bundle.
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(salt),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, material));
  return [...signature].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function consumeRateLimit(request, env, kind) {
  const limit = RATE_LIMITS[kind];
  if (!limit) return { allowed: true, count: 0 };
  const bucket = `${kind}:${await hashedClient(request, env)}`;
  const count = await consumeWindowCounter(env, `pubcrawl:ratelimit:${bucket}`, RATE_LIMIT_WINDOW_SECONDS);
  return { allowed: count <= limit, count };
}

function tooLarge(request) {
  const declared = Number(request.headers.get('content-length') || 0);
  return Number.isFinite(declared) && declared > 15 * 1024 * 1024;
}

function canonicalFilter(url) {
  // `.has()` matters here: `?category=` is an intentional canonical value and
  // must not fall back to a stale legacy `vibe` parameter.
  const hasCategory = url.searchParams.has('category');
  const hasCollection = url.searchParams.has('collection');
  const category = hasCategory ? (url.searchParams.get('category') || '').trim() : '';
  const collection = hasCollection ? (url.searchParams.get('collection') || '').trim() : '';
  const legacy = url.searchParams.get('vibe') || '';
  const finalCategory = hasCategory || hasCollection
    ? category
    : legacy && !['indian', 'house'].includes(legacy) ? legacy : '';
  const finalCollection = hasCategory || hasCollection
    ? collection
    : legacy === 'indian' ? 'india' : legacy === 'house' ? 'house' : '';
  if (finalCategory && !VIBE_IDS.has(finalCategory)) throw new Error('invalid category');
  if (finalCollection && !COLLECTION_IDS.has(finalCollection)) throw new Error('invalid collection');
  return { category: finalCategory, collection: finalCollection };
}

function parseJsonBody(request) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return Promise.reject(new Error('content-type must be application/json'));
  }
  return request.json();
}

function staticLibrary(raw, key, outputKey) {
  const source = Array.isArray(raw?.[key]) ? raw[key] : [];
  const items = source.filter((item) => item && item.id && item.title).map((item) => ({
    ...item,
    lane: item.lane || 'craft',
    views: item.views ?? null,
    likes: item.likes ?? null,
    movement: item.movement || 0,
  }));
  return { [outputKey]: items, lanes: LANE_DEFS, hasNumbers: items.some((item) => item.views != null), updatedAt: null };
}

async function mergedRecipes(env) {
  let kept;
  try {
    kept = await readBlob(env, KEPT_KEY, []);
  } catch {
    // Browsing must stay available when the optional durable overlay is
    // temporarily unavailable. The immutable audited catalogue is still a
    // complete, valid response; a later request can rehydrate kept drinks.
    return catalogue.recipes;
  }
  const extras = Array.isArray(kept) ? kept : [];
  const known = new Set(catalogue.recipes.map((recipe) => recipe.id));
  return extras.length
    ? [...catalogue.recipes, ...extras.filter((recipe) => recipe?.id && !known.has(recipe.id))]
    : catalogue.recipes;
}

function validateShortSessionBody(body) {
  const sources = new Set(['landing', 'nav', 'deep-link', 'direct']);
  const source = String(body?.source || 'direct');
  if (!sources.has(source)) return { ok: false, error: 'source must be landing, nav, deep-link, or direct' };
  const values = { source };
  for (const field of SHORT_SESSION_FIELDS) {
    const cap = field === 'startupMsTotal' ? 300000 : 50;
    const value = Number(body?.[field] ?? 0);
    if (!Number.isFinite(value) || value < 0 || value > cap) return { ok: false, error: `${field} must be between 0 and ${cap}` };
    values[field] = Math.floor(value);
  }
  return { ok: true, value: values };
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function handleApi(request, env, context) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  const configuredOrigins = String(env.FRONTEND_ORIGIN || '')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const allowedOrigins = new Set([...ALLOWED_ORIGINS, ...configuredOrigins]);
  if (origin && !allowedOrigins.has(origin)) return json({ error: 'origin not allowed' }, 403, undefined);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (path === '/api/health' && request.method === 'GET') {
    return json({
      ok: true,
      runtime: 'cloudflare-worker',
      dataVersion: catalogue.dataVersion,
      cocktails: catalogue.health.cocktails,
      catalogueCocktails: catalogue.health.catalogueCocktails,
      ingredients: catalogue.health.ingredients,
      llm: env.LLM_API_KEY ? (env.LLM_MODEL || 'configured') : null,
      store: storeConfigured(env) ? 'upstash' : 'unconfigured',
    }, 200, origin, { 'Cache-Control': 'no-store' });
  }

  if (path === '/api/vibes' && request.method === 'GET') return json(catalogue.vibes, 200, origin, cacheHeaders());

  if (path === '/api/ingredients/search' && request.method === 'GET') {
    const q = norm(url.searchParams.get('q') || '');
    const limit = Math.min(30, Math.max(1, Number(url.searchParams.get('limit')) || 12));
    const ingredients = q ? catalogue.ingredients.filter((item) => norm(item.name).includes(q)).slice(0, limit) : [];
    return json(ingredients, 200, origin, cacheHeaders());
  }

  if (path === '/api/recipes' && request.method === 'GET') {
    let filter;
    let requestedSort;
    try {
      filter = canonicalFilter(url);
      requestedSort = (url.searchParams.get('sort') || '').trim();
      if (requestedSort && requestedSort !== 'likes') throw new Error('invalid sort');
    } catch (error) {
      return json({ error: error.message || 'invalid query' }, 400, origin);
    }
    // Kept drinks and likes are optional dynamic overlays. A store timeout
    // must not turn an otherwise valid catalogue request into a misleading
    // 400 or a long retry loop; serve the immutable local catalogue instead.
    const recipes = await mergedRecipes(env);
    let likes = {};
    if (requestedSort === 'likes') {
      try { likes = await readBlob(env, LIKE_KEY, {}); } catch { likes = {}; }
    }
    const page = queryRecipes(recipes, {
      ...filter,
      q: url.searchParams.get('q') || '',
      offset: url.searchParams.get('offset') || 0,
      limit: url.searchParams.get('limit') || 12,
      seed: url.searchParams.get('seed') || 'x',
      sort: requestedSort,
      likes,
    });
    return json(page, 200, origin, { 'Cache-Control': 'no-store', 'X-PubCrawl-Data-Version': catalogue.dataVersion });
  }

  if (path === '/api/recipes/match' && request.method === 'POST') {
    let body;
    try { body = await parseJsonBody(request); } catch { return json({ error: 'content-type must be application/json' }, 400, origin); }
    const pantry = Array.isArray(body?.ingredients) ? body.ingredients.map(String).filter(Boolean) : [];
    if (!pantry.length) return json({ canMake: [], almost: [] }, 200, origin, { 'Cache-Control': 'no-store' });
    const category = body?.category ? String(body.category) : '';
    const collection = body?.collection ? String(body.collection) : '';
    if (category && !VIBE_IDS.has(category)) return json({ error: 'invalid category' }, 400, origin);
    if (collection && !COLLECTION_IDS.has(collection)) return json({ error: 'invalid collection' }, 400, origin);
    const recipes = await mergedRecipes(env);
    const results = shelfMatchRecipes(recipes, pantry, { query: body?.q || '', category, collection, vibes: Object.fromEntries(catalogue.vibes.map((vibe) => [vibe.id, vibe])) });
    return json({ canMake: results.filter((item) => item.missingCount === 0), almost: results.filter((item) => item.missingCount > 0) }, 200, origin, { 'Cache-Control': 'no-store' });
  }

  if (path === '/api/kept' && request.method === 'GET') return json(await readBlob(env, KEPT_KEY, []), 200, origin, { 'Cache-Control': 'no-store' });
  if (path === '/api/likes' && request.method === 'GET') return json(await readBlob(env, LIKE_KEY, {}), 200, origin, { 'Cache-Control': 'no-store' });

  if (path === '/api/keep' && request.method === 'POST') {
    let body;
    try { body = await parseJsonBody(request); } catch { return json({ error: 'content-type must be application/json' }, 400, origin); }
    const recipe = body?.recipe || body;
    if (!recipe?.name || !Array.isArray(recipe.ingredients) || !recipe.ingredients.length) return json({ error: 'recipe required' }, 400, origin);
    const cleanIngredients = recipe.ingredients.map((item) => ({ name: String(item?.name || '').trim(), measure: String(item?.measure || '') })).filter((item) => item.name);
    if (!cleanIngredients.length) return json({ error: 'recipe ingredients required' }, 400, origin);
    const source = `${String(recipe.name).toLowerCase()}|${cleanIngredients.map((item) => item.name.toLowerCase()).join(',')}`;
    let hash = 5381;
    for (const character of source) hash = ((hash * 33) ^ character.charCodeAt(0)) >>> 0;
    const id = `kept-${hash.toString(36)}`;
    const drink = {
      id,
      name: String(recipe.name).trim(),
      tagline: String(recipe.tagline || ''),
      category: 'Kept Special',
      alcoholic: String(recipe.alcoholic || 'Alcoholic'),
      glass: String(recipe.glass || 'Coupe'),
      instructions: String(recipe.instructions || ''),
      thumb: '', video: '', tags: Array.isArray(recipe.tags) ? recipe.tags.map(String) : [], iba: '',
      ingredients: cleanIngredients, source: recipe.source === 'fallback' ? 'fallback' : 'ai', house: true, kept: true, browseable: true,
      vibe: VIBE_IDS.has(recipe.vibe) ? recipe.vibe : recipe.alcoholic === 'Non alcoholic' ? 'zeroproof' : 'boozy',
    };
    const kept = await appendUniqueAtomic(env, KEPT_KEY, drink, 1000);
    return json(kept, 200, origin, { 'Cache-Control': 'no-store' });
  }

  const likeMatch = path.match(/^\/api\/likes\/([^/]+)$/);
  if (likeMatch && request.method === 'POST') {
    const id = decodeURIComponent(likeMatch[1]);
    const recipes = await mergedRecipes(env);
    if (!recipes.some((recipe) => recipe.id === id)) return json({ error: 'Unknown drink' }, 404, origin);
    const body = await parseJsonBody(request).catch(() => ({}));
    const delta = body.action === 'unlike' ? -1 : 1;
    const current = await updateLikeAtomic(env, LIKE_KEY, id, delta);
    return json({ id, likes: current }, 200, origin, { 'Cache-Control': 'no-store' });
  }

  /* ---------------- local-first quiz compatibility ---------------- */
  if (path === '/api/quiz/stream' && request.method === 'GET') {
    const seed = url.searchParams.get('seed') || 'x';
    const from = Math.max(0, Math.floor(safeNumber(url.searchParams.get('from'), 0)));
    const count = Math.min(50, Math.max(1, Math.floor(safeNumber(url.searchParams.get('count'), 20))));
    const ordered = quizPlaylist(questionBank, seed);
    const high = await readBlob(env, HIGH_KEY, { score: 0, at: 0 });
    return json({ questions: ordered.slice(from, from + count), total: ordered.length, high: safeNumber(high?.score) }, 200, origin, { 'Cache-Control': 'no-store' });
  }

  if (path === '/api/quiz/today' && request.method === 'GET') {
    if (!questionBank.length) return json({ error: 'no questions loaded' }, 503, origin);
    return json(dailyQuizQuestion(questionBank), 200, origin, cacheHeaders());
  }

  if (path === '/api/quiz/high' && request.method === 'GET') {
    const [high, hall] = await Promise.all([
      readBlob(env, HIGH_KEY, { score: 0, at: 0 }),
      readBlob(env, HALL_KEY, []),
    ]);
    return json({ ...high, hall: Array.isArray(hall) ? hall : [], bank: questionBank.length }, 200, origin, { 'Cache-Control': 'no-store' });
  }

  if (path === '/api/quiz/high' && request.method === 'POST') {
    let body;
    try { body = await parseJsonBody(request); } catch { return json({ error: 'content-type must be application/json' }, 400, origin); }
    const score = safeNumber(body?.score, NaN);
    if (!Number.isFinite(score) || score < 0 || score > 1000) return json({ error: 'bad score' }, 400, origin);
    const next = await updateHighScoreAtomic(env, HIGH_KEY, score, Date.now());
    return json(next, 200, origin, { 'Cache-Control': 'no-store' });
  }

  if (path === '/api/quiz/hall' && request.method === 'POST') {
    let body;
    try { body = await parseJsonBody(request); } catch { return json({ error: 'content-type must be application/json' }, 400, origin); }
    const score = safeNumber(body?.score, NaN);
    const name = String(body?.name || '').replace(/\s+/g, ' ').trim().slice(0, 24);
    if (score !== questionBank.length) return json({ error: 'not a clean sweep' }, 400, origin);
    if (!name) return json({ error: 'need a name' }, 400, origin);
    const entry = { name, score, at: Date.now() };
    const hall = await prependCappedAtomic(env, HALL_KEY, entry, 50);
    return json({ hall, entry }, 200, origin, { 'Cache-Control': 'no-store' });
  }

  /* ---------------- immutable Watch and Shorts catalogues ---------------- */
  if (path === '/api/videos' && request.method === 'GET') return json(staticLibrary(watchData, 'videos', 'videos'), 200, origin, cacheHeaders());
  if (path === '/api/shorts' && request.method === 'GET') return json(staticLibrary(shortsData, 'shorts', 'shorts'), 200, origin, cacheHeaders());

  if (path === '/api/watch/event' && request.method === 'POST') {
    let body;
    try { body = await parseJsonBody(request); } catch { return json({ error: 'content-type must be application/json' }, 400, origin); }
    if (!['preview-impression', 'open'].includes(body?.type)) return json({ error: 'invalid watch event' }, 400, origin);
    if (body.type === 'open' && !['landing', 'nav', 'deep-link', 'direct'].includes(body.source || 'direct')) return json({ error: 'invalid watch source' }, 400, origin);
    const increments = body.type === 'preview-impression'
      ? { impressions: 1 }
      : {
          opens: 1,
          [body.source === 'landing' ? 'landingOpens' : body.source === 'nav' ? 'navOpens' : body.source === 'deep-link' ? 'deepLinkOpens' : 'directOpens']: 1,
        };
    const next = await incrementCountersAtomic(env, WATCH_METRICS_KEY, EMPTY_WATCH_METRICS, increments);
    return json({ ok: true, metrics: next }, 200, origin, { 'Cache-Control': 'no-store' });
  }

  if (path === '/api/watch/status' && request.method === 'GET') {
    if (!env.PUSH_SECRET || request.headers.get('x-push-secret') !== env.PUSH_SECRET) return json({ error: 'unauthorized' }, 401, origin);
    return json(await readBlob(env, WATCH_METRICS_KEY, EMPTY_WATCH_METRICS), 200, origin, { 'Cache-Control': 'no-store' });
  }

  if (path === '/api/shorts/session' && request.method === 'POST') {
    let body;
    try { body = await parseJsonBody(request); } catch { return json({ error: 'content-type must be application/json' }, 400, origin); }
    const parsedSession = validateShortSessionBody(body);
    if (!parsedSession.ok) return json({ error: parsedSession.error }, 400, origin);
    body = parsedSession.value;
    const increments = { sessions: 1 };
    for (const key of ['videosStarted', 'advances', 'shares', 'recipeClicks', 'autoplayFailures', 'unavailableSkips', 'bufferingEvents', 'startupMsTotal']) increments[key] = Math.max(0, safeNumber(body[key]));
    const next = await incrementCountersAtomic(env, SHORT_METRICS_KEY, EMPTY_SHORT_METRICS, increments);
    return json({ ok: true, metrics: next }, 200, origin, { 'Cache-Control': 'no-store' });
  }

  if (path === '/api/shorts/status' && request.method === 'GET') {
    if (!env.PUSH_SECRET || request.headers.get('x-push-secret') !== env.PUSH_SECRET) return json({ error: 'unauthorized' }, 401, origin);
    return json(await readBlob(env, SHORT_METRICS_KEY, EMPTY_SHORT_METRICS), 200, origin, { 'Cache-Control': 'no-store' });
  }

  /* ---------------- device-local web-push compatibility ---------------- */
  if (path === '/api/push/key' && request.method === 'GET') {
    return json({ key: env.VAPID_PUBLIC_KEY || null }, 200, origin, { 'Cache-Control': 'no-store' });
  }

  if (path === '/api/push/subscribe' && request.method === 'POST') {
    let body;
    try { body = await parseJsonBody(request); } catch { return json({ error: 'content-type must be application/json' }, 400, origin); }
    const subscription = body?.subscription;
    if (!subscription || typeof subscription.endpoint !== 'string' || !subscription.endpoint.startsWith('https://')) return json({ error: 'invalid subscription' }, 400, origin);
    await upsertSubscriptionAtomic(env, SUBS_KEY, subscription, Date.now(), 500);
    return json({ ok: true }, 200, origin, { 'Cache-Control': 'no-store' });
  }

  if (path === '/api/push/unsubscribe' && request.method === 'POST') {
    let body;
    try { body = await parseJsonBody(request); } catch { return json({ error: 'content-type must be application/json' }, 400, origin); }
    if (typeof body?.endpoint !== 'string') return json({ error: 'endpoint required' }, 400, origin);
    await removeSubscriptionAtomic(env, SUBS_KEY, body.endpoint);
    return json({ ok: true }, 200, origin, { 'Cache-Control': 'no-store' });
  }

  if (path === '/api/push/seen' && request.method === 'POST') {
    let body;
    try { body = await parseJsonBody(request); } catch { return json({ error: 'content-type must be application/json' }, 400, origin); }
    if (typeof body?.endpoint !== 'string') return json({ error: 'endpoint required' }, 400, origin);
    await touchSubscriptionAtomic(env, SUBS_KEY, body.endpoint, Date.now());
    return json({ ok: true }, 200, origin, { 'Cache-Control': 'no-store' });
  }

  // Dynamic/AI compatibility routes are intentionally explicit. The browser
  // can continue using its local catalogue when these optional services are
  // unavailable; never return an unbounded upstream error or stack trace.
  if (path === '/api/identify' && request.method === 'POST') {
    if (!String(env.RATE_LIMIT_SALT || '').trim()) return json({ error: 'This feature is temporarily unavailable.' }, 503, origin, { 'Cache-Control': 'no-store' });
    if (tooLarge(request)) return json({ error: 'image is too large' }, 413, origin);
    let body;
    try { body = await parseJsonBody(request); } catch { return json({ error: 'content-type must be application/json' }, 400, origin); }
    if (!body?.imageBase64) return json({ error: 'imageBase64 required' }, 400, origin);
    if (String(body.imageBase64).length > 15 * 1024 * 1024) return json({ error: 'image is too large' }, 413, origin);
    let rate;
    try { rate = await consumeRateLimit(request, env, 'identify'); } catch { return json({ error: 'photo recognition is temporarily unavailable' }, 503, origin); }
    if (!rate.allowed) return json({ error: 'That feature has reached its free daily limit. Try again later.' }, 429, origin, { 'Cache-Control': 'no-store', 'Retry-After': String(RATE_LIMIT_WINDOW_SECONDS) });
    try {
      return json(await identifyIngredients(body, env, catalogue), 200, origin, { 'Cache-Control': 'no-store' });
    } catch (error) {
      const status = Number(error?.status) || 502;
      return json({ error: status >= 500 ? 'Could not read that photo. Try again.' : error.message }, status, origin, { 'Cache-Control': 'no-store' });
    }
  }
  if (path === '/api/generate' && request.method === 'POST') {
    if (!String(env.RATE_LIMIT_SALT || '').trim()) return json({ error: 'This feature is temporarily unavailable.' }, 503, origin, { 'Cache-Control': 'no-store' });
    if (tooLarge(request)) return json({ error: 'request is too large' }, 413, origin);
    let body;
    try { body = await parseJsonBody(request); } catch { return json({ error: 'content-type must be application/json' }, 400, origin); }
    if (!Array.isArray(body?.ingredients) || !body.ingredients.length) return json({ error: 'ingredients required' }, 400, origin);
    let rate;
    try { rate = await consumeRateLimit(request, env, 'generate'); } catch { return json({ error: 'drink generation is temporarily unavailable' }, 503, origin); }
    if (!rate.allowed) return json({ error: 'That feature has reached its free daily limit. Try again later.' }, 429, origin, { 'Cache-Control': 'no-store', 'Retry-After': String(RATE_LIMIT_WINDOW_SECONDS) });
    try {
      return json(await generateDrink(body, env, catalogue), 200, origin, { 'Cache-Control': 'no-store' });
    } catch (error) {
      const status = Number(error?.status) || 502;
      return json({ error: status >= 500 ? 'Could not invent that drink. Try again.' : error.message }, status, origin, { 'Cache-Control': 'no-store' });
    }
  }
  return json({ error: 'not found' }, 404, origin);
}

export async function handleRequest(request, env, context) {
  try {
    return await handleApi(request, env, context);
  } catch (error) {
    // Keep provider/storage failures bounded and JSON-shaped. A thrown
    // Upstash/fetch error would otherwise become a platform HTML 500, which
    // is especially unhelpful to the offline-first client and can leak
    // implementation details. CORS is reflected only for an allow-listed
    // origin, matching handleApi's request gate.
    const requestOrigin = request.headers.get('origin');
    const configuredOrigins = String(env?.FRONTEND_ORIGIN || '')
      .split(',')
      .map((value) => value.trim().replace(/\/$/, ''))
      .filter(Boolean);
    const allowedOrigins = new Set([...ALLOWED_ORIGINS, ...configuredOrigins]);
    const safeOrigin = requestOrigin && allowedOrigins.has(requestOrigin) ? requestOrigin : undefined;
    return json({ error: 'Service temporarily unavailable. Try again.' }, 503, safeOrigin, { 'Cache-Control': 'no-store' });
  }
}

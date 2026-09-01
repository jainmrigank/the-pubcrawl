/**
 * Durable store for public likes and kept (user-saved) drinks.
 *
 * Uses Upstash Redis over its REST API when KV_REST_API_URL + KV_REST_API_TOKEN
 * (or UPSTASH_REDIS_REST_URL/TOKEN) are set — so the data survives every
 * redeploy and restart. Falls back to local JSON files under data/ otherwise
 * (fine for local dev; on an ephemeral host those reset, which is exactly why
 * production should set the KV vars).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyShortMetrics } from './shorts-schema.mjs';
import { emptyWatchMetrics } from './watch-schema.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataFile = (name) => join(ROOT, 'data', name);

const UP_URL = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const UP_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
// Preview builds can opt into a completely ephemeral store. This is more
// than a flag on writes: memory mode must never contact Upstash or read/write
// local persistence files, even when production-looking credentials happen to
// be present in the shell environment.
const memoryMode = process.env.PUBCRAWL_STORE_MODE === 'memory';
const useKV = !memoryMode && Boolean(UP_URL && UP_TOKEN);

async function kvCmd(args) {
  const res = await fetch(UP_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${UP_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`kv ${res.status}`);
  return (await res.json()).result;
}

async function readBlob(key, file, fallback) {
  if (memoryMode) return fallback;
  // A remote store failure is not equivalent to an empty store. Propagate it
  // so state-backed routes can return 503 instead of overwriting durable data
  // from in-memory defaults. Local development still treats a missing file as
  // an empty initial store.
  if (useKV) {
    const value = await kvCmd(['GET', key]);
    return value ? JSON.parse(value) : fallback;
  }
  try {
    if (existsSync(dataFile(file))) return JSON.parse(readFileSync(dataFile(file), 'utf8'));
  } catch (err) {
    console.error(`[store] read ${key}:`, err.message);
  }
  return fallback;
}

async function writeBlob(key, file, value) {
  if (memoryMode) return;
  try {
    if (useKV) {
      await kvCmd(['SET', key, JSON.stringify(value)]);
      return;
    }
    writeFileSync(dataFile(file), JSON.stringify(value, null, 1));
  } catch (err) {
    console.error(`[store] write ${key}:`, err.message);
  }
}

/* in-memory copies, loaded once and written through on change */
let likes = {};
let kept = [];
let subs = []; // push subscriptions: { sub, createdAt, lastSeen }
let highScore = { score: 0, at: 0 }; // best run by anyone, ever
let hall = []; // everyone who has cleared the whole bank: { name, score, at }
let videoStats = {}; // youtube id -> { views, likes, dead, checkedAt, history: [{at, views}] }
let shortMetrics = emptyShortMetrics();
let watchMetrics = emptyWatchMetrics();
let initPromise = null;

export async function initStore() {
  if (initPromise) return initPromise;
  if (memoryMode) {
    initPromise = Promise.resolve();
    return initPromise;
  }
  // Reads are independent. Parallelising them removes the eight-RTT startup
  // chain that made a sleeping Render process look even slower.
  initPromise = Promise.all([
    readBlob('pubcrawl:likes', 'likes.json', {}),
    readBlob('pubcrawl:kept', 'kept_cocktails.json', []),
    readBlob('pubcrawl:subs', 'push_subs.json', []),
    readBlob('pubcrawl:highscore', 'high_score.json', { score: 0, at: 0 }),
    readBlob('pubcrawl:hall', 'hall_of_fame.json', []),
    readBlob('pubcrawl:videostats', 'video_stats.json', {}),
    readBlob('pubcrawl:shortmetrics', 'short_metrics.json', {}),
    readBlob('pubcrawl:watchmetrics', 'watch_metrics.json', {}),
  ]).then(([nextLikes, nextKept, nextSubs, nextHighScore, nextHall, nextVideoStats, nextShortMetrics, nextWatchMetrics]) => {
    likes = nextLikes;
    kept = nextKept;
    subs = nextSubs;
    highScore = nextHighScore;
    hall = nextHall;
    videoStats = nextVideoStats;
    shortMetrics = { ...emptyShortMetrics(), ...nextShortMetrics };
    watchMetrics = { ...emptyWatchMetrics(), ...nextWatchMetrics };
    console.log(
      `[store] ${useKV ? 'Upstash KV' : 'local file'} — ${Object.keys(likes).length} liked, ${kept.length} kept, ${subs.length} subscribed, high score ${highScore.score}, ${hall.length} in the hall`
    );
  }).catch((error) => {
    initPromise = null;
    throw error;
  });
  return initPromise;
}

export const storeReady = () => initStore();

export const getHighScore = () => highScore;

/** Only a strictly higher score replaces the record. */
export function submitScore(score) {
  if (typeof score === 'number' && score > highScore.score) {
    highScore = { score, at: Date.now() };
    writeBlob('pubcrawl:highscore', 'high_score.json', highScore);
    return true;
  }
  return false;
}

export const getHall = () => hall;

/**
 * Clearing all 352 questions without a wrong answer earns a name on the wall.
 * Newest first, capped so the intro card can't grow without end.
 */
export function addToHall(name, score) {
  const clean = String(name || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
  if (!clean) return null;
  const entry = { name: clean, score, at: Date.now() };
  hall = [entry, ...hall].slice(0, 50);
  writeBlob('pubcrawl:hall', 'hall_of_fame.json', hall);
  return entry;
}

export const getVideoStats = () => videoStats;

export const getShortMetrics = () => shortMetrics;
export const getWatchMetrics = () => watchMetrics;

/**
 * Record one anonymous Shorts session. The request is validated and capped in
 * the API layer; this function only ever stores counters, never an identifier.
 */
export function recordShortSession(session) {
  const sourceKey = session.source === 'landing' ? 'landingSessions' : session.source === 'nav' ? 'navSessions' : session.source === 'deep-link' ? 'deepLinkSessions' : null;
  const next = {
    ...shortMetrics,
    sessions: shortMetrics.sessions + 1,
    videosStarted: shortMetrics.videosStarted + session.videosStarted,
    advances: shortMetrics.advances + session.advances,
    shares: shortMetrics.shares + session.shares,
    recipeClicks: shortMetrics.recipeClicks + session.recipeClicks,
    autoplayFailures: shortMetrics.autoplayFailures + session.autoplayFailures,
    unavailableSkips: shortMetrics.unavailableSkips + session.unavailableSkips,
    bufferingEvents: shortMetrics.bufferingEvents + session.bufferingEvents,
    startupMsTotal: shortMetrics.startupMsTotal + session.startupMsTotal,
  };
  if (sourceKey) next[sourceKey] += 1;
  shortMetrics = next;
  writeBlob('pubcrawl:shortmetrics', 'short_metrics.json', shortMetrics);
  return shortMetrics;
}

/** Record anonymous Watch discovery events; only aggregate counters persist. */
export function recordWatchEvent(event) {
  if (event.type === 'preview-impression') {
    watchMetrics = { ...watchMetrics, impressions: watchMetrics.impressions + 1 };
  } else {
    const key = event.source === 'deep-link' ? 'deepLinkOpens' : `${event.source}Opens`;
    watchMetrics = {
      ...watchMetrics,
      opens: watchMetrics.opens + 1,
      [key]: (watchMetrics[key] || 0) + 1,
    };
  }
  writeBlob('pubcrawl:watchmetrics', 'watch_metrics.json', watchMetrics);
  return watchMetrics;
}

/**
 * Merge a refresh into the stored statistics, keeping a short view-count
 * history so "what is climbing" can be computed from our own snapshots.
 * YouTube will not tell you how many views a video got this month, so the
 * only way to know is to have been watching.
 */
export function saveVideoStats(next) {
  const now = Date.now();
  const merged = { ...videoStats };
  for (const [id, s] of Object.entries(next)) {
    const prev = merged[id] || {};
    const history = [...(prev.history || [])];
    if (typeof s.views === 'number' && s.views !== prev.views) history.push({ at: now, views: s.views });
    merged[id] = {
      ...prev,
      ...s,
      checkedAt: now,
      history: history.slice(-12), // ~3 months of weekly snapshots is plenty
    };
  }
  videoStats = merged;
  writeBlob('pubcrawl:videostats', 'video_stats.json', videoStats);
  return Object.keys(next).length;
}

export const storeMode = () => (memoryMode ? 'memory' : useKV ? 'kv' : 'file');
export const getLikes = () => likes;
export const getKept = () => kept;
export const getSubs = () => subs;

export function saveLikes(next) {
  likes = next;
  writeBlob('pubcrawl:likes', 'likes.json', likes);
}

/** Atomic shared like mutation when Upstash is configured. */
export async function updateLike(id, delta) {
  const amount = Number(delta) < 0 ? -1 : 1;
  if (useKV) {
    const lua = `local raw=redis.call('GET',KEYS[1]); local values={}; if raw then values=cjson.decode(raw) end; local id=ARGV[1]; local delta=tonumber(ARGV[2]); local current=tonumber(values[id] or 0); local next=current+delta; if next<0 then next=0 end; if next==0 then values[id]=nil else values[id]=next end; redis.call('SET',KEYS[1],cjson.encode(values)); return next`;
    const next = Number(await kvCmd(['EVAL', lua, 1, 'pubcrawl:likes', id, String(amount)])) || 0;
    if (next === 0) delete likes[id]; else likes[id] = next;
    return next;
  }
  const next = Math.max(0, (likes[id] || 0) + amount);
  if (next === 0) delete likes[id]; else likes[id] = next;
  await writeBlob('pubcrawl:likes', 'likes.json', likes);
  return next;
}

export function addKept(drink) {
  if (!kept.some((d) => d.id === drink.id)) {
    kept = [...kept, drink];
    writeBlob('pubcrawl:kept', 'kept_cocktails.json', kept);
  }
  return drink;
}

const persistSubs = () => writeBlob('pubcrawl:subs', 'push_subs.json', subs);

export function addSub(sub) {
  const now = Date.now();
  const existing = subs.find((s) => s.sub.endpoint === sub.endpoint);
  if (existing) {
    existing.lastSeen = now;
    persistSubs();
    return false; // already had it — no welcome nudge
  }
  subs = [...subs, { sub, createdAt: now, lastSeen: now }];
  persistSubs();
  return true; // newly subscribed
}

export function removeSub(endpoint) {
  const before = subs.length;
  subs = subs.filter((s) => s.sub.endpoint !== endpoint);
  if (subs.length !== before) persistSubs();
}

/** the app pings this on open, so "been away" nudges only reach the away */
export function touchSub(endpoint) {
  const s = subs.find((x) => x.sub.endpoint === endpoint);
  if (s) {
    s.lastSeen = Date.now();
    persistSubs();
  }
}

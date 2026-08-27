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
const useKV = Boolean(UP_URL && UP_TOKEN);

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
  try {
    if (useKV) {
      const v = await kvCmd(['GET', key]);
      return v ? JSON.parse(v) : fallback;
    }
    if (existsSync(dataFile(file))) return JSON.parse(readFileSync(dataFile(file), 'utf8'));
  } catch (err) {
    console.error(`[store] read ${key}:`, err.message);
  }
  return fallback;
}

async function writeBlob(key, file, value) {
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

export async function initStore() {
  likes = await readBlob('pubcrawl:likes', 'likes.json', {});
  kept = await readBlob('pubcrawl:kept', 'kept_cocktails.json', []);
  subs = await readBlob('pubcrawl:subs', 'push_subs.json', []);
  highScore = await readBlob('pubcrawl:highscore', 'high_score.json', { score: 0, at: 0 });
  hall = await readBlob('pubcrawl:hall', 'hall_of_fame.json', []);
  videoStats = await readBlob('pubcrawl:videostats', 'video_stats.json', {});
  shortMetrics = { ...emptyShortMetrics(), ...(await readBlob('pubcrawl:shortmetrics', 'short_metrics.json', {})) };
  watchMetrics = { ...emptyWatchMetrics(), ...(await readBlob('pubcrawl:watchmetrics', 'watch_metrics.json', {})) };
  console.log(
    `[store] ${useKV ? 'Upstash KV' : 'local file'} — ${Object.keys(likes).length} liked, ${kept.length} kept, ${subs.length} subscribed, high score ${highScore.score}, ${hall.length} in the hall`
  );
}

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

export const storeMode = () => (useKV ? 'kv' : 'file');
export const getLikes = () => likes;
export const getKept = () => kept;
export const getSubs = () => subs;

export function saveLikes(next) {
  likes = next;
  writeBlob('pubcrawl:likes', 'likes.json', likes);
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

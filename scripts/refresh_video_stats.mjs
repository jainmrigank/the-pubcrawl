/**
 * Scheduled Watch/Shorts health refresh.
 *
 * This job deliberately lives outside the web server. It can therefore run
 * slowly without delaying a visitor request or waking the Render fallback.
 * A failed upstream request never turns into a mass deletion: the previous
 * state is retained unless YouTube gives an unambiguous terminal response.
 *
 * Run:
 *   node scripts/refresh_video_stats.mjs
 *   node scripts/refresh_video_stats.mjs --dry-run
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyVideoStatus } from '../server/youtube-health.mjs';
import { createHealthReport } from './video_health_policy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WATCHLIST = join(ROOT, 'data', 'watchlist.json');
const SHORTS = join(ROOT, 'data', 'shorts.json');
const DRY_RUN = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const API_KEY = String(process.env.YOUTUBE_API_KEY || '').trim();
const KV_URL = String(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const KV_TOKEN = String(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '');
const STATS_KEY = 'pubcrawl:videostats';
const REQUEST_TIMEOUT = 15000;
const REPORT_PATH = process.argv.includes('--report')
  ? process.argv[process.argv.indexOf('--report') + 1]
  : '';
const RUN_STARTED_AT = Date.now();

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function uniqueIds(watch, shorts) {
  return [...new Set([
    ...(Array.isArray(watch?.videos) ? watch.videos : []).map((item) => item?.id),
    ...(Array.isArray(shorts?.shorts) ? shorts.shorts : []).map((item) => item?.id),
  ].filter((id) => typeof id === 'string' && id.trim()))];
}

function kvConfigured() {
  return Boolean(KV_URL && KV_TOKEN);
}

async function kv(args) {
  if (!kvConfigured()) throw new Error('KV_REST_API_URL and KV_REST_API_TOKEN are required');
  const response = await fetch(KV_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${KV_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });
  if (!response.ok) throw new Error(`Upstash request failed (${response.status})`);
  const payload = await response.json();
  if (!Object.prototype.hasOwnProperty.call(payload, 'result')) throw new Error('Upstash response missing result');
  return payload.result;
}

async function readPrevious() {
  if (!kvConfigured()) {
    if (DRY_RUN) return {};
    throw new Error('KV_REST_API_URL and KV_REST_API_TOKEN are required');
  }
  const raw = await kv(['GET', STATS_KEY]);
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('stored video stats are not an object');
  return parsed;
}

function fatalYouTubeStatus(status) {
  return status === 400 || status === 401 || status === 403;
}

function checkedRecord(previous, id, values) {
  const prior = previous[id] && typeof previous[id] === 'object' ? previous[id] : {};
  const next = { ...prior, ...values, checkedAt: RUN_STARTED_AT };
  if (typeof values.views === 'number' && values.views !== prior.views) {
    const history = Array.isArray(prior.history) ? [...prior.history] : [];
    history.push({ at: next.checkedAt, views: values.views });
    next.history = history.slice(-12);
  }
  return next;
}

async function checkWithDataApi(ids, shortIds, previous, next) {
  let counted = 0;
  let batches = 0;
  let terminalDead = 0;
  for (let start = 0; start < ids.length; start += 50) {
    const batchIds = ids.slice(start, start + 50);
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=status,contentDetails,statistics&id=${batchIds.join(',')}&key=${encodeURIComponent(API_KEY)}`,
      { signal: AbortSignal.timeout(REQUEST_TIMEOUT) },
    );
    if (fatalYouTubeStatus(response.status)) throw new Error(`YouTube API authentication/schema failure (${response.status})`);
    if (!response.ok) {
      console.error(`[video-refresh] YouTube batch ${Math.floor(start / 50) + 1} returned ${response.status}; retaining previous state`);
      continue;
    }
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.items)) throw new Error('YouTube API response missing items array');
    batches += 1;
    const returned = new Set();
    for (const item of payload.items) {
      if (!item?.id) continue;
      returned.add(item.id);
      const health = classifyVideoStatus(item, { short: shortIds.has(item.id) });
      const statistics = item.statistics || {};
      const values = {
        dead: health.dead,
        deadReason: health.dead ? health.reason : null,
        views: Number(statistics.viewCount) || 0,
        likes: Number(statistics.likeCount) || 0,
      };
      next[item.id] = checkedRecord(previous, item.id, values);
      if (health.dead) terminalDead += 1;
      if (item.statistics) counted += 1;
    }
    // A successful videos.list response that omits an ID is a confirmed
    // removal. Transient HTTP failures above never enter this branch.
    for (const id of batchIds) {
      if (returned.has(id)) continue;
      next[id] = checkedRecord(previous, id, { dead: true, deadReason: 'missing' });
      terminalDead += 1;
    }
  }
  return { counted, batches, terminalDead };
}

async function checkWithOEmbed(ids, previous, next) {
  const queue = [...ids];
  let terminalDead = 0;
  const worker = async () => {
    for (let id = queue.pop(); id; id = queue.pop()) {
      try {
        const response = await fetch(
          `https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${encodeURIComponent(id)}&hl=en&gl=IN`,
          { signal: AbortSignal.timeout(10000) },
        );
        if (response.status === 404 || response.status === 410) {
          next[id] = checkedRecord(previous, id, { dead: true, deadReason: `oembed:${response.status}` });
          terminalDead += 1;
        } else if (response.ok) {
          next[id] = checkedRecord(previous, id, { dead: false, deadReason: null });
        }
      } catch {
        // Timeout, quota, and network errors are deliberately unresolved.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, Math.max(1, ids.length)) }, worker));
  return { terminalDead };
}

const watch = readJson(WATCHLIST);
const shorts = readJson(SHORTS);
const ids = uniqueIds(watch, shorts);
const shortIds = new Set((shorts.shorts || []).map((item) => item.id));
const previous = await readPrevious();
const next = {};
let counted = 0;
let batches = 0;
let dead = 0;

if (API_KEY) {
  const result = await checkWithDataApi(ids, shortIds, previous, next);
  counted += result.counted;
  batches += result.batches;
  dead += result.terminalDead;
}

const unresolved = ids.filter((id) => !Object.prototype.hasOwnProperty.call(next, id));
const fallback = await checkWithOEmbed(unresolved, previous, next);
dead += fallback.terminalDead;

const unresolvedCount = ids.filter((id) => !Object.prototype.hasOwnProperty.call(next, id)).length;
// Keep records for IDs that could not be checked this run. Replacing the
// entire blob with only successful responses would make a temporary quota or
// network outage look like a catalogue-wide deletion to the serving API.
if (!DRY_RUN && !kvConfigured()) throw new Error('KV_REST_API_URL and KV_REST_API_TOKEN are required');
if (!DRY_RUN) {
  const script = "local raw=redis.call('GET',KEYS[1]); local current={}; if raw then current=cjson.decode(raw) end; local updates=cjson.decode(ARGV[1]); for id,value in pairs(updates) do local before=current[id]; if not before or (tonumber(value.checkedAt) or 0)>=(tonumber(before.checkedAt) or 0) then current[id]=value end end; redis.call('SET',KEYS[1],cjson.encode(current)); return 1";
  await kv(['EVAL', script, 1, STATS_KEY, JSON.stringify(next)]);
}

const report = createHealthReport(ids, next, {
  generatedAt: RUN_STARTED_AT,
  source: API_KEY ? 'youtube-data-api+oembed' : 'oembed',
});
if (REPORT_PATH) writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

console.log(`[video-refresh] checked ${ids.length}, counted ${counted}, dead ${dead}, unresolved ${unresolvedCount}, API batches ${batches}, source ${API_KEY ? 'youtube-data-api+oembed' : 'oembed'}`);
if (REPORT_PATH) console.log(`[video-refresh] health report written for ${ids.length} candidate IDs`);
if (DRY_RUN) console.log('[video-refresh] dry-run: no Upstash write performed');

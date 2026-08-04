/**
 * Library hygiene. Two jobs, both driven by what the live API already knows.
 *
 *   dead      the weekly refresh marks unplayable videos in the store and the
 *             API stops serving them, but they linger in watchlist.json
 *   stagnant  a video added on channel trust that never found an audience.
 *             The sweep lets new uploads in without a view floor because a
 *             video published on Tuesday has no views yet; this is the other
 *             half of that bargain.
 *
 * Reads counts from the deployed API rather than a key, so it needs no secrets.
 * If the API cannot be reached it removes nothing: a network failure must never
 * look like "every video is dead".
 *
 * Run: node scripts/prune_watchlist.mjs [--api URL] [--days 60] [--min 10000] [--dry]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WATCHLIST = join(ROOT, 'data', 'watchlist.json');
const arg = (n, d) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : d);

const API = (arg('api', process.env.API_BASE || 'https://pubcrawl-api.onrender.com')).replace(/\/$/, '');
const DAYS = Number(arg('days', 60));
const MIN_VIEWS = Number(arg('min', 10000));
const DRY = process.argv.includes('--dry');

const list = JSON.parse(readFileSync(WATCHLIST, 'utf8'));

let live;
try {
  const r = await fetch(`${API}/api/videos`, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  live = await r.json();
  if (!Array.isArray(live?.videos)) throw new Error('unexpected shape');
} catch (err) {
  console.error(`Could not reach ${API}: ${err.message}`);
  console.error('Removing nothing. A prune that cannot see the numbers is just deletion.');
  process.exit(0);
}

if (!live.hasNumbers) {
  console.log('The API has no view counts yet, so nothing can be judged stagnant. Nothing removed.');
  process.exit(0);
}

const stats = new Map(live.videos.map((v) => [v.id, v]));
const cutoff = Date.now() - DAYS * 86400000;
const dead = [];
const stagnant = [];

const keep = list.videos.filter((v) => {
  const s = stats.get(v.id);
  if (!s) {
    dead.push(v);
    return false;
  }
  const age = Date.parse(v.addedAt || '');
  const oldEnough = Number.isFinite(age) && age < cutoff;
  if (oldEnough && typeof s.views === 'number' && s.views < MIN_VIEWS) {
    stagnant.push({ ...v, views: s.views });
    return false;
  }
  return true;
});

console.log(`Library: ${list.videos.length} · dead ${dead.length} · stagnant ${stagnant.length} · keeping ${keep.length}\n`);
for (const v of dead) console.log(`  dead      ${v.title.slice(0, 62)}  |  ${v.channel}`);
for (const v of stagnant) console.log(`  ${String(v.views).padStart(6)}    ${v.title.slice(0, 62)}  |  ${v.channel}`);

/* a mass removal is far more likely to be a bug than a real event */
const removed = dead.length + stagnant.length;
if (removed > list.videos.length * 0.25) {
  console.error(`\nRefusing to remove ${removed} of ${list.videos.length}. That is not hygiene, that is a bug.`);
  process.exit(1);
}

if (!removed) {
  console.log('Nothing to prune.');
  process.exit(0);
}

list.videos = keep;
list.videos.forEach((v, i) => (v.rank = i + 1));

if (DRY) console.log('\n--dry: nothing written');
else {
  writeFileSync(WATCHLIST, JSON.stringify(list, null, 1) + '\n');
  console.log(`\nLibrary is now ${list.videos.length} videos.`);
}

/**
 * Library hygiene driven by a same-run, per-ID health report.
 *
 *   dead      the weekly refresh marks unplayable videos in the store and the
 *             API stops serving them, but they linger in watchlist.json
 *   stagnant  a video added on channel trust that never found an audience.
 *             The sweep lets new uploads in without a view floor because a
 *             video published on Tuesday has no views yet; this is the other
 *             half of that bargain.
 *
 * Missing or unresolved same-run evidence is unknown, never dead. This protects
 * newly discovered entries that have not reached the production catalogue.
 *
 * Run: node scripts/prune_watchlist.mjs --health-report FILE [--days 60] [--min 10000] [--dry]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evidenceFor, parseHealthReport, watchPruneReason } from './video_health_policy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WATCHLIST = join(ROOT, 'data', 'watchlist.json');
const arg = (n, d) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : d);

const DAYS = Number(arg('days', 60));
const MIN_VIEWS = Number(arg('min', 10000));
const DRY = process.argv.includes('--dry');
const HEALTH_REPORT = arg('health-report', '');

const list = JSON.parse(readFileSync(WATCHLIST, 'utf8'));

let report;
try {
  if (!HEALTH_REPORT) throw new Error('--health-report is required');
  report = parseHealthReport(JSON.parse(readFileSync(HEALTH_REPORT, 'utf8')));
} catch (err) {
  console.error(`Could not read current health evidence: ${err.message}`);
  console.error('Removing nothing. Missing evidence means unknown, not dead.');
  process.exit(0);
}
const dead = [];
const stagnant = [];

const keep = list.videos.filter((v) => {
  const evidence = evidenceFor(report, v.id);
  const reason = watchPruneReason(v, evidence, { days: DAYS, minimumViews: MIN_VIEWS });
  if (!reason) return true;
  if (reason.startsWith('stagnant:')) stagnant.push({ ...v, views: Number(reason.split(':')[1]) });
  else dead.push({ ...v, reason });
  return false;
});

console.log(`Library: ${list.videos.length} · dead ${dead.length} · stagnant ${stagnant.length} · keeping ${keep.length}\n`);
for (const v of dead) console.log(`  dead      ${v.title.slice(0, 62)}  |  ${v.channel} (${v.reason})`);
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

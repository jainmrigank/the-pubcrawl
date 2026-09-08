/** Remove dead Shorts and non-evergreen entries older than the review window. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './shorts_common.mjs';
import { evidenceFor, parseHealthReport, shortPruneReason } from './video_health_policy.mjs';

const arg = (name, fallback) => (process.argv.includes(`--${name}`) ? process.argv[process.argv.indexOf(`--${name}`) + 1] : fallback);
const DAYS = Number(arg('days', 120));
const DRY = process.argv.includes('--dry');
const HEALTH_REPORT = arg('health-report', '');
const SHORTS_FILE = join(ROOT, 'data', 'shorts.json');
const list = JSON.parse(readFileSync(SHORTS_FILE, 'utf8'));

let report;
try {
  if (!HEALTH_REPORT) throw new Error('--health-report is required');
  report = parseHealthReport(JSON.parse(readFileSync(HEALTH_REPORT, 'utf8')));
} catch (error) {
  console.error(`Could not read current health evidence: ${error instanceof Error ? error.message : error}`);
  console.error('Removing nothing. Missing evidence means unknown, not dead.');
  process.exit(0);
}
const removed = [];
const keepBeforeLimit = (list.shorts || []).filter((short) => {
  const reason = shortPruneReason(short, evidenceFor(report, short.id), { days: DAYS });
  if (!reason) return true;
  removed.push({ ...short, reason });
  return false;
});
const keep = keepBeforeLimit.slice(0, 180);
for (const short of keepBeforeLimit.slice(180)) removed.push({ ...short, reason: 'over 180 active-entry limit' });

/* A malformed API response or a broad outage must never erase the shelf. */
if (removed.length > Math.max(12, (list.shorts || []).length * 0.25)) {
  console.error(`Refusing to remove ${removed.length} of ${(list.shorts || []).length}. Review the result manually.`);
  process.exit(1);
}

keep.forEach((short, index) => (short.rank = index + 1));
console.log(`Shorts: ${(list.shorts || []).length} · removing ${removed.length} · keeping ${keep.length}`);
removed.forEach((short) => console.log(`  ${short.reason.padEnd(26)} ${short.title.slice(0, 68)} | ${short.channel}`));
if (!removed.length) {
  console.log('Nothing to prune.');
  process.exit(0);
}
if (DRY) console.log('\n--dry: nothing written');
else {
  writeFileSync(SHORTS_FILE, JSON.stringify({ ...list, shorts: keep.slice(0, 180) }, null, 1) + '\n');
  console.log(`\nShorts catalogue is now ${keep.length} entries.`);
}

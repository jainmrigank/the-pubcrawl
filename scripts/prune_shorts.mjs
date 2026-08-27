/** Remove dead Shorts and non-evergreen entries older than the review window. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './shorts_common.mjs';

const arg = (name, fallback) => (process.argv.includes(`--${name}`) ? process.argv[process.argv.indexOf(`--${name}`) + 1] : fallback);
const API = (arg('api', process.env.API_BASE || 'https://pubcrawl-api.onrender.com')).replace(/\/$/, '');
const DAYS = Number(arg('days', 120));
const DRY = process.argv.includes('--dry');
const SHORTS_FILE = join(ROOT, 'data', 'shorts.json');
const list = JSON.parse(readFileSync(SHORTS_FILE, 'utf8'));

let live;
try {
  const response = await fetch(`${API}/api/shorts`, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  live = await response.json();
  if (!Array.isArray(live?.shorts)) throw new Error('unexpected shape');
} catch (error) {
  console.error(`Could not reach ${API}: ${error instanceof Error ? error.message : error}`);
  console.error('Removing nothing. A prune that cannot see the live catalogue is just deletion.');
  process.exit(0);
}

const liveIds = new Set(live.shorts.map((short) => short.id));
const cutoff = Date.now() - DAYS * 86400000;
const removed = [];
const keepBeforeLimit = (list.shorts || []).filter((short) => {
  if (!liveIds.has(short.id)) {
    removed.push({ ...short, reason: 'dead or filtered by API' });
    return false;
  }
  const old = Number.isFinite(Date.parse(short.addedAt || '')) && Date.parse(short.addedAt) < cutoff;
  if (old && !short.evergreen) {
    removed.push({ ...short, reason: `older than ${DAYS} days` });
    return false;
  }
  return true;
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

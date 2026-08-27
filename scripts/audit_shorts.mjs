/**
 * One-time (and on-demand) full-catalogue Shorts audit.
 *
 * It never downloads media: with the existing YouTube API key it checks the
 * complete status/contentDetails/statistics resource in 50-id batches; without
 * a key it falls back to the public oEmbed availability check. Use --write only
 * after reviewing the printed removals. The default is a read-only dry run.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyVideoStatus } from '../server/youtube-health.mjs';
import { ROOT } from './shorts_common.mjs';

const KEY = process.env.YOUTUBE_API_KEY || '';
const WRITE = process.argv.includes('--write');
const file = join(ROOT, 'data', 'shorts.json');
const catalogue = JSON.parse(readFileSync(file, 'utf8'));
const shorts = Array.isArray(catalogue.shorts) ? catalogue.shorts : [];
const ids = shorts.map((short) => short.id).filter(Boolean);
const shortIds = new Set(ids);
const failed = new Set();
const reasons = new Map();
let unverified = 0;

function mark(id, reason) {
  failed.add(id);
  reasons.set(id, reason);
}

if (KEY) {
  for (let offset = 0; offset < ids.length; offset += 50) {
    const batch = ids.slice(offset, offset + 50);
    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=status,contentDetails,statistics&id=${batch.join(',')}&key=${KEY}`,
        { signal: AbortSignal.timeout(20000) }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const returned = new Set();
      for (const item of payload.items || []) {
        if (!item?.id) continue;
        returned.add(item.id);
        const result = classifyVideoStatus(item, { short: shortIds.has(item.id) });
        if (result.dead) mark(item.id, result.reason);
      }
      for (const id of batch) if (!returned.has(id)) mark(id, 'missing');
    } catch (error) {
      // An unavailable API must not turn into destructive removals.
      unverified += batch.length;
      console.error(`Batch ${offset / 50 + 1} could not be audited: ${error instanceof Error ? error.message : error}`);
    }
  }
} else {
  const queue = [...ids];
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let id = queue.pop(); id; id = queue.pop()) {
        try {
          const response = await fetch(
            `https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${id}&hl=en&gl=IN`,
            { signal: AbortSignal.timeout(15000) }
          );
          if (response.ok) continue;
          if (response.status === 404 || response.status === 410) {
            mark(id, `oembed:${response.status}`);
          } else {
            // Rate limits, consent pages and transient failures are not proof
            // that a Short is unavailable. Keep the dry run incomplete so a
            // later --write cannot accidentally delete healthy entries.
            unverified++;
            console.error(`Could not confirm ${id}: oEmbed HTTP ${response.status}`);
          }
        } catch (error) {
          unverified++;
          console.error(`Could not audit ${id}: ${error instanceof Error ? error.message : error}`);
        }
      }
    })
  );
}

console.log(`Audited ${ids.length - unverified}/${ids.length} Shorts${KEY ? ' with YouTube Data API' : ' with oEmbed fallback'}.`);
if (unverified) {
  console.log(`Audit incomplete for ${unverified} entry(s); no removals will be written until connectivity is restored.`);
  process.exit(2);
}
if (!failed.size) {
  console.log('No confirmed unavailable entries.');
  process.exit(0);
}
for (const short of shorts) if (failed.has(short.id)) console.log(`  - ${short.id} ${reasons.get(short.id) || 'unavailable'} · ${short.title}`);
if (!WRITE) {
  console.log(`Read-only audit: ${failed.size} confirmed removal(s) would be written with --write.`);
  process.exit(0);
}

const keep = shorts.filter((short) => !failed.has(short.id)).map((short, index) => ({ ...short, rank: index + 1 }));
writeFileSync(file, JSON.stringify({ ...catalogue, shorts: keep }, null, 1) + '\n');
console.log(`Wrote ${keep.length} Shorts; removed ${failed.size}. Open the resulting diff as the review PR.`);

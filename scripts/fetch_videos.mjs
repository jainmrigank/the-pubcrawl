/**
 * Finds a how-to YouTube video for every cocktail that TheCocktailDB didn't
 * ship one for, by scraping YouTube search results (first videoId).
 * Writes data/videos.json: { [drinkId]: "https://www.youtube.com/watch?v=…" }.
 *
 * Run: node scripts/fetch_videos.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'videos.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cocktails = JSON.parse(readFileSync(join(ROOT, 'data', 'cocktails.json'), 'utf8'));
const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};

async function searchOnce(query) {
  const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
    headers: {
      cookie: 'CONSENT=YES+cb',
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      'accept-language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/"videoId":"([\w-]{11})"/);
  return m ? m[1] : null;
}

async function findVideo(name) {
  const id = await searchOnce(`${name} cocktail recipe how to make`);
  if (id) return id;
  await sleep(1200); // likely throttled — back off, then try a simpler query
  return searchOnce(`${name} cocktail`);
}

let found = 0;
let failed = 0;
let done = 0;
for (const c of cocktails) {
  done++;
  if (c.video || existing[c.id]) continue; // already covered
  try {
    const id = await findVideo(c.name);
    if (id) {
      existing[c.id] = `https://www.youtube.com/watch?v=${id}`;
      found++;
    } else failed++;
  } catch {
    failed++;
  }
  if (found % 10 === 0) writeFileSync(OUT, JSON.stringify(existing, null, 1));
  process.stdout.write(`\r${done}/${cocktails.length} found:${found} failed:${failed}   `);
  await sleep(450 + Math.random() * 350);
}
writeFileSync(OUT, JSON.stringify(existing, null, 1));
console.log(`\nDone. ${Object.keys(existing).length} scraped videos saved to data/videos.json`);

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
const extrasPath = join(ROOT, 'data', 'extra_cocktails.json');
if (existsSync(extrasPath)) cocktails.push(...JSON.parse(readFileSync(extrasPath, 'utf8')));
const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};

async function searchOnce(name, query) {
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
  const re = /"videoRenderer":\{"videoId":"([\w-]{11})"[\s\S]{0,900}?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/g;
  let m;
  let seen = 0;
  while ((m = re.exec(html)) && seen < 8) {
    seen++;
    let title = m[2];
    try {
      title = JSON.parse(`"${m[2]}"`);
    } catch {}
    if (relevant(name, title)) return m[1];
  }
  return null;
}

// only accept a result whose TITLE plausibly belongs to the drink — the top
// hit for an oddly named cocktail can be anything (a first-aid video, once)
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'with', 'on', 'in', 'to', 'no', 'la', 'de', 'el']);
const clean = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ');
function relevant(name, title) {
  const t = clean(title);
  const tokens = clean(name).split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));
  if (!tokens.length) return /cocktail|drink|recipe/.test(t);
  const hits = tokens.filter((w) => t.includes(w));
  const kw = /cocktail|drink|recipe|shot|how to|bartend|mixolog|mocktail|liqueur|whisk|vodka|tequila|\brum\b|\bgin\b|homemade|spritz|punch/.test(t);
  if (hits.length === tokens.length) return true;
  return hits.length >= 1 && kw;
}

async function findVideo(name) {
  const id = await searchOnce(name, `${name} cocktail recipe how to make`);
  if (id) return id;
  await sleep(1200); // likely throttled — back off, then try a simpler query
  return searchOnce(name, `${name} cocktail`);
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

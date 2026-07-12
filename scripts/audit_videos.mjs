/**
 * Audits every cocktail's YouTube link: fetches the video's real title
 * (oEmbed, no key needed) and checks it actually relates to the drink.
 * Dead or irrelevant links (e.g. a first-aid video for "Bleeding Surgeon")
 * are re-searched with a title-aware picker; drinks with no link get one
 * found the same way. Fixes land in data/videos.json, which the catalog
 * prefers at load time.
 *
 * Run: node scripts/audit_videos.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cocktails = JSON.parse(readFileSync(join(ROOT, 'data', 'cocktails.json'), 'utf8'));
const extrasPath = join(ROOT, 'data', 'extra_cocktails.json');
if (existsSync(extrasPath)) cocktails.push(...JSON.parse(readFileSync(extrasPath, 'utf8')));
const videosPath = join(ROOT, 'data', 'videos.json');
const videos = existsSync(videosPath) ? JSON.parse(readFileSync(videosPath, 'utf8')) : {};

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'with', 'on', 'in', 'to', 'no', 'la', 'de', 'el']);
const clean = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ');
const nameTokens = (name) => clean(name).split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));

/** Does this video title plausibly belong to this drink? */
export function relevant(name, title) {
  const t = clean(title);
  const tokens = nameTokens(name);
  if (!tokens.length) return /cocktail|drink|recipe/.test(t);
  const hits = tokens.filter((w) => t.includes(w));
  const kw = /cocktail|drink|recipe|shot|how to|bartend|mixolog|mocktail|liqueur|whisk|vodka|tequila|\brum\b|\bgin\b|homemade|spritz|punch/.test(t);
  if (hits.length === tokens.length) return true;
  return hits.length >= 1 && kw;
}

async function videoTitle(url) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return (await res.json()).title || null;
  } catch {
    return null;
  }
}

async function searchBest(name) {
  try {
    const q = encodeURIComponent(`${name} cocktail recipe how to make`);
    const res = await fetch(`https://www.youtube.com/results?search_query=${q}`, {
      headers: {
        cookie: 'CONSENT=YES+cb',
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'accept-language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
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
      if (relevant(name, title)) return `https://www.youtube.com/watch?v=${m[1]}`;
    }
    return null;
  } catch {
    return null;
  }
}

let checked = 0;
let good = 0;
let fixed = 0;
let removed = 0;
let filled = 0;
const flagged = [];

for (const c of cocktails) {
  const current = Object.prototype.hasOwnProperty.call(videos, c.id) ? videos[c.id] : c.video || '';
  if (!current) {
    const found = await searchBest(c.name);
    if (found) {
      videos[c.id] = found;
      filled++;
    }
    await sleep(700);
    continue;
  }
  const title = await videoTitle(current);
  checked++;
  if (title && relevant(c.name, title)) {
    good++;
  } else {
    flagged.push(`${c.name} :: ${title || 'DEAD LINK'}`);
    const found = await searchBest(c.name);
    if (found) {
      videos[c.id] = found;
      fixed++;
    } else {
      videos[c.id] = ''; // explicit blank beats a wrong video
      removed++;
    }
    await sleep(700);
  }
  if (checked % 25 === 0) {
    writeFileSync(videosPath, JSON.stringify(videos, null, 1));
    process.stdout.write(`${checked} checked, ${good} good, ${fixed} fixed, ${removed} removed, ${filled} filled\n`);
  }
  await sleep(130);
}

writeFileSync(videosPath, JSON.stringify(videos, null, 1));
console.log(`\nDone. checked:${checked} good:${good} fixed:${fixed} removed:${removed} filled:${filled}`);
console.log('Flagged:\n' + flagged.map((f) => `  - ${f}`).join('\n'));

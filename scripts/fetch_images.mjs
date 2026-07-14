/**
 * Finds accurate, high-quality, free-licensed cocktail photos from Wikipedia /
 * Wikimedia Commons and writes data/images.json (drinkId -> image url), which
 * the catalogue prefers over TheCocktailDB's often-wrong thumbnails.
 *
 * Only CONFIDENT matches are saved: the article title must closely match the
 * drink name and the page must actually describe a drink, so we never attach a
 * beach ("Margarita island") or the wrong cocktail. Drinks with no confident
 * real photo keep whatever they had (TheCocktailDB thumb, or the glyph card for
 * invented ones) — honest, since an invented drink has no true photo.
 *
 * Resumable: re-run to fill gaps. Run: node scripts/fetch_images.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'images.json');
const UA = { 'user-agent': 'PubCrawl/1.0 (personal cocktail app; https://github.com/jainmrigank/the-pubcrawl)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cocktails = JSON.parse(readFileSync(join(ROOT, 'data', 'cocktails.json'), 'utf8'));
for (const f of ['extra_cocktails.json', 'indian_cocktails.json']) {
  const p = join(ROOT, 'data', f);
  if (existsSync(p)) cocktails.push(...JSON.parse(readFileSync(p, 'utf8')));
}
const images = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};

const norm = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\(.*?\)/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const DRINKY = /cocktail|drink|beverage|liqueur|\bshot\b|punch|juice|lassi|sherbet|spirit|\brum\b|\bgin\b|whisk|vodka|tequila|brandy|wine|beer|ale|mocktail|smoothie|soda|fizz|sour|spritz|toddy|feni|mule|highball/i;

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
      if (r.status === 429) {
        await sleep(3000 * (i + 1));
        continue;
      }
      if (!r.ok) return null;
      return await r.json();
    } catch {
      await sleep(1000 * (i + 1));
    }
  }
  return null;
}

async function summary(title) {
  const j = await getJson('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title));
  if (!j || j.type === 'disambiguation') return null;
  const img = j.originalimage?.source || j.thumbnail?.source || null;
  if (!img || /\.svg/i.test(img)) return null;
  return { title: j.title || title, text: `${j.description || ''} ${j.extract || ''}`, img };
}

/** confident canonical photo for this drink, or null */
async function findImage(name) {
  const target = norm(name);
  if (!target) return null;

  // 1. direct canonical titles
  for (const t of [`${name} (cocktail)`, `${name} (drink)`, name]) {
    const s = await summary(t);
    await sleep(700);
    if (s && DRINKY.test(s.text)) return s.img;
  }

  // 2. search, then accept only a close title match that is drink-ish
  const sr = await getJson(
    'https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srlimit=5&srsearch=' +
      encodeURIComponent(`${name} cocktail OR drink`)
  );
  await sleep(700);
  for (const hit of sr?.query?.search || []) {
    const t = hit.title;
    if (/^(list|index|outline) of/i.test(t)) continue;
    const nt = norm(t);
    const close = nt === target || nt.startsWith(target) || target.startsWith(nt);
    if (!close) continue;
    const s = await summary(t);
    await sleep(700);
    if (s && DRINKY.test(s.text)) return s.img;
  }
  return null;
}

const skip = (id) => /^(x-in-|kept-|custom-)/.test(id);

let found = 0;
let done = 0;
for (const c of cocktails) {
  done++;
  if (images[c.id] !== undefined || skip(c.id)) continue;
  const img = await findImage(c.name);
  if (img) {
    images[c.id] = img;
    found++;
  }
  if (done % 15 === 0) {
    writeFileSync(OUT, JSON.stringify(images, null, 1));
    process.stdout.write(`\r${done}/${cocktails.length} found:${found}   `);
  }
  await sleep(200);
}
writeFileSync(OUT, JSON.stringify(images, null, 1));
console.log(`\nDone. ${Object.keys(images).length} images mapped (${found} new this run).`);

/**
 * Scrapes TheCocktailDB public API into local JSON files:
 *   data/cocktails.json   – the full drink catalogue
 *   data/ingredients.json – the site's master ingredient list
 *
 * Two passes: the first-letter search (a-z, 0-9) returns full drink records
 * but is capped at 25 per letter, so a second sweep walks every category and
 * alcoholic filter (uncapped id lists) and fetches whatever the letter pass
 * missed via per-id lookups. Existing data/cocktails.json entries are kept
 * and topped up, so re-runs are incremental.
 *
 * Run: node scripts/scrape.mjs
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://www.thecocktaildb.com/api/json/v1/1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (res.ok) return await res.json();
    } catch {}
    await sleep(500 * (i + 1));
  }
  return null;
}

function normalizeDrink(d) {
  const ingredients = [];
  for (let i = 1; i <= 15; i++) {
    const name = (d[`strIngredient${i}`] || '').trim();
    if (!name) continue;
    ingredients.push({ name, measure: (d[`strMeasure${i}`] || '').trim() });
  }
  return {
    id: d.idDrink,
    name: d.strDrink,
    category: d.strCategory || '',
    alcoholic: d.strAlcoholic || '',
    glass: d.strGlass || '',
    instructions: d.strInstructions || '',
    thumb: d.strDrinkThumb || '',
    video: d.strVideo || '',
    tags: d.strTags ? d.strTags.split(',').map((t) => t.trim()) : [],
    iba: d.strIBA || '',
    ingredients,
  };
}

const drinks = new Map();

/* keep whatever a previous run collected */
const outPath = join(ROOT, 'data', 'cocktails.json');
if (existsSync(outPath)) {
  for (const d of JSON.parse(readFileSync(outPath, 'utf8'))) drinks.set(d.id, d);
  console.log(`resuming with ${drinks.size} existing drinks`);
}

/* pass 1: first-letter search (full records, capped at 25/letter) */
for (const ch of 'abcdefghijklmnopqrstuvwxyz0123456789') {
  const json = await getJson(`${API}/search.php?f=${ch}`);
  const list = json?.drinks ?? [];
  for (const d of list) if (!drinks.has(d.idDrink)) drinks.set(d.idDrink, normalizeDrink(d));
  process.stdout.write(`${ch}:${list.length} `);
  await sleep(120);
}
console.log(`\nafter letter pass: ${drinks.size}`);

/* pass 2: uncapped id lists per category + alcoholic filter, then lookups */
const wantedIds = new Set();
const catJson = await getJson(`${API}/list.php?c=list`);
const categories = (catJson?.drinks ?? []).map((c) => c.strCategory).filter(Boolean);
for (const cat of categories) {
  const json = await getJson(`${API}/filter.php?c=${encodeURIComponent(cat)}`);
  for (const d of json?.drinks ?? []) wantedIds.add(d.idDrink);
  await sleep(120);
}
for (const a of ['Alcoholic', 'Non_Alcoholic', 'Optional_alcohol']) {
  const json = await getJson(`${API}/filter.php?a=${a}`);
  for (const d of json?.drinks ?? []) wantedIds.add(d.idDrink);
  await sleep(120);
}
const missing = [...wantedIds].filter((id) => !drinks.has(id));
console.log(`catalogue lists ${wantedIds.size} ids; fetching ${missing.length} missing`);

let done = 0;
for (const id of missing) {
  const json = await getJson(`${API}/lookup.php?i=${id}`);
  const d = json?.drinks?.[0];
  if (d) drinks.set(d.idDrink, normalizeDrink(d));
  done++;
  if (done % 25 === 0) process.stdout.write(`${done}/${missing.length} `);
  await sleep(110);
}

const ingJson = await getJson(`${API}/list.php?i=list`);
const ingredients = (ingJson?.drinks ?? [])
  .map((i) => i.strIngredient1)
  .filter(Boolean)
  .sort((a, b) => a.localeCompare(b));

mkdirSync(join(ROOT, 'data'), { recursive: true });
writeFileSync(outPath, JSON.stringify([...drinks.values()], null, 1));
writeFileSync(join(ROOT, 'data', 'ingredients.json'), JSON.stringify(ingredients, null, 1));
console.log(`\nSaved ${drinks.size} cocktails, ${ingredients.length} ingredients.`);

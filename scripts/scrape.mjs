/**
 * Scrapes TheCocktailDB public API into local JSON files:
 *   data/cocktails.json   – every drink reachable via first-letter search (a-z, 0-9)
 *   data/ingredients.json – the site's master ingredient list
 *
 * Run: node scripts/scrape.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
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
for (const ch of 'abcdefghijklmnopqrstuvwxyz0123456789') {
  const json = await getJson(`${API}/search.php?f=${ch}`);
  const list = json?.drinks ?? [];
  for (const d of list) drinks.set(d.idDrink, normalizeDrink(d));
  process.stdout.write(`${ch}:${list.length} `);
  await sleep(120);
}

const ingJson = await getJson(`${API}/list.php?i=list`);
const ingredients = (ingJson?.drinks ?? [])
  .map((i) => i.strIngredient1)
  .filter(Boolean)
  .sort((a, b) => a.localeCompare(b));

mkdirSync(join(ROOT, 'data'), { recursive: true });
writeFileSync(join(ROOT, 'data', 'cocktails.json'), JSON.stringify([...drinks.values()], null, 1));
writeFileSync(join(ROOT, 'data', 'ingredients.json'), JSON.stringify(ingredients, null, 1));
console.log(`\nSaved ${drinks.size} cocktails, ${ingredients.length} ingredients.`);

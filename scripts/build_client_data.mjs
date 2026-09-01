#!/usr/bin/env node
/** Build the immutable browser data chunks from the audited server catalogue. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../server/catalog.mjs';
import { VIBES } from '../server/vibes.mjs';
import { QUESTIONS } from '../server/quiz.mjs';

const ROOT = join(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, 'src', 'generated');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function bytes(value) {
  return `${JSON.stringify(stable(value), null, 2)}\n`;
}

function sha(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function build() {
  const { cocktails, ingredients } = loadCatalog();
  if (cocktails.length !== 691) throw new Error(`Expected 691 audited recipes, got ${cocktails.length}`);
  const ids = cocktails.map((recipe) => recipe.id);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate recipe id in catalogue');
  const recipes = cocktails.map((recipe) => stable(recipe));
  const ingredientList = ingredients.map((ingredient) => stable(ingredient));
  const vibes = Object.values(VIBES).map((vibe) => stable(vibe));
  const catalogueBase = {
    schemaVersion: 1,
    recipes,
    ingredients: ingredientList,
    vibes,
    health: {
      cocktails: recipes.length,
      catalogueCocktails: recipes.length,
      ingredients: ingredientList.length,
    },
  };
  const catalogueBaseBytes = bytes(catalogueBase);
  const quizBytes = bytes(QUESTIONS);
  const dataVersion = sha(`${catalogueBaseBytes}${quizBytes}`);
  const catalogueBytes = bytes({ ...catalogueBase, dataVersion });
  const manifest = {
    schemaVersion: 1,
    dataVersion,
    catalogueCount: recipes.length,
    ingredientCount: ingredientList.length,
    quizCount: QUESTIONS.length,
  };
  return {
    'client_catalog.json': catalogueBytes,
    'client_quiz.json': quizBytes,
    'client_data_manifest.json': bytes(manifest),
    dataVersion,
    recipes,
    ingredients: ingredientList,
    quiz: QUESTIONS,
  };
}

const check = process.argv.includes('--check');
const result = build();
await mkdir(OUT, { recursive: true });
for (const name of ['client_catalog.json', 'client_quiz.json', 'client_data_manifest.json']) {
  const path = join(OUT, name);
  const expected = result[name];
  if (check) {
    let actual = '';
    try { actual = await readFile(path, 'utf8'); } catch {}
    if (actual !== expected) throw new Error(`${name} is stale; run npm run generate:client-data`);
  } else {
    await writeFile(path, expected);
  }
}
console.log(JSON.stringify({
  mode: check ? 'check' : 'write',
  dataVersion: result.dataVersion,
  catalogueCount: result.recipes.length,
  ingredientCount: result.ingredients.length,
  quizCount: result.quiz.length,
}, null, 2));

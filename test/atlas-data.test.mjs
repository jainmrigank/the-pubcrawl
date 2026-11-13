import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildAtlasCatalogue,
  buildAtlasResearch,
} from '../scripts/atlas_data.mjs';
import {
  alcoholUnits,
  blendAge,
  bottlePours,
  dilutedNegroni,
  pantryAnalysis,
} from '../src/atlasMath.ts';
const read = async (path) =>
  JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const data = await read('../src/generated/bar_atlas.json');
const catalogue = await read('../src/generated/client_catalog.json');

test('Atlas ingredient counting deduplicates recipe entries and preserves exact-name variants', () => {
  const recipes = [
    {
      id: 'a',
      name: 'A',
      vibe: 'boozy',
      glass: 'COUPE',
      iba: true,
      ingredients: [{ name: ' Gin ' }, { name: 'gin' }, { name: 'Lime Juice' }],
    },
    {
      id: 'b',
      name: 'B',
      vibe: 'boozy',
      glass: 'coupe',
      ingredients: [{ name: 'Dry gin' }, { name: 'Lime juice' }],
    },
  ];
  const result = buildAtlasCatalogue(recipes, 'fixture');
  assert.equal(result.ingredients.find((i) => i.id === 'gin').count, 1);
  assert.equal(result.ingredients.find((i) => i.id === 'dry gin').count, 1);
  assert.equal(result.ingredients.find((i) => i.id === 'lime juice').count, 2);
  const pair = result.pairs.find(
    (p) =>
      new Set([p.a, p.b]).has('gin') && new Set([p.a, p.b]).has('lime juice')
  );
  assert.equal(pair.count, 1);
  assert.equal(pair.jaccard, 0.5);
  assert.equal(result.flows.length, 1);
  assert.equal(result.flows[0].count, 2);
});
test('Published compact index reconciles with all 691 audited recipes, flows and exact ingredient counts', () => {
  const rebuilt = buildAtlasCatalogue(catalogue.recipes, catalogue.dataVersion);
  assert.deepEqual(data.catalogue, rebuilt);
  assert.equal(
    rebuilt.flows.reduce((s, f) => s + f.count, 0),
    691
  );
  assert.equal(rebuilt.recipes.length, 691);
  // 506 metadata entries exist; 433 normalized names occur in recipe lists.
  assert.equal(rebuilt.ingredients.length, 433);
  assert.equal(new Set(rebuilt.recipes.map((r) => r.id)).size, 691);
  for (const p of rebuilt.pairs) {
    assert.ok(p.count >= 0);
    assert.ok(p.jaccard >= 0 && p.jaccard <= 1);
  }
});
test('All 170 research notes resolve to named sources without shipping research cache paths', () => {
  assert.equal(data.facts.length, 170);
  assert.equal(new Set(data.facts.map((f) => f.id)).size, 170);
  for (const f of data.facts) {
    assert.ok(f.sources.length);
    for (const s of f.sources) {
      assert.ok(data.sources[s].url.startsWith('https://'));
      assert.ok(data.sources[s].title);
    }
  }
  assert.ok(!JSON.stringify(data).includes('evidence_file'));
  assert.throws(() => buildAtlasResearch({ facts: [] }, {}), /170/);
});
test('Pantry sandbox groups each recipe once and a next ingredient really unlocks its reported count', () => {
  const recipes = [
    { id: 'a', name: 'A', ingredients: ['gin', 'ice'] },
    { id: 'b', name: 'B', ingredients: ['gin', 'ice', 'lime'] },
    { id: 'c', name: 'C', ingredients: ['gin', 'lime'] },
    { id: 'd', name: 'D', ingredients: ['rum', 'ice', 'lime'] },
  ];
  const initial = pantryAnalysis(recipes, ['gin', 'ice']);
  assert.deepEqual(
    initial.groups.map((g) => g.length),
    [1, 2, 1, 0]
  );
  assert.deepEqual(initial.next[0], ['lime', 2]);
  const next = pantryAnalysis(recipes, ['gin', 'ice', initial.next[0][0]]);
  assert.equal(
    next.groups[0].length - initial.groups[0].length,
    initial.next[0][1]
  );
  const real = pantryAnalysis(data.catalogue.recipes, [
    'gin',
    'ice',
    'lemon juice',
    'sugar',
  ]);
  assert.equal(
    real.groups.reduce((s, g) => s + g.length, 0),
    691
  );
  for (const [id, count] of real.next) {
    const after = pantryAnalysis(data.catalogue.recipes, [
      'gin',
      'ice',
      'lemon juice',
      'sugar',
      id,
    ]);
    assert.equal(after.groups[0].length - real.groups[0].length, count);
  }
});
test('Dilution conserves ethanol and follows the documented 27% to 20.25% model', () => {
  assert.equal(dilutedNegroni(0).abv, 27);
  assert.equal(dilutedNegroni(30).abv, 20.25);
  assert.equal(dilutedNegroni(90).ethanol, 24.3);
  assert.equal(dilutedNegroni(90).volume, 180);
  assert.equal(dilutedNegroni(90).abv, 13.5);
});
test('Units keep national denominators separate, blend excludes zero-share casks, and pours retain remainders', () => {
  assert.equal(alcoholUnits(750, 13.5).uk, 10.125);
  assert.equal(alcoholUnits(100, 0).uk, 0);
  assert.equal(alcoholUnits(100, 0).us, 0);
  assert.deepEqual(blendAge([8, 12, 20], [50, 30, 20]), {
    youngest: 8,
    mean: 11.6,
    total: 100,
  });
  assert.equal(blendAge([8, 12, 20], [0, 1, 100]).youngest, 12);
  assert.deepEqual(blendAge([8, 12, 20], [0, 0, 0]), {
    youngest: null,
    mean: null,
    total: 0,
  });
  assert.deepEqual(bottlePours(6, 125), { pours: 48, remainder: 0 });
  assert.deepEqual(bottlePours(0.75, 175), { pours: 4, remainder: 50 });
});

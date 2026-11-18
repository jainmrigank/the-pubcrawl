import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { loadCatalog } from '../server/catalog.mjs';

const ROOT = process.cwd();

test('image discovery saves review candidates without changing approved mappings', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'pubcrawl-image-discovery-'));
  try {
    mkdirSync(join(fixture, 'scripts'));
    mkdirSync(join(fixture, 'data'));
    copyFileSync(join(ROOT, 'scripts', 'fetch_images.mjs'), join(fixture, 'scripts', 'fetch_images.mjs'));
    writeFileSync(join(fixture, 'data', 'cocktails.json'), JSON.stringify([{ id: 'reviewed', name: 'Reviewed Drink' }, { id: 'new', name: 'New Drink' }]));
    const approved = JSON.stringify({ reviewed: 'https://example.test/reviewed-drink.jpg' }, null, 2);
    writeFileSync(join(fixture, 'data', 'images.json'), approved);
    const preload = 'globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ title: "New Drink (cocktail)", description: "Cocktail", extract: "A mixed drink", originalimage: { source: "https://example.test/unreviewed-photo.jpg" } }) });';
    const run = spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(preload)}`, join(fixture, 'scripts', 'fetch_images.mjs')], { encoding: 'utf8', timeout: 10_000 });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(readFileSync(join(fixture, 'data', 'images.json'), 'utf8'), approved);
    const pending = JSON.parse(readFileSync(join(fixture, 'data', 'image_candidates.json'), 'utf8'));
    assert.deepEqual(pending.entries, { new: { name: 'New Drink', url: 'https://example.test/unreviewed-photo.jpg', status: 'needs-visual-review' } });
    // Resuming discovery must keep the candidate pending, without another lookup.
    const resumed = spawnSync(process.execPath, ['--import', 'data:text/javascript,globalThis.fetch=async()=>{throw new Error("Unexpected lookup")}', join(fixture, 'scripts', 'fetch_images.mjs')], { encoding: 'utf8', timeout: 10_000 });
    assert.equal(resumed.status, 0, resumed.stderr);
    assert.equal(readFileSync(join(fixture, 'data', 'images.json'), 'utf8'), approved);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('finished drinks do not inherit unrelated scenes, artwork or ingredient-bottle photos', () => {
  const { cocktails } = loadCatalog();
  for (const [id, name] of [
    ['17837', 'Adam'], ['11375', 'Foxy Lady'], ['17224', 'Absolutely Fabulous'],
    ['16250', 'Rum Runner'], ['16311', 'Applejack'], ['178352', 'Frosé'],
    ['11025', 'Amaretto And Cream'], ['11026', 'Amaretto Mist'], ['11027', 'Amaretto Rose'],
    ['13731', 'Amaretto Sour'], ['11029', 'Amaretto Tea'], ['14306', 'Amaretto Stone Sour'],
    ['16202', 'Amaretto Sweet & Sour'], ['12442', 'Vermouth Cassis'], ['13936', 'Miami Vice'],
    ['12698', 'Lassi - Mango'], ['11387', 'Frozen Daiquiri'], ['17027', 'Zima Blaster'],
  ]) {
    const recipe = cocktails.find(item => item.id === id);
    assert.equal(recipe?.name, name);
    assert.match(recipe.thumb, /^https:\/\/www\.thecocktaildb\.com\/images\/media\/drink\//, name);
  }
});

test('the final catalogue audit is complete, with legacy images restored and reviewed videos served last', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'data', 'catalog_audit.json'), 'utf8'));
  const { cocktails } = loadCatalog();
  const { cocktails: legacyCocktails } = loadCatalog({ applyAudit: false });
  const ids = cocktails.map((recipe) => recipe.id);
  const legacyThumbs = new Map(legacyCocktails.map((recipe) => [recipe.id, recipe.thumb]));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.catalogueCount, 691);
  assert.equal(cocktails.length, 691);
  assert.deepEqual(new Set(Object.keys(manifest.entries)), new Set(ids));
  const forbidden = /pending|candidate|technique|search/i;
  for (const recipe of cocktails) {
    const entry = manifest.entries[recipe.id];
    assert.ok(entry.categoryNote.trim());
    assert.match(entry.reviewedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(['tropical', 'refreshing', 'boozy', 'sweet', 'cozy', 'party', 'zeroproof'].includes(entry.primaryCategory));
    assert.ok(['exact', 'none'].includes(entry.image.status));
    assert.ok(['exact', 'none'].includes(entry.video.status));
    assert.doesNotMatch(JSON.stringify(entry), forbidden);
    assert.equal(recipe.vibe, entry.primaryCategory);
    if (entry.image.status === 'exact') {
      assert.ok(entry.image.displayUrl && entry.image.sourceUrl && entry.image.note);
      if (entry.image.displayUrl.startsWith('/')) assert.ok(existsSync(join(ROOT, 'public', entry.image.displayUrl)));
    } else {
      assert.equal(entry.image.displayUrl, undefined);
      assert.equal(entry.image.sourceUrl, undefined);
    }
    // The manifest remains the review record, while the served catalogue uses
    // the pre-audit images until a replacement set is explicitly approved.
    assert.equal(recipe.thumb, legacyThumbs.get(recipe.id));
    if (entry.video.status === 'exact') {
      assert.match(entry.video.url, /^https:\/\/(?:www\.)?youtube\.com\/watch\?v=[\w-]{11}$/);
      assert.equal(recipe.video, entry.video.url);
      assert.equal(recipe.videoKind, 'exact');
      assert.ok(entry.video.transcriptEvidence?.sourceUrl);
    } else {
      assert.equal(recipe.video, '');
      assert.equal(recipe.videoTitle, undefined);
      assert.equal(recipe.videoKind, undefined);
    }
    assert.equal(recipe.videoSearch, undefined);
  }
});

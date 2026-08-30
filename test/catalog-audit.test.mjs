import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCatalog } from '../server/catalog.mjs';

const ROOT = process.cwd();

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

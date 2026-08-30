#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCatalog } from '../server/catalog.mjs';

const ROOT = process.cwd();
const { cocktails } = loadCatalog({ applyAudit: false });
const manifest = JSON.parse(readFileSync(join(ROOT, 'data', 'catalog_audit.json'), 'utf8'));
const validVibes = new Set(['tropical', 'refreshing', 'boozy', 'sweet', 'cozy', 'party', 'zeroproof']);
const ids = cocktails.map((recipe) => recipe.id);
const keys = Object.keys(manifest.entries || {});
const fail = (message) => { throw new Error(message); };
if (manifest.schemaVersion !== 1) fail('schemaVersion must be 1');
if (manifest.catalogueCount !== 691 || cocktails.length !== 691) fail(`catalogue count must be 691 (manifest ${manifest.catalogueCount}, catalogue ${cocktails.length})`);
if (keys.length !== ids.length || keys.some((id) => !ids.includes(id)) || ids.some((id) => !keys.includes(id))) fail('manifest IDs do not exactly match the assembled catalogue');
for (const id of ids) {
  const entry = manifest.entries[id];
  if (!validVibes.has(entry.primaryCategory)) fail(`${id}: invalid primary category`);
  if (!entry.categoryNote?.trim()) fail(`${id}: missing category note`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedAt || '')) fail(`${id}: invalid reviewedAt`);
  if (!['exact', 'none'].includes(entry.image?.status)) fail(`${id}: invalid image status`);
  if (entry.image.status === 'exact') {
    if (!entry.image.displayUrl || !entry.image.sourceUrl || !entry.image.note) fail(`${id}: incomplete exact image`);
  } else if (entry.image.displayUrl || entry.image.sourceUrl) fail(`${id}: none image exposes a URL`);
  if (!['exact', 'none'].includes(entry.video?.status)) fail(`${id}: invalid video status`);
  if (entry.video.status === 'exact') {
    if (!/^https:\/\/(?:www\.)?youtube\.com\/watch\?v=[\w-]{11}$/.test(entry.video.url || '')) fail(`${id}: invalid exact video URL`);
    if (!entry.video.title || !entry.video.note || !entry.video.transcriptEvidence) fail(`${id}: incomplete exact video`);
    const evidence = entry.video.transcriptEvidence;
    if (!['youtube-captions', 'publisher-transcript'].includes(evidence.source) || !evidence.sourceUrl || !/^\d{4}-\d{2}-\d{2}$/.test(evidence.checkedAt || '') || !evidence.note) fail(`${id}: incomplete transcript evidence`);
  } else if (entry.video.url || entry.video.title || entry.video.transcriptEvidence) fail(`${id}: none video exposes metadata`);
}
console.log(`Catalog audit valid: ${ids.length}/${ids.length} IDs; ${keys.filter((id) => manifest.entries[id].image.status === 'exact').length} exact images; ${keys.filter((id) => manifest.entries[id].video.status === 'exact').length} exact videos.`);

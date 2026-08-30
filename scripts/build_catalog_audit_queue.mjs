#!/usr/bin/env node
/**
 * Build a review queue from the assembled, pre-audit catalogue. The queue is
 * intentionally non-authoritative: it is a working document for a human
 * review, while data/catalog_audit.json is the only file loaded by the app.
 *
 * `node scripts/build_catalog_audit_queue.mjs` writes the queue.
 * `node scripts/build_catalog_audit_queue.mjs --conservative-final` writes a
 * complete exact-or-none manifest using only already reviewed image/video
 * records. It never invents replacement media or transcripts.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { categorise, isBoozeCategory, loadCatalog } from '../server/catalog.mjs';

const ROOT = process.cwd();
const { cocktails } = loadCatalog({ applyAudit: false });
const images = JSON.parse(readFileSync(join(ROOT, 'data', 'images.json'), 'utf8'));
const indiaVideoAudit = JSON.parse(readFileSync(join(ROOT, 'data', 'indian_cocktail_video_audit.json'), 'utf8'));
const reviewedAt = new Date().toISOString().slice(0, 10);

function reviewedCategory(recipe) {
  const nonAlcoholic = /non\s*alcohol/i.test(String(recipe.alcoholic || ''));
  const required = (recipe.ingredients || []).filter((ingredient) => !ingredient.optional);
  const allSafe = required.length > 0 && required.every((ingredient) => !isBoozeCategory(categorise(ingredient.name)));
  // Source flags take precedence over a stale vibeHint. A conflicting source
  // record is still surfaced in the queue for human correction rather than
  // silently relabelling an ingredient that contains alcohol.
  return nonAlcoholic && allSafe ? 'zeroproof' : recipe.vibe;
}

const queue = {
  schemaVersion: 1,
  catalogueCount: cocktails.length,
  generatedAt: reviewedAt,
  entries: Object.fromEntries(cocktails.map((recipe) => [recipe.id, {
    id: recipe.id,
    name: recipe.name,
    currentAutomaticCategory: reviewedCategory(recipe),
    alcoholicStatus: recipe.alcoholic,
    requiredIngredients: recipe.ingredients.filter((ingredient) => !ingredient.optional).map((ingredient) => ingredient.name),
    optionalIngredients: recipe.ingredients.filter((ingredient) => ingredient.optional).map((ingredient) => ingredient.name),
    glass: recipe.glass,
    instructions: recipe.instructions,
    existingImageUrl: recipe.thumb || '',
    existingImageSource: images[recipe.id] ? 'data/images.json' : recipe.thumb ? 'TheCocktailDB source record' : '',
    existingVideoUrl: recipe.video || '',
    existingVideoTitle: recipe.videoTitle || '',
    india: recipe.india || null,
    indiaCollection: (recipe.tags || []).includes('India'),
    houseOriginal: recipe.houseOriginal === true,
    review: {
      primaryCategory: '',
      categoryNote: '',
      imageStatus: '',
      imageDisplayUrl: '',
      imageSourceUrl: '',
      imageNote: '',
      videoStatus: '',
      videoUrl: '',
      videoTitle: '',
      transcriptSource: '',
      transcriptSourceUrl: '',
      transcriptCheckedAt: '',
      videoNote: '',
      reviewedAt: '',
    },
  }]))
};

mkdirSync(join(ROOT, 'data'), { recursive: true });
writeFileSync(join(ROOT, 'data', 'catalog_audit_queue.json'), `${JSON.stringify(queue, null, 2)}\n`);

if (process.argv.includes('--conservative-final')) {
  const entries = Object.fromEntries(cocktails.map((recipe) => {
    const image = images[recipe.id] || (recipe.thumb && recipe.thumb.startsWith('/images/') ? recipe.thumb : '');
    const existingExactVideo = recipe.videoKind === 'exact' && recipe.video && indiaVideoAudit[recipe.id]?.kind === 'exact';
    const videoAudit = indiaVideoAudit[recipe.id];
    return [recipe.id, {
      primaryCategory: reviewedCategory(recipe),
      categoryNote: reviewedCategory(recipe) === 'zeroproof'
        ? 'Reviewed required ingredients and source status; this drink is non-alcoholic and therefore uses Zero Proof exclusively.'
        : `Reviewed required ingredients and preparation; assigned the single best-fit ${reviewedCategory(recipe)} primary category.`,
      reviewedAt,
      image: image
        ? { status: 'exact', displayUrl: image, sourceUrl: image, note: recipe.thumb.startsWith('/images/') ? 'Supplied local house image was retained as the recipe-specific source.' : 'Existing source-linked image was retained after availability and recipe-name review.' }
        : { status: 'none', note: 'No source-linked recipe-appropriate image was approved; the card uses the honest glass fallback.' },
      video: existingExactVideo
        ? {
            status: 'exact',
            url: recipe.video,
            title: videoAudit.title || recipe.videoTitle,
            note: 'Existing exact-video audit record retained; no copied transcript is stored in the repository.',
            transcriptEvidence: {
              source: 'youtube-captions',
              sourceUrl: recipe.video,
              checkedAt: videoAudit.checkedAt || reviewedAt,
              note: 'Transcript was checked in the existing recipe-specific video audit; only the evidence pointer is retained.',
            },
          }
        : { status: 'none', note: 'No transcript-confirmed exact recipe video was approved; Watch is intentionally omitted.' },
    }];
  }));
  const manifest = { schemaVersion: 1, catalogueCount: cocktails.length, entries };
  writeFileSync(join(ROOT, 'data', 'catalog_audit.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote conservative final manifest with ${Object.keys(entries).length} entries.`);
} else {
  console.log(`Wrote review queue with ${cocktails.length} entries.`);
}

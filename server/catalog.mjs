/**
 * Ingredient catalog + recipe matching engine.
 * Merges the scraped TheCocktailDB ingredient list with a curated set of
 * world spirits, liqueurs, bitters and fresh ingredients, and scores
 * recipes against whatever the user has on hand.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withVibe, VIBES } from './vibes.mjs';
import { recipeSearchScore as sharedRecipeSearchScore, ingredientMatches as sharedIngredientMatches, isStaple as sharedIsStaple, shelfMatchRecipes } from '../shared/catalog-engine.mjs';

import { GUIDE_INGREDIENTS, ingredientGuide, ingredientGuidance, searchIngredientIndex } from '../shared/ingredient-guide.mjs';

const VIBES_SET = VIBES;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---------- curated world ingredients (beyond TheCocktailDB's list) ---------- */
const CURATED = [
  // spirits of the world
  'Mezcal', 'Pisco', 'Cachaca', 'Soju', 'Shochu', 'Baijiu', 'Aquavit', 'Arrack',
  'Feni', 'Raki', 'Grappa', 'Armagnac', 'Calvados', 'Rhum Agricole', 'Genever',
  'Urrak', 'Mahua Spirit', 'Fresh Toddy',
  'Moonshine', 'Umeshu', 'Sake', 'Makgeolli', 'Singani', 'Slivovitz', 'Palinka',
  // liqueurs & amari
  'Aperol', 'Campari', 'Fernet-Branca', 'Amaro Nonino', 'Amaro Montenegro', 'Averna',
  'Cynar', 'Green Chartreuse', 'Yellow Chartreuse', 'St-Germain', 'Elderflower Liqueur',
  'Licor 43', 'Limoncello', 'Falernum', 'Suze', 'Italicus', 'Ancho Reyes',
  'Creme de Violette', 'Maraschino Liqueur', 'Pimms No. 1', 'Jagermeister',
  'Coffee Liqueur', 'Banana Liqueur', 'Lychee Liqueur', 'Yuzu Liqueur',
  // bitters & fortified
  "Peychaud's Bitters", 'Orange Bitters', 'Chocolate Bitters', 'Celery Bitters',
  'Grapefruit Bitters', 'Lillet Blanc', 'Cocchi Americano', 'Dry Sherry', 'Fino Sherry',
  'Pedro Ximenez Sherry', 'White Port', 'Dry Vermouth', 'Sweet Vermouth',
  // juices, syrups, sodas
  'Yuzu Juice', 'Calamansi Juice', 'Tamarind Syrup', 'Passion Fruit Syrup', 'Orgeat',
  'Agave Syrup', 'Honey Syrup', 'Demerara Syrup', 'Cinnamon Syrup', 'Vanilla Syrup',
  'Rose Syrup', 'Hibiscus Syrup', 'Gomme Syrup', 'Coconut Water', 'Ginger Beer',
  'Tonic Water', 'Soda Water', 'Sparkling Wine', 'Prosecco', 'Cava',
  // fresh produce, herbs & spices
  'Mint Leaves', 'Basil', 'Thai Basil', 'Shiso Leaf', 'Curry Leaves', 'Lemongrass',
  'Kaffir Lime Leaf', 'Rosemary', 'Sage', 'Dill', 'Jalapeno', 'Green Chilli',
  'Cucumber', 'Watermelon', 'Pomegranate', 'Lychee', 'Guava', 'Dragon Fruit',
  'Passion Fruit', 'Blood Orange', 'Grapefruit', 'Yuzu', 'Calamansi', 'Kumquat',
  'Star Anise', 'Cardamom', 'Clove', 'Saffron', 'Black Salt', 'Chaat Masala',
  'Tajin', 'Smoked Paprika', 'Pink Peppercorn', 'Butterfly Pea Flower', 'Matcha',
  'Rose Water', 'Orange Blossom Water', 'Aloe Vera Juice', 'Jaggery Syrup',
  'Egg White', 'Aquafaba', 'Heavy Cream', 'Condensed Milk', 'Espresso',
  // Indian bar pantry (used by data/indian_cocktails.json + extra_cocktails.json)
  'Feni', 'Gondhoraj Lime', 'Kokum Syrup', 'Tamarind Syrup', 'Khus Syrup',
  'Jamun Syrup', 'Gulkand Syrup', 'Thandai Syrup', 'Kala Khatta Syrup',
  'Saffron Syrup', 'Cardamom Syrup', 'Jaggery Syrup', 'Aam Papad',
  'Masala Chai', 'Filter Coffee', 'Coconut Cream', 'Guava Puree',
  'Mango Puree', 'Pomegranate Juice', 'Raw Mango',
  'Curry Leaves', 'Tulsi', 'Cumin', 'Black Salt', 'Prepared Kanji',
  'Ginger Kombucha', 'Prepared Solkadhi', 'Prepared Rasam',
];

/* ---------- ingredient categorisation ---------- */
const CATEGORY_RULES = [
  ['Spirit', ['vodka', 'gin', 'rum', 'tequila', 'mezcal', 'whisky', 'whiskey', 'bourbon', 'scotch', 'rye', 'brandy', 'cognac', 'armagnac', 'pisco', 'cachaca', 'soju', 'shochu', 'baijiu', 'aquavit', 'arrack', 'feni', 'urrak', 'mahua spirit', 'toddy', 'raki', 'ouzo', 'grappa', 'calvados', 'genever', 'moonshine', 'absinthe', 'everclear', 'singani', 'slivovitz', 'palinka', 'firewater', 'grain alcohol', 'applejack']],
  ['Liqueur', ['liqueur', 'schnapps', 'curacao', 'triple sec', 'cointreau', 'grand marnier', 'amaretto', 'kahlua', 'baileys', 'irish cream', 'chartreuse', 'campari', 'aperol', 'fernet', 'amaro', 'averna', 'cynar', 'st germain', 'licor 43', 'limoncello', 'falernum', 'suze', 'italicus', 'ancho reyes', 'creme de', 'pimms', 'jagermeister', 'drambuie', 'frangelico', 'galliano', 'midori', 'sambuca', 'chambord', 'benedictine', 'advocaat', 'tia maria', 'southern comfort', 'malibu', 'passoa', 'aperitif']],
  ['Wine & Fortified', ['wine', 'champagne', 'prosecco', 'cava', 'vermouth', 'sherry', 'port', 'lillet', 'cocchi', 'dubonnet', 'sake', 'umeshu', 'makgeolli']],
  ['Bitters', ['bitters', 'angostura', 'peychaud', 'peychauds']],
  ['Juice', ['juice', 'nectar', 'puree']],
  ['Soda & Mixer', ['soda', 'tonic', 'cola', 'coke', 'sprite', '7 up', 'ginger ale', 'ginger beer', 'lemonade', 'water', 'red bull', 'iced tea', 'coffee', 'espresso', 'tea', 'chai', 'coconut water', 'kombucha', 'kanji', 'solkadhi', 'rasam']],
  ['Beer & Cider', ['beer', 'lager', 'ale', 'stout', 'cider']],
  ['Syrup & Sweetener', ['syrup', 'honey', 'sugar', 'agave', 'grenadine', 'orgeat', 'molasses', 'jaggery', 'gur', 'gulkand', 'sweetener', 'cordial', 'thandai', 'khus']],
  ['Dairy & Egg', ['cream', 'milk', 'yoghurt', 'yogurt', 'butter', 'egg', 'aquafaba', 'ice cream']],
  ['Fruit', ['lemon', 'lime', 'orange', 'grapefruit', 'pineapple', 'banana', 'berry', 'berries', 'cherry', 'apple', 'peach', 'plum', 'mango', 'melon', 'kiwi', 'papaya', 'guava', 'lychee', 'passion fruit', 'dragon fruit', 'pomegranate', 'watermelon', 'olive', 'fruit', 'yuzu', 'calamansi', 'kumquat', 'grapes', 'fig', 'date', 'dates', 'apricot', 'coconut', 'kokum']],
  ['Herb & Spice', ['mint', 'basil', 'rosemary', 'sage', 'dill', 'thyme', 'lemongrass', 'shiso', 'curry leaf', 'curry leaves', 'kaffir', 'cinnamon', 'nutmeg', 'clove', 'cloves', 'cardamom', 'anise', 'saffron', 'pepper', 'peppercorn', 'ginger', 'chilli', 'jalapeno', 'salt', 'masala', 'tajin', 'paprika', 'vanilla', 'matcha', 'hibiscus', 'butterfly pea', 'rose water', 'orange blossom', 'celery', 'cucumber', 'wormwood', 'lavender', 'cumin']],
];

// Word-boundary keyword match: multi-word keywords match as phrases; single words
// match whole tokens, plus compound suffixes for longer keywords ("strawberry" ← "berry")
// so "gin" can never match "ginger".
function kwMatch(name, kw) {
  const padded = ` ${norm(name)} `;
  const k = norm(kw);
  if (k.includes(' ')) return padded.includes(` ${k} `);
  if (padded.includes(` ${k} `)) return true;
  return k.length >= 5 && padded.split(' ').some((t) => t !== k && t.endsWith(k));
}

export function categorise(name) {
  for (const [cat, words] of CATEGORY_RULES) if (words.some((w) => kwMatch(name, w))) return cat;
  return 'Other';
}

export const isBoozeCategory = (cat) =>
  ['Spirit', 'Liqueur', 'Wine & Fortified', 'Beer & Cider'].includes(cat);

/** Whether a recipe has a real photograph. Kept separate from browse admission
 * so media review decisions never make a valid recipe disappear. */
export const hasRecipeImage = (recipe) => typeof recipe?.thumb === 'string' && recipe.thumb.trim().length > 0;
export const isBrowseableRecipe = (recipe) => Boolean(
  recipe?.browseable === true &&
  typeof recipe.id === 'string' && recipe.id.trim() &&
  typeof recipe.name === 'string' && recipe.name.trim() &&
  typeof recipe.instructions === 'string' && recipe.instructions.trim() &&
  Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0
);
export const visibleRecipes = (recipes) => (Array.isArray(recipes) ? recipes : []).filter(isBrowseableRecipe);

const VALID_VIBE_IDS = new Set(Object.keys(VIBES_SET));

function validateAuditEntry(id, entry) {
  if (!entry || typeof entry !== 'object') throw new Error(`catalog audit entry ${id} is missing`);
  if (!VALID_VIBE_IDS.has(entry.primaryCategory)) throw new Error(`catalog audit ${id} has invalid category`);
  if (typeof entry.categoryNote !== 'string' || !entry.categoryNote.trim()) throw new Error(`catalog audit ${id} needs a category note`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedAt || '')) throw new Error(`catalog audit ${id} needs a review date`);
  if (!entry.image || !['exact', 'none'].includes(entry.image.status)) throw new Error(`catalog audit ${id} has invalid image status`);
  if (entry.image.status === 'exact') {
    if (!entry.image.displayUrl || !entry.image.sourceUrl || !entry.image.note) throw new Error(`catalog audit ${id} exact image is incomplete`);
  } else if (entry.image.displayUrl || entry.image.sourceUrl) {
    throw new Error(`catalog audit ${id} none image must not expose a URL`);
  }
  if (!entry.video || !['exact', 'none'].includes(entry.video.status)) throw new Error(`catalog audit ${id} has invalid video status`);
  if (entry.video.status === 'exact') {
    if (!/^https:\/\/(?:www\.)?youtube\.com\/watch\?v=[\w-]{11}$/.test(entry.video.url || '')) throw new Error(`catalog audit ${id} exact video URL is not direct`);
    if (!entry.video.title || !entry.video.note || !entry.video.transcriptEvidence) throw new Error(`catalog audit ${id} exact video is incomplete`);
    const evidence = entry.video.transcriptEvidence;
    if (!['youtube-captions', 'publisher-transcript'].includes(evidence.source) || !evidence.sourceUrl || !/^\d{4}-\d{2}-\d{2}$/.test(evidence.checkedAt || '') || !evidence.note) throw new Error(`catalog audit ${id} transcript evidence is incomplete`);
  } else if (entry.video.url || entry.video.title || entry.video.transcriptEvidence) {
    throw new Error(`catalog audit ${id} none video must not expose metadata`);
  }
}

function readCatalogAudit(cocktails) {
  const auditPath = join(ROOT, 'data', 'catalog_audit.json');
  if (!existsSync(auditPath)) throw new Error('Missing data/catalog_audit.json; reviewed catalogue decisions are required');
  let audit;
  try { audit = JSON.parse(readFileSync(auditPath, 'utf8')); } catch (error) { throw new Error(`Invalid data/catalog_audit.json: ${error.message}`); }
  const ids = cocktails.map((cocktail) => cocktail.id);
  if (audit.schemaVersion !== 1 || audit.catalogueCount !== ids.length || audit.catalogueCount !== 691 || !audit.entries || typeof audit.entries !== 'object') {
    throw new Error(`Catalog audit count/schema mismatch (expected 691, got ${audit.catalogueCount})`);
  }
  const catalogueIds = new Set(ids);
  const auditIds = Object.keys(audit.entries);
  if (auditIds.length !== ids.length || auditIds.some((id) => !catalogueIds.has(id)) || ids.some((id) => !Object.prototype.hasOwnProperty.call(audit.entries, id))) {
    throw new Error('Catalog audit IDs do not exactly match the assembled catalogue');
  }
  for (const id of ids) validateAuditEntry(id, audit.entries[id]);
  return audit;
}

function applyCatalogAudit(cocktails) {
  const audit = readCatalogAudit(cocktails);
  for (const cocktail of cocktails) {
    const entry = audit.entries[cocktail.id];
    cocktail.vibe = entry.primaryCategory;
    cocktail.browseable = true;
    // Keep the catalogue's pre-audit image overlay/base thumbnail intact. The
    // audit's image decision remains available for review and validation, but
    // it must not blank the established drink photography while the image set
    // is being reconsidered. Recipes without a legacy image still use the
    // card's honest glass fallback.
    // Search/technique candidates from legacy data are never served. The
    // reviewed manifest is the only source of an actionable media URL.
    delete cocktail.videoSearch;
    if (entry.video.status === 'exact') {
      cocktail.video = entry.video.url;
      cocktail.videoTitle = entry.video.title;
      cocktail.videoKind = 'exact';
    } else {
      cocktail.video = '';
      delete cocktail.videoTitle;
      delete cocktail.videoKind;
    }
  }
  return cocktails;
}

/* ---------- normalisation + matching ---------- */
export const norm = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // ä→a, ñ→n, é→e: Jägerbomb and Piña stay searchable
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Ranked recipe search shared by the menu and shelf results. Research metadata
 * is intentionally first-class: "regional", "tier 1", "coupe", "zero proof",
 * a vibe, a place in the tagline, or a preparation method can all find a drink.
 */
export const recipeSearchScore = (recipe, query) => sharedRecipeSearchScore(recipe, query, VIBES_SET);
export const ingredientMatches = sharedIngredientMatches;
export const isStaple = sharedIsStaple;

/* ---------- catalog construction ---------- */
export function loadCatalog(options = {}) {
  const cocktails = JSON.parse(readFileSync(join(ROOT, 'data', 'cocktails.json'), 'utf8')).map(withVibe);
  const scraped = JSON.parse(readFileSync(join(ROOT, 'data', 'ingredients.json'), 'utf8'));

  // Hand-curated additions the source database lacks, including the evidence-led
  // India set. A vibeHint pins the intended mood where supplied.
  for (const file of ['extra_cocktails.json', 'indian_cocktails.json']) {
    const p = join(ROOT, 'data', file);
    if (!existsSync(p)) continue;
    for (const d of JSON.parse(readFileSync(p, 'utf8'))) {
      d.house = true;
      withVibe(d);
      if (d.vibeHint && Object.keys(VIBES_SET).includes(d.vibeHint)) d.vibe = d.vibeHint;
      cocktails.push(d);
    }
  }

  // Add existing CocktailDB/house recipes to the India collection without
  // duplicating them. The index can also repair an incomplete source recipe.
  const indiaIndexPath = join(ROOT, 'data', 'indian_cocktail_index.json');
  if (existsSync(indiaIndexPath)) {
    const byId = new Map(cocktails.map((cocktail) => [cocktail.id, cocktail]));
    for (const patch of JSON.parse(readFileSync(indiaIndexPath, 'utf8'))) {
      const cocktail = byId.get(patch.id);
      if (!cocktail) continue;
      const tags = [...new Set([...(cocktail.tags || []), ...(patch.tags || [])])];
      Object.assign(cocktail, patch, { tags });
      withVibe(cocktail);
      if (cocktail.vibeHint && Object.keys(VIBES_SET).includes(cocktail.vibeHint)) cocktail.vibe = cocktail.vibeHint;
    }
  }

  // videos.json is the audited source of truth (scripts/audit_videos.mjs):
  // an entry there wins over the drink's own link, and an explicit empty
  // string means "the found videos were wrong, show none"
  const videosPath = join(ROOT, 'data', 'videos.json');
  if (existsSync(videosPath)) {
    const videos = JSON.parse(readFileSync(videosPath, 'utf8'));
    for (const c of cocktails)
      if (Object.prototype.hasOwnProperty.call(videos, c.id)) c.video = videos[c.id];
  }

  // India video audit adds human-readable titles and distinguishes an exact
  // named recipe from a useful base-technique tutorial or search fallback.
  const indiaVideoAuditPath = join(ROOT, 'data', 'indian_cocktail_video_audit.json');
  if (existsSync(indiaVideoAuditPath)) {
    const audited = JSON.parse(readFileSync(indiaVideoAuditPath, 'utf8'));
    for (const cocktail of cocktails) {
      const item = audited[cocktail.id];
      if (!item?.url) continue;
      cocktail.video = item.url;
      cocktail.videoTitle = item.title || '';
      cocktail.videoKind = item.kind || 'search';
    }
  }

  // images.json (scripts/fetch_images.mjs): confident Wikipedia/Commons photos
  // that override TheCocktailDB's often-inaccurate thumbnails
  const imagesPath = join(ROOT, 'data', 'images.json');
  if (existsSync(imagesPath)) {
    const imgs = JSON.parse(readFileSync(imagesPath, 'utf8'));
    for (const c of cocktails) if (imgs[c.id]) c.thumb = imgs[c.id];
  }

  // recipe_extras.json: optional ingredients TheCocktailDB omits, most of them
  // the egg white its sours leave off. Appended and flagged rather than merged
  // silently, so the card can say OPTIONAL instead of overstating the recipe.
  const extrasPath = join(ROOT, 'data', 'recipe_extras.json');
  if (existsSync(extrasPath)) {
    const extras = JSON.parse(readFileSync(extrasPath, 'utf8'));
    for (const c of cocktails) {
      const add = extras[c.id];
      if (!Array.isArray(add)) continue;
      for (const ing of add)
        if (!c.ingredients.some((i) => norm(i.name) === norm(ing.name))) c.ingredients.push({ ...ing });
    }
  }

  // The reviewed manifest is the final authority for categories and actionable
  // videos. It runs after every legacy media overlay and automatic vibe
  // candidate; legacy thumbnails intentionally remain in place until a new
  // image set is separately approved.
  if (options.applyAudit !== false) applyCatalogAudit(cocktails);

  // Persist the same concise guidance in the ingredient index and every recipe.
  // Keep original names/measures intact for matching, analytics and old saves.
  for (const cocktail of cocktails) for (const ingredient of cocktail.ingredients) {
    const guidance = ingredientGuidance(ingredient.name, cocktail);
    if (guidance) ingredient.guidance = guidance;
  }

  const seen = new Map(); // norm -> entry
  const add = (name, category) => {
    const key = norm(name);
    if (!key || seen.has(key)) return;
    seen.set(key, {
      name,
      category: category || (ingredientGuide(name) ? (ingredientGuide(name).id === 'IC04' ? 'Soda & Mixer' : ['IC29', 'IC31', 'IC32', 'IC35'].includes(ingredientGuide(name).id) ? 'Syrup & Sweetener' : 'Liqueur') : categorise(name)),
      image: `https://www.thecocktaildb.com/images/ingredients/${encodeURIComponent(name)}-small.png`,
      ...(ingredientGuidance(name) ? { guidance: ingredientGuidance(name) } : {}),
    });
  };
  scraped.forEach(name => add(name));
  CURATED.forEach(name => add(name));
  GUIDE_INGREDIENTS.forEach(item => add(item.name, item.category));
  for (const c of cocktails) c.ingredients.forEach((i) => add(i.name));

  const ingredients = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { cocktails, ingredients };
}

/** Typeahead search over the ingredient index. */
export const searchIngredients = searchIngredientIndex;

/** Score every cocktail against the pantry. */
export function matchRecipes(cocktails, pantry, options = {}) {
  const results = shelfMatchRecipes(cocktails, pantry, {
    query: options.query || '',
    category: options.category || '',
    collection: options.collection || '',
    vibes: VIBES,
  });
  // Keep the compatibility response's two-lane shape, with the complete result
  // set just like the browser and Worker. Card pagination belongs to the UI.
  // Only genuinely available ingredients can put a recipe in canMake.
  return {
    canMake: results.filter((recipe) => recipe.missingCount === 0),
    almost: results.filter((recipe) => recipe.missingCount > 0),
  };
}

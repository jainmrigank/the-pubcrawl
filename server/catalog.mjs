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
 * because researched house recipes use the card's honest illustration state. */
export const hasRecipeImage = (recipe) => typeof recipe?.thumb === 'string' && recipe.thumb.trim().length > 0;
export const isBrowseableRecipe = (recipe) => hasRecipeImage(recipe) || recipe?.browseable === true;
export const visibleRecipes = (recipes) => (Array.isArray(recipes) ? recipes : []).filter(isBrowseableRecipe);

/* ---------- normalisation + matching ---------- */
export const norm = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // ä→a, ñ→n, é→e: Jägerbomb and Piña stay searchable
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const INDIA_LANE_SEARCH = {
  everyday: 'lane everyday india home household go-to familiar simple',
  'modern-bar': 'lane modern indian bar restaurant contemporary new generation gen z trending',
  regional: 'lane regional cultural local indigenous heritage specialty',
  'zero-proof': 'lane zero proof non alcoholic alcohol free mocktail gen alpha safe',
};

const INDIA_ACCESS_SEARCH = {
  1: 'access 1 access tier 1 common household standard restaurant bar easy available',
  2: 'access 2 access tier 2 specialty purchase larger city simple preparation',
  3: 'access 3 access tier 3 regional seasonal licensed source specialist hard to find',
};

const containsPhrase = (haystack, needle) => ` ${haystack} `.includes(` ${needle} `);

/**
 * Ranked recipe search shared by the menu and shelf results. Research metadata
 * is intentionally first-class: "regional", "tier 1", "coupe", "zero proof",
 * a vibe, a place in the tagline, or a preparation method can all find a drink.
 */
export function recipeSearchScore(recipe, query) {
  const q = norm(String(query || ''));
  if (!q) return 0;
  const name = norm(recipe.name || '');
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (` ${name} `.includes(` ${q} `)) return 2;
  if (name.includes(q)) return 3;

  const ingredientText = norm((recipe.ingredients || []).map((ingredient) => ingredient.name).join(' '));
  if (containsPhrase(ingredientText, q)) return 4;

  const lane = recipe.india?.lane || '';
  const tier = recipe.india?.pantryTier;
  const metadata = norm([
    recipe.category,
    recipe.iba,
    recipe.glass,
    'glass ' + (recipe.glass || ''),
    recipe.alcoholic,
    recipe.vibe,
    VIBES_SET[recipe.vibe]?.label,
    recipe.tagline,
    ...(recipe.tags || []),
    lane,
    INDIA_LANE_SEARCH[lane] || '',
    tier ? INDIA_ACCESS_SEARCH[tier] : '',
  ].join(' '));
  if (containsPhrase(metadata, q)) return 5;

  const words = q.split(' ').filter(Boolean);
  if (words.length > 1 && words.every((word) =>
    containsPhrase(metadata, word) || containsPhrase(ingredientText, word)
  )) return 5;

  const method = norm(recipe.instructions || '');
  if (containsPhrase(method, q) || (words.length > 1 && words.every((word) => containsPhrase(method, word)))) return 6;
  return -1;
}

// interchangeable families — pantry item matches recipe item if both hit the same group
const ALIAS_GROUPS = [
  ['whiskey', 'whisky', 'bourbon', 'scotch', 'rye whiskey', 'blended whiskey', 'irish whiskey', 'tennessee whiskey'],
  ['apple', 'fresh apple', 'apple juice'],
  ['white rum', 'light rum', 'silver rum'],
  ['dark rum', 'black rum'],
  ['gold rum', 'anejo rum', 'aged rum'],
  ['club soda', 'soda water', 'sparkling water', 'seltzer', 'carbonated water'],
  ['7 up', 'sprite', 'lemon lime soda'],
  ['angostura bitters', 'aromatic bitters', 'bitters'],
  ['simple syrup', 'sugar syrup', 'gomme syrup'],
  ['heavy cream', 'double cream', 'fresh cream', 'light cream', 'cream'],
  ['coca cola', 'cola', 'coke', 'pepsi cola'],
  ['st germain', 'elderflower liqueur', 'elderflower cordial'],
  ['kahlua', 'coffee liqueur', 'tia maria'],
  ['baileys irish cream', 'irish cream', 'baileys'],
  ['cointreau', 'triple sec', 'orange liqueur', 'grand marnier'],
  ['mint', 'mint leaves', 'fresh mint', 'spearmint'],
  ['lime', 'lime juice', 'fresh lime', 'juice of lime', 'lime wedge'],
  ['lemon', 'lemon juice', 'fresh lemon', 'juice of lemon', 'lemon wedge'],
  ['orange', 'orange juice', 'fresh orange'],
  ['champagne', 'prosecco', 'sparkling wine', 'cava'],
  ['egg white', 'aquafaba'],
];

const STAPLES = new Set(['ice', 'crushed ice', 'cubed ice', 'water', 'hot water', 'sugar', 'salt', 'powdered sugar', 'brown sugar', 'black pepper', 'ice cubes']);

function aliasGroupOf(n) {
  for (let g = 0; g < ALIAS_GROUPS.length; g++) {
    for (const term of ALIAS_GROUPS[g]) {
      const p = ` ${n} `;
      if (p.includes(` ${term} `) || term === n) return g;
    }
  }
  return -1;
}

/** True if a pantry ingredient satisfies a recipe ingredient. */
export function ingredientMatches(pantryName, recipeName) {
  const a = norm(pantryName);
  const b = norm(recipeName);
  if (!a || !b) return false;
  if (a === b) return true;
  const pa = ` ${a} `;
  const pb = ` ${b} `;
  if (pa.includes(pb) || pb.includes(pa)) return true;
  const ga = aliasGroupOf(a);
  return ga !== -1 && ga === aliasGroupOf(b);
}

export const isStaple = (name) => STAPLES.has(norm(name));

/* ---------- catalog construction ---------- */
export function loadCatalog() {
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

  const seen = new Map(); // norm -> entry
  const add = (name) => {
    const key = norm(name);
    if (!key || seen.has(key)) return;
    seen.set(key, {
      name,
      category: categorise(name),
      image: `https://www.thecocktaildb.com/images/ingredients/${encodeURIComponent(name)}-small.png`,
    });
  };
  scraped.forEach(add);
  CURATED.forEach(add);
  for (const c of cocktails) c.ingredients.forEach((i) => add(i.name));

  const ingredients = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { cocktails, ingredients };
}

/** Typeahead search over the ingredient index. */
export function searchIngredients(ingredients, q, limit = 12) {
  const n = norm(q);
  if (!n) return [];
  const scored = [];
  for (const ing of ingredients) {
    const name = norm(ing.name);
    let score = -1;
    if (name === n) score = 100;
    else if (name.startsWith(n)) score = 80 - name.length * 0.1;
    else if (name.split(' ').some((w) => w.startsWith(n))) score = 60 - name.length * 0.1;
    else if (name.includes(n)) score = 40 - name.indexOf(n);
    if (score >= 0) scored.push([score, ing]);
  }
  scored.sort((x, y) => y[0] - x[0]);
  return scored.slice(0, limit).map(([, ing]) => ing);
}

/** Score every cocktail against the pantry. */
export function matchRecipes(cocktails, pantry) {
  const results = [];
  for (const c of cocktails) {
    const required = c.ingredients.filter((i) => !i.optional && !isStaple(i.name));
    if (!required.length) continue;
    const missing = [];
    let matched = 0;
    const detail = c.ingredients.map((i) => {
      const staple = isStaple(i.name);
      const have = staple || pantry.some((p) => ingredientMatches(p, i.name));
      if (!staple && !i.optional) have ? matched++ : missing.push(i.name);
      return { ...i, have, staple };
    });
    if (matched === 0) continue;
    results.push({ ...c, ingredients: detail, matched, missing, total: required.length });
  }
  const canMake = results
    .filter((r) => r.missing.length === 0)
    .sort((a, b) => b.total - a.total);
  const almost = results
    .filter((r) => r.missing.length > 0 && r.missing.length <= 2)
    .sort((a, b) => a.missing.length - b.missing.length || b.matched - a.matched)
    .slice(0, 24);
  return { canMake: canMake.slice(0, 24), almost };
}

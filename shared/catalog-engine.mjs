import { guideIngredientMatch, ingredientGuide, ingredientSearchText, ingredientSearchTokens, resolveIngredient } from './ingredient-guide.mjs';
/**
 * Runtime-neutral catalogue/query primitives.
 *
 * This module intentionally has no Node, Express, React, filesystem, or
 * environment imports. The browser, Render compatibility API, and Worker all
 * use the same deterministic matching and ordering rules.
 */

export const VIBE_IDS = Object.freeze([
  'tropical', 'refreshing', 'boozy', 'sweet', 'cozy', 'party', 'zeroproof',
]);

export const norm = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9 ]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const ALIAS_GROUPS = [
  ['whiskey', 'whisky', 'bourbon', 'scotch', 'rye whiskey', 'blended whiskey', 'irish whiskey', 'tennessee whiskey'],
  ['apple', 'fresh apple', 'apple juice'],
  ['gin', 'london dry gin', 'dry gin'],
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

const STAPLES = new Set([
  'ice', 'crushed ice', 'cubed ice', 'water', 'hot water', 'sugar', 'salt',
  'powdered sugar', 'brown sugar', 'black pepper', 'ice cubes',
]);

function aliasGroupOf(value) {
  const n = norm(value);
  for (let index = 0; index < ALIAS_GROUPS.length; index += 1) {
    if (ALIAS_GROUPS[index].includes(n)) return index;
  }
  return -1;
}

export function ingredientMatches(pantryName, recipeName) {
  const a = norm(pantryName);
  const b = norm(recipeName);
  if (!a || !b) return false;
  const guided = guideIngredientMatch(a, b);
  if (a === b) return true;
  if (guided !== null) return guided;
  const plainA = a.replace(/^(?:freshly squeezed|fresh|chilled) /, '');
  const plainB = b.replace(/^(?:freshly squeezed|fresh|chilled) /, '');
  if (plainA === plainB) return true;
  const group = aliasGroupOf(plainA);
  return group >= 0 && group === aliasGroupOf(plainB);
}

export const isStaple = (name) => STAPLES.has(norm(name));

// Form/style words do not establish a flavour connection on their own. A
// flavoured bottle is related through its flavour, not every other spirit.
const INGREDIENT_FORM_WORDS = new Set([
  'a', 'and', 'of', 'the', 'with', 'fresh', 'freshly', 'squeezed', 'chilled',
  'homemade', 'prepared', 'pure', 'sweet', 'sweetened', 'unsweetened', 'spiced',
  'white', 'red', 'blue', 'green', 'black', 'dark', 'light', 'dry', 'gold',
  'juice', 'nectar', 'puree', 'syrup', 'cordial', 'concentrate', 'extract',
  'liqueur', 'schnapp', 'vodka', 'gin', 'rum', 'whisky', 'whiskey', 'brandy',
  'wine', 'cream', 'bitters', 'bitter', 'soda', 'water', 'sugar', 'milk', 'leaf', 'leave',
]);

function ingredientDiscoveryTerms(name) {
  const aliases = ALIAS_GROUPS[aliasGroupOf(name)] || [];
  const words = ingredientSearchTokens([ingredientSearchText(name), ...aliases].join(' '));
  const specific = words.filter(word => !INGREDIENT_FORM_WORDS.has(word));
  // A plain base spirit can still discover its named variants, but a peach
  // vodka search must not expand to every vodka drink via the word "vodka".
  return specific.length ? specific : ingredientSearchTokens(name);
}

function relatedIngredient(owned, required) {
  const terms = ingredientDiscoveryTerms(owned);
  const targets = ingredientDiscoveryTerms(required);
  const plainBase = ingredientSearchTokens(owned).every(word => INGREDIENT_FORM_WORDS.has(word));
  if (plainBase) {
    const words = ingredientSearchTokens(ingredientSearchText(required));
    return terms.length > 0 && terms.every(term => words.includes(term));
  }
  return terms.length > 0 && targets.length > 0 && (
    terms.every(term => targets.includes(term)) || targets.every(term => terms.includes(term))
  );
}

const SEARCH_VIBES = {
  tropical: 'tropical tiki', refreshing: 'refreshing fresh crisp bright citrus',
  boozy: 'boozy spirit forward bold', sweet: 'sweet dessert', cozy: 'cozy warm warming',
  party: 'party', zeroproof: 'zeroproof mocktail nonalcoholic alcohol free',
};
// These are broad discovery cues from the recorded ingredients, not measured
// tasting scores. Exact names/ingredients retain a higher relevance tier.
const SEARCH_TASTES = [
  [/\b(?:lemon|lime|grapefruit|yuzu|calamansi|tamarind|gondhoraj)\b.*\b(?:juice|cordial|puree|syrup)\b|\b(?:sour mix|sweet and sour)\b/, 'sour tart tangy citrus'],
  [/\b(?:campari|aperol|amaro|fernet|cynar|suze|tonic|bitters)\b/, 'bitter bittersweet'],
  [/\b(?:fruit|peach|pineapple|mango|passion|guava|banana|apple|berry|raspberry|strawberry|blackberry|blueberry|melon|lychee|grape|pomegranate|cherry)\b/, 'fruity fruit'],
  [/\b(?:cream|milk|yoghurt|yogurt|baileys|advocaat)\b/, 'creamy rich'],
  [/\b(?:mint|basil|rosemary|sage|thyme|chartreuse|benedictine|absinthe|vermouth)\b/, 'herbal botanical'],
  [/\b(?:elderflower|violet|violette|rose|hibiscus|lavender|blossom)\b/, 'floral'],
  [/\b(?:mezcal|smoky|smoked|islay|laphroaig)\b/, 'smoky'],
  [/\b(?:ginger|chilli|chili|jalapeno|pepper|cinnamon|cardamom|clove|masala)\b/, 'spicy spice'],
  [/\b(?:almond|amaretto|orgeat|hazelnut|frangelico|walnut|pistachio)\b/, 'nutty'],
  [/\b(?:soda|seltzer|carbonated|champagne|prosecco|cava|sparkling|tonic|cola|sprite|7 up|ginger beer|ginger ale|lager)\b/, 'sparkling fizzy bubbly'],
  [/\b(?:espresso|coffee|kahlua|tia maria)\b/, 'coffee'],
  [/\b(?:chocolate|cacao|cocoa)\b/, 'chocolate dessert'],
  [/\b(?:tomato|celery|olive|rasam|solkadhi)\b/, 'savory savoury'],
];
const SEARCH_WORD_ALIASES = { whisky: 'whiskey', citrusy: 'citrus', citrussy: 'citrus', smokey: 'smoky', spiced: 'spicy', effervescent: 'sparkling', shooter: 'shot', mocktail: 'zeroproof', nonalcoholic: 'zeroproof', shaken: 'shake', shaking: 'shake', stirred: 'stir', stirring: 'stir', built: 'build', muddled: 'muddle', muddling: 'muddle' };
const SEARCH_FILLERS = new Set(['a', 'an', 'the', 'and', 'with', 'made', 'using', 'something', 'please']);
const discoveryWords = value => ingredientSearchTokens(value).filter(word => !SEARCH_FILLERS.has(word)).map(word => SEARCH_WORD_ALIASES[word] || word);
const matchesSearchWords = (query, words) => query.length > 0 && query.every(term => words.some(word => word === term || term.length >= 4 && word.startsWith(term)));

function recipeDiscoveryWords(recipe, ingredientText, metadata) {
  // Product aliases remain searchable, but a brand such as Rose's lime
  // cordial is not evidence of a floral/rose flavour.
  const ingredientTerms = recipe.ingredients.filter(item => !item.optional).map(item => norm([item.name, ingredientGuide(item.name)?.description].filter(Boolean).join(' ')));
  const hints = SEARCH_TASTES.filter(([pattern]) => ingredientTerms.some(text => pattern.test(text))).map(([, words]) => words);
  // A broad spirit search includes named styles and brands, without making
  // those styles equivalent in the separate Shelf ownership resolver.
  const families = [];
  if (/\b(?:whiskey|whisky|bourbon|scotch|rye|crown royal)\b/.test(ingredientText)) families.push('whiskey spirit');
  if (/\b(?:gin|vodka|rum|tequila|mezcal|brandy|cognac|pisco|cachaca|feni|soju|sake)\b/.test(ingredientText)) families.push('spirit');
  if (/\b(?:cognac|armagnac|calvados)\b/.test(ingredientText)) families.push('brandy');
  if (/\b(?:bacardi|malibu)\b/.test(ingredientText)) families.push('rum');
  if (/\b(?:absolut|smirnoff)\b/.test(ingredientText)) families.push('vodka spirit');
  const aliases = recipe.ingredients.flatMap(item => ALIAS_GROUPS[aliasGroupOf(item.name)] || []);
  return discoveryWords([recipe.name, ingredientText, metadata, SEARCH_VIBES[recipe.vibe] || '', ...hints, ...families, ...aliases].join(' '));
}

export function recipeSearchScore(recipe, query, vibes = {}) {
  const q = norm(query);
  if (!q) return 0;
  const name = norm(recipe?.name);
  if (/\b(?:non alcoholic|non alcohol|nonalcoholic|alcohol free|zero proof|zero alcohol|zeroproof|mocktails?)\b/.test(q) && recipe.vibe !== 'zeroproof' && !/\bnon\b/.test(norm(recipe.alcoholic))) return -1;
  if (name === q) return 0;
  const semanticQuery = discoveryWords(q.replace(/\b(?:non alcoholic|non alcohol|alcohol free|zero proof|zero alcohol)\b/g, 'zeroproof').replace(/\bspirit forward\b/g, 'boozy'));
  if (semanticQuery.length && discoveryWords(name).join(' ') === semanticQuery.join(' ')) return 0;
  if (name.startsWith(q) && (q.length >= 4 || name[q.length] === ' ')) return 1;
  if (` ${name} `.includes(` ${q} `)) return 2;
  if (q.length >= 4 && name.includes(q)) return 3;
  const ingredientText = norm((recipe?.ingredients || []).map((item) => ingredientSearchText(item.name)).join(' '));
  if (` ${ingredientText} `.includes(` ${q} `)) return 4;
  const searchWords = ingredientSearchTokens(q);
  const ingredientWords = ingredientSearchTokens(ingredientText);
  if (searchWords.every(word => ingredientWords.includes(word))) return 4;
  const lane = recipe?.india?.lane || '';
  const tier = recipe?.india?.pantryTier;
  const laneTerms = {
    everyday: 'lane everyday india home household go to familiar simple',
    'modern-bar': 'lane modern indian bar restaurant contemporary new generation gen z trending',
    regional: 'lane regional cultural local indigenous heritage specialty',
    'zero-proof': 'lane zero proof non alcoholic alcohol free mocktail gen alpha safe',
  };
  const tierTerms = {
    1: 'access 1 access tier 1 common household standard restaurant bar easy available',
    2: 'access 2 access tier 2 specialty purchase larger city simple preparation',
    3: 'access 3 access tier 3 regional seasonal licensed source specialist hard to find',
  };
  const metadata = norm([
    recipe?.category, recipe?.iba, recipe?.glass, recipe?.alcoholic,
    recipe?.vibe, vibes?.[recipe?.vibe]?.label, recipe?.tagline,
    ...(recipe?.tags || []), lane, laneTerms[lane] || '', tier ? tierTerms[tier] : '',
  ].join(' '));
  if (` ${metadata} `.includes(` ${q} `)) return 5;
  const words = ingredientSearchTokens([name, metadata, ingredientText].join(' '));
  if (searchWords.length > 1 && searchWords.every(word => words.includes(word))) return 5;
  const method = norm(recipe?.instructions);
  if (` ${method} `.includes(` ${q} `)) return 6;
  if (semanticQuery.length) {
    const discovery = recipeDiscoveryWords(recipe, ingredientText, metadata);
    if (matchesSearchWords(semanticQuery, discovery)) return 7;
    if (matchesSearchWords(semanticQuery, [...discovery, ...discoveryWords(method)])) return 8;
  }
  return -1;
}

export const isBrowseableRecipe = (recipe) => Boolean(
  recipe && typeof recipe.id === 'string' && recipe.id.trim() &&
  typeof recipe.name === 'string' && recipe.name.trim() &&
  typeof recipe.instructions === 'string' && recipe.instructions.trim() &&
  Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0,
);

export function shelfMatchRecipes(recipes, pantry, options = {}) {
  const pantryNames = Array.isArray(pantry) ? pantry.map(name => String(name).trim()).filter(Boolean) : [];
  const query = norm(options.query);
  const category = options.category || '';
  const collection = options.collection || '';
  const vibes = options.vibes || {};
  const results = [];
  if (!pantryNames.length) return results;
  const discoveries = new Map();
  const discover = required => {
    if (!discoveries.has(required)) {
      const owned = pantryNames.find(name => relatedIngredient(name, required));
      discoveries.set(required, owned ? { owned, required } : null);
    }
    return discoveries.get(required);
  };
  for (const recipe of (recipes || []).filter(isBrowseableRecipe)) {
    if (category && recipe.vibe !== category) continue;
    if (collection === 'india' && !(recipe.tags || []).includes('India')) continue;
    if (collection === 'house' && recipe.houseOriginal !== true) continue;
    if (query && recipeSearchScore(recipe, query, vibes) < 0) continue;
    const required = (recipe.ingredients || []).filter((item) => !item.optional && !isStaple(item.name));
    if (!required.length) continue;
    const missing = [];
    let matched = 0;
    const ingredients = (recipe.ingredients || []).map((item) => {
      const staple = isStaple(item.name);
      const { have, alternative } = resolveIngredient(item.name, pantryNames, recipe, ingredientMatches, isStaple);
      if (!staple && !item.optional) {
        if (have) matched += 1;
        else missing.push(item.name);
      }
      return { ...item, have, staple, ...(alternative ? { alternative } : {}) };
    });
    // Include any genuinely owned ingredient, even when it is a pantry staple
    // or the drink needs more than two additions. Related forms are discovery
    // suggestions only: their have/missing values above remain unchanged.
    const direct = matched > 0 || recipe.ingredients.some(item => pantryNames.some(name => ingredientMatches(name, item.name)));
    const relatedIngredients = direct ? [] : required.map(item => discover(item.name)).filter(Boolean);
    if (!direct && !relatedIngredients.length) continue;
    const requiredTotal = required.length;
    results.push({
      ...recipe,
      ingredients,
      ...(relatedIngredients.length ? { relatedIngredients } : {}),
      alternativeCount: ingredients.filter(item => item.alternative).length,
      preparationCount: ingredients.filter(item => item.alternative?.kind === 'prepare').length,
      missing,
      matched,
      requiredTotal,
      missingCount: missing.length,
      matchRatio: requiredTotal ? matched / requiredTotal : 0,
      total: requiredTotal,
    });
  }
  results.sort((a, b) => Number(Boolean(a.relatedIngredients?.length)) - Number(Boolean(b.relatedIngredients?.length)) || a.missingCount - b.missingCount || a.preparationCount - b.preparationCount || a.alternativeCount - b.alternativeCount || b.matchRatio - a.matchRatio || b.matched - a.matched || b.requiredTotal - a.requiredTotal || norm(a.name).localeCompare(norm(b.name)));
  return results;
}

function seedNumber(seed) {
  let result = 0;
  for (const character of String(seed || 'x')) result = (result * 31 + character.charCodeAt(0)) >>> 0;
  return result;
}

function stableHash(recipe, seed) {
  let hash = 7;
  for (const character of String(recipe.id)) hash = (hash * 33 + character.charCodeAt(0)) >>> 0;
  return ((hash + seed) * 2654435761) >>> 0;
}

export function queryRecipes(recipes, options = {}) {
  const list = (recipes || []).filter(isBrowseableRecipe)
    .filter((recipe) => !options.category || recipe.vibe === options.category)
    .filter((recipe) => options.collection !== 'india' || (recipe.tags || []).includes('India'))
    .filter((recipe) => options.collection !== 'house' || recipe.houseOriginal === true);
  const q = norm(options.q);
  const scores = new Map();
  const filtered = q ? list.filter((recipe) => {
    const score = recipeSearchScore(recipe, q, options.vibes || {});
    if (score < 0) return false;
    scores.set(recipe.id, score);
    return true;
  }) : list;
  const seed = seedNumber(options.seed || 'x');
  const ordered = [...filtered].sort((a, b) => {
    if (options.sort === 'likes') return (Number(options.likes?.[b.id]) || 0) - (Number(options.likes?.[a.id]) || 0) || stableHash(a, seed) - stableHash(b, seed);
    if (q) return scores.get(a.id) - scores.get(b.id) || stableHash(a, seed) - stableHash(b, seed);
    return stableHash(a, seed) - stableHash(b, seed);
  });
  const offset = Math.max(0, Math.floor(Number(options.offset) || 0));
  const limit = Math.min(48, Math.max(1, Math.floor(Number(options.limit) || 12)));
  const page = ordered.slice(offset, offset + limit);
  return { recipes: page, total: ordered.length, offset, limit, hasMore: offset + page.length < ordered.length };
}

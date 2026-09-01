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
    if (ALIAS_GROUPS[index].some((term) => ` ${n} `.includes(` ${term} `))) return index;
  }
  return -1;
}

export function ingredientMatches(pantryName, recipeName) {
  const a = norm(pantryName);
  const b = norm(recipeName);
  if (!a || !b) return false;
  if (a === b || ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `)) return true;
  const group = aliasGroupOf(a);
  return group >= 0 && group === aliasGroupOf(b);
}

export const isStaple = (name) => STAPLES.has(norm(name));

export function recipeSearchScore(recipe, query, vibes = {}) {
  const q = norm(query);
  if (!q) return 0;
  const name = norm(recipe?.name);
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (` ${name} `.includes(` ${q} `)) return 2;
  if (name.includes(q)) return 3;
  const ingredientText = norm((recipe?.ingredients || []).map((item) => item.name).join(' '));
  if (` ${ingredientText} `.includes(` ${q} `)) return 4;
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
  const words = q.split(' ').filter(Boolean);
  if (words.length > 1 && words.every((word) => ` ${metadata} `.includes(` ${word} `) || ` ${ingredientText} `.includes(` ${word} `))) return 5;
  const method = norm(recipe?.instructions);
  return ` ${method} `.includes(` ${q} `) ? 6 : -1;
}

export const isBrowseableRecipe = (recipe) => Boolean(
  recipe && typeof recipe.id === 'string' && recipe.id.trim() &&
  typeof recipe.name === 'string' && recipe.name.trim() &&
  typeof recipe.instructions === 'string' && recipe.instructions.trim() &&
  Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0,
);

export function shelfMatchRecipes(recipes, pantry, options = {}) {
  const pantryNames = Array.isArray(pantry) ? pantry.map(norm).filter(Boolean) : [];
  const query = norm(options.query);
  const category = options.category || '';
  const collection = options.collection || '';
  const vibes = options.vibes || {};
  const results = [];
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
      const have = staple || pantryNames.some((name) => ingredientMatches(name, item.name));
      if (!staple && !item.optional) {
        if (have) matched += 1;
        else missing.push(item.name);
      }
      return { ...item, have, staple };
    });
    if (matched === 0 || missing.length > 2) continue;
    const requiredTotal = required.length;
    results.push({
      ...recipe,
      ingredients,
      missing,
      matched,
      requiredTotal,
      missingCount: missing.length,
      matchRatio: requiredTotal ? matched / requiredTotal : 0,
      total: requiredTotal,
    });
  }
  results.sort((a, b) => a.missingCount - b.missingCount || b.matchRatio - a.matchRatio || b.matched - a.matched || b.requiredTotal - a.requiredTotal || norm(a.name).localeCompare(norm(b.name)));
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

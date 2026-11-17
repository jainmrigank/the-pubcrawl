import { INGREDIENT_GUIDES } from './ingredient-guide-data.mjs';

// Keep this module independent of catalogue/React code so all three runtimes agree.
const key = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const byName = new Map();
for (const guide of INGREDIENT_GUIDES) {
  for (const name of [...guide.names, ...guide.aliases]) byName.set(key(name), guide);
}
export { INGREDIENT_GUIDES };
export function ingredientGuide(name) { return byName.get(key(name)); }
/** Stable recipe content, independent of what a particular reader owns. */
export function ingredientGuidance(name, recipe) {
  const guide = ingredientGuide(name);
  if (!guide) return undefined;
  const description = recipe?.id === '15813' && guide.id === 'IC02' ? 'cinnamon liqueur · 100 proof'
    : recipe?.id === '178335' && guide.id === 'IC26' ? 'tequila-based coconut liqueur' : guide.description;
  return {
    guideId: guide.id,
    description,
    alternatives: !recipe || alternativeAllowed(recipe, guide) ? [...guide.alternatives] : [],
  };
}
export function ingredientLabel(name) {
  const guide = ingredientGuide(name);
  return guide && !key(name).includes(key(guide.description)) ? `${name} / ${guide.description}` : name;
}
export function ingredientSearchText(name) {
  const guide = ingredientGuide(name);
  return [name, guide?.description, ...(guide?.aliases || [])].filter(Boolean).join(' ');
}
export function searchIngredientIndex(ingredients, query, limit = 12) {
  const q = key(query);
  if (!q) return [];
  return ingredients.map(item => {
    const n = key(item.name);
    const text = key(ingredientSearchText(item.name));
    const score = n === q ? 100 : n.startsWith(q) ? 80 : n.split(' ').some(word => word.startsWith(q)) ? 60 : n.includes(q) ? 40 : text.includes(q) ? 20 : -1;
    return { item, score };
  }).filter(row => row.score >= 0).sort((a, b) => b.score - a.score || a.item.name.length - b.item.name.length || a.item.name.localeCompare(b.item.name)).slice(0, limit).map(row => row.item);
}
// Do not collapse styles that differ in colour, dairy, base or proof-sensitive use.
function identity(name, guide) {
  const n = key(name);
  if (guide.id === 'IC20') return n.includes('brandy') ? 'blackberry-brandy' : 'blackberry-liqueur';
  if (guide.id === 'IC21') return n.startsWith('white') ? 'white-mint' : n.startsWith('green') ? 'green-mint' : n;
  if (guide.id === 'IC17-cacao') return n.includes('dark') ? 'dark-cacao' : n.includes('creme') ? 'cacao' : 'unspecified-chocolate';
  return guide.id;
}
/** Only an explicit name/type alias. No compound/home-preparation inference here. */
export function guideIngredientMatch(pantryName, recipeName) {
  const a = ingredientGuide(pantryName), b = ingredientGuide(recipeName);
  if (!a && !b) return null;
  return Boolean(a && b && identity(pantryName, a) === identity(recipeName, b));
}
const guardedRecipes = new Set(['13501', '13328', '13395', '14730', '17178', '11961', '17122', '16942', '13807', '13405', '13066', '13202', '16485', '15813']);
export function alternativeAllowed(recipe, guide) {
  if (guardedRecipes.has(String(recipe?.id))) return false;
  if (guide.id === 'IC26' && String(recipe?.id) === '178335') return false;
  const method = recipe?.instructions || '';
  return !/\blayer(?:ed|ing)?\b|\bignite\b|\bflam(?:e|ing)\b|\bhot damn 100\b/i.test(method);
}
/** An owned ingredient, an owned finished variation, or a measured preparation. */
export function resolveIngredient(name, pantry, recipe, matches, staple) {
  const guide = ingredientGuide(name);
  // An ambiguous brand/type on Shelf does not establish these recipe-specific requirements.
  if (guide?.id === 'IC02' && String(recipe?.id) === '15813') return { have: pantry.some(item => key(item) === 'hot damn 100') };
  if (guide?.id === 'IC26' && String(recipe?.id) === '178335') return { have: pantry.some(item => key(item) === 'tequila based coconut liqueur') };
  const original = pantry.find(item => key(item) === key(name));
  if (original || staple(name)) return { have: true };
  const generic = pantry.find(item => matches(item, name));
  if (generic) {
    // Generic labels do not prove the strength/style required by a
    // layered or high-proof recipe. Keep that recipe's original product.
    if (guide && !alternativeAllowed(recipe, guide)) return { have: false };
    return { have: true, ...(guide ? { alternative: { kind: 'alternative', label: generic, guideId: guide.id } } : {}) };
  }
  if (!guide || !alternativeAllowed(recipe, guide)) return { have: false };
  const bottle = pantry.find(item => (guide.direct || []).some(candidate => key(candidate) === key(item)));
  if (bottle) return { have: true, alternative: { kind: 'alternative', label: bottle, guideId: guide.id } };
  const finished = pantry.find(item => guide.finished && key(item) === key(guide.finished));
  if (finished) return { have: true, alternative: { kind: 'prepared', label: finished, guideId: guide.id } };
  // Only sourced, measured same-session preparations can be inferred from inputs.
  // Unmeasured variations and multi-day infusions require explicitly owned stock.
  if (guide.quick && guide.inputs.every(input => staple(input) || pantry.some(item => matches(item, input)))) {
    return { have: true, alternative: { kind: 'prepare', label: guide.finished, guideId: guide.id } };
  }
  return { have: false };
}
const guideIngredients = [...new Set(INGREDIENT_GUIDES.flatMap(guide => [...guide.aliases, ...(guide.direct || []), ...(guide.inputs || []), ...(guide.finished ? [guide.finished] : [])]))].map(name => ({ name, category: key(name).startsWith('homemade') || key(name) === 'citrus soda with orange peel' ? 'Prepared ingredient' : '', image: '' }));

export const GUIDE_INGREDIENTS = [...guideIngredients, { name: 'Hot Damn 100', category: 'Liqueur', image: '' }, { name: 'Tequila-based coconut liqueur', category: 'Liqueur', image: '' }];

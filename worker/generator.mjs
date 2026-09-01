import { norm } from '../shared/catalog-engine.mjs';

// Keep the fallback conservative.  The generated ingredient catalogue is
// authoritative when it has a category, but a handful of branded spirits in
// the source data are unfortunately classified as "Other".  The name check
// closes that gap so a requested zero-proof fallback can never echo a known
// alcoholic bottle simply because its catalogue row is miscategorised.
const SPIRIT_WORDS = /\b(vodka|gin|rum|tequila|mezcal|whisk(?:e|y)|bourbon|scotch|brandy|cognac|pisco|cachaca|soju|sake|feni|liqueur|vermouth|wine|prosecco|champagne|beer|cider|bitters|aperol|campari|amaro|chartreuse|cointreau|triple sec|grand marnier|absinthe|schnapps|curacao|falernum|pimms|jagermeister|fernet|suze|st germain|kahlua|baileys|amaretto|midori|sambuca|chambord|benedictine|drambuie|frangelico|galliano|malibu|passoa|tia maria|southern comfort|absolut|smirnoff|bacardi|captain morgan|hennessy|remy martin|jack daniel|jameson|johnnie walker|makers mark|tanqueray|bombay sapphire|hendrick|patron|don julio|casamigos)\b/i;
const ALCOHOL_CATEGORIES = new Set(['Spirit', 'Liqueur', 'Wine & Fortified', 'Beer & Cider']);
const FIRST = ['Shelf', 'Bright', 'Copper', 'Quiet', 'Midnight', 'Garden', 'Citrus', 'Velvet'];
const SECOND = ['Signal', 'Highball', 'Fizz', 'House Pour', 'Shortcut', 'Spritz', 'Sour', 'Drift'];

function stableIndex(seed, length) {
  let value = 2166136261;
  for (const character of String(seed)) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return Math.abs(value) % length;
}

function idFor(name, ingredients) {
  let value = 5381;
  const source = `${name}|${ingredients.join(',')}`;
  for (const character of source) value = ((value * 33) ^ character.charCodeAt(0)) >>> 0;
  return `custom-${value.toString(36)}`;
}

export function generateFallback(pantry = [], requestedVibe = '') {
  const names = pantry.map((value) => String(value).trim()).filter(Boolean).slice(0, 5);
  const safe = names.filter((name) => !SPIRIT_WORDS.test(name));
  const use = requestedVibe === 'zeroproof' ? (safe.length ? safe : ['Lime Juice', 'Soda Water']) : (names.length ? names : ['Soda Water']);
  const ingredients = use.slice(0, 3).map((name, index) => ({
    name,
    measure: index === 0 ? '45 ml' : index === 1 ? '20 ml' : 'top up',
  }));
  const seed = norm(use.join('|')) || 'shelf';
  const name = requestedVibe === 'zeroproof'
    ? 'The Clear Pour'
    : `${FIRST[stableIndex(seed, FIRST.length)]} ${SECOND[stableIndex(`${seed}:2`, SECOND.length)]}`;
  return {
    id: idFor(name, use),
    name,
    tagline: requestedVibe === 'zeroproof' ? 'Bright, balanced and entirely alcohol-free.' : 'An off-menu pour built from what is already on your shelf.',
    category: requestedVibe === 'zeroproof' ? 'Zero Proof Original' : 'AI Original',
    alcoholic: requestedVibe === 'zeroproof' ? 'Non alcoholic' : (use.some((name) => SPIRIT_WORDS.test(name)) ? 'Alcoholic' : 'Non alcoholic'),
    glass: 'Highball glass',
    instructions: 'Build over ice in a highball glass, stir gently and serve cold.',
    thumb: '', video: '', tags: ['AI Original'], iba: '', source: 'fallback',
    vibe: requestedVibe && ['tropical', 'refreshing', 'boozy', 'sweet', 'cozy', 'party', 'zeroproof'].includes(requestedVibe)
      ? requestedVibe
      : (use.some((name) => SPIRIT_WORDS.test(name)) ? 'boozy' : 'zeroproof'),
    ingredients,
  };
}

function knownByName(knownIngredients, name) {
  const needle = norm(name);
  if (!needle) return null;
  return (knownIngredients || []).find((ingredient) => norm(ingredient?.name || ingredient) === needle)
    || (knownIngredients || []).find((ingredient) => {
      const candidate = norm(ingredient?.name || ingredient);
      return candidate.startsWith(`${needle} `) || needle.startsWith(`${candidate} `);
    })
    || null;
}

function alcoholic(name, known) {
  return Boolean(
    (known && ALCOHOL_CATEGORIES.has(known.category))
    || SPIRIT_WORDS.test(name),
  );
}

/**
 * Deterministic safe fallback for an explicitly requested zero-proof pour.
 * Unknown shelf labels are excluded rather than being guessed, because a
 * guessed ingredient could put alcohol back into a drink promised as safe.
 */
export function generateZeroProofFallback(pantry = [], knownIngredients = []) {
  const known = Array.isArray(knownIngredients) ? knownIngredients : [];
  const safe = [];
  for (const raw of Array.isArray(pantry) ? pantry : []) {
    const name = String(raw || '').trim();
    const match = knownByName(known, name);
    if (!match || alcoholic(name, match)) continue;
    if (!safe.some((item) => norm(item) === norm(match.name))) safe.push(match.name);
  }

  // These defaults are resolved through the same catalogue, so the result
  // remains usable by the client and cannot introduce an unverified name.
  for (const fallback of ['Lime juice', 'Soda Water', 'Sugar syrup']) {
    const match = knownByName(known, fallback);
    if (match && !alcoholic(match.name, match) && !safe.some((item) => norm(item) === norm(match.name))) safe.push(match.name);
  }

  const use = safe.slice(0, 3);
  const ingredients = (use.length ? use : ['Soda Water']).map((name, index) => ({
    name,
    measure: index === 0 ? '30 ml' : index === 1 ? 'top up' : '15 ml',
  }));
  return {
    id: idFor('The Clear Pour', use),
    name: 'The Clear Pour',
    tagline: 'Bright, balanced and entirely alcohol-free.',
    category: 'Zero Proof Original',
    alcoholic: 'Non alcoholic',
    glass: 'Highball glass',
    instructions: 'Build over ice in a highball glass, stir gently and serve cold.',
    thumb: '', video: '', tags: ['AI Original', 'Zero Proof'], iba: '', source: 'fallback',
    vibe: 'zeroproof',
    ingredients,
  };
}

/** Vibe taxonomy — every cocktail gets exactly one, used to colour-code the flash cards. */

export const VIBES = {
  tropical: { id: 'tropical', label: 'Tropical', color: '#31695A' },
  refreshing: { id: 'refreshing', label: 'Fresh & Citrus', color: '#5C7A3B' },
  boozy: { id: 'boozy', label: 'Spirit-Forward', color: '#8A5A24' },
  sweet: { id: 'sweet', label: 'Dessert', color: '#8E4A5B' },
  cozy: { id: 'cozy', label: 'Warm', color: '#A3492B' },
  party: { id: 'party', label: 'Party & Shots', color: '#4A4E7A' },
};

const has = (haystack, words) => words.some((w) => haystack.includes(w));

/** Classify a drink object ({name, category, glass, instructions, ingredients:[{name}]}) into a vibe id. */
export function classifyVibe(drink) {
  const name = (drink.name || '').toLowerCase();
  const category = (drink.category || '').toLowerCase();
  const glass = (drink.glass || '').toLowerCase();
  const instructions = (drink.instructions || '').toLowerCase();
  const ing = drink.ingredients.map((i) => i.name.toLowerCase()).join(' | ');
  const all = `${name} | ${ing}`;

  if (
    /\b(hot|toddy|mulled|warmed?|boiling|steamed?)\b/.test(`${name} ${instructions}`) ||
    has(ing, ['hot chocolate', 'hot damn'])
  )
    return 'cozy';

  if (
    has(category, ['shot', 'punch / party drink']) ||
    has(glass, ['shot glass']) ||
    has(name, ['bomb', 'shooter', 'jello', 'slammer'])
  )
    return 'party';

  if (
    has(all, [
      'pineapple', 'coconut', 'mango', 'passion', 'papaya', 'guava', 'banana',
      'blue curacao', 'midori', 'melon liqueur', 'tiki', 'colada', 'mai tai',
      'zombie', 'hurricane', 'bahama', 'caribbean', 'aloha',
    ])
  )
    return 'tropical';

  if (
    has(all, [
      'cream', 'creme de cacao', 'chocolate', 'cacao', 'cocoa', 'ice cream',
      'condensed milk', 'caramel', 'marshmallow', 'baileys', 'irish cream', 'advocaat',
    ]) ||
    has(category, ['cocoa', 'milk / float / shake', 'coffee / tea'])
  )
    return 'sweet';

  if (
    has(all, [
      'soda water', 'club soda', 'tonic', 'ginger ale', 'ginger beer', 'sprite',
      '7-up', 'lemonade', 'mint', 'cucumber', 'watermelon', 'iced tea',
    ]) ||
    has(name, ['spritz', 'fizz', 'collins', 'cooler', 'mojito', 'julep', 'smash', 'breeze', 'crush']) ||
    has(glass, ['highball', 'collins'])
  )
    return 'refreshing';

  if ((drink.alcoholic || '').toLowerCase().includes('non')) return 'refreshing';
  return 'boozy';
}

/** Attach vibe metadata to a drink (mutates + returns). */
export function withVibe(drink) {
  const vibe = classifyVibe(drink);
  drink.vibe = vibe;
  return drink;
}

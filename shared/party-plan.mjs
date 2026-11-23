// Measurements are per finished glass. Nominal measures scale linearly.
// Strong seasonings and garnishes are adjusted in the mix, outside the totals.
export const partyRecipes = [
  {
    id: 'x-shikanji', name: 'Nimbu Shikanji',
    items: [['Lime juice', 25, 'ml'], ['Sugar syrup (1:1)', 20, 'ml'], ['Chilled water', 130, 'ml', 'serve']],
    prep: 'Stir the lime and syrup together and refrigerate. Set out black salt and roasted cumin.',
    serve: 'Dilute over ice. Add black salt and a light pinch of cumin to taste.',
    extras: ['Black salt', 'Roasted cumin powder', 'Ice'],
  },
  {
    id: 'x-kokum', name: 'Kokum Cooler',
    items: [['Dried unsweetened kokum', 4, 'g'], ['Water for steeping', 55, 'ml'], ['Sugar syrup (1:1)', 20, 'ml'], ['Chilled water', 100, 'ml', 'serve']],
    prep: 'Steep kokum in hot water for 20 minutes, strain and press it. Top the strained infusion back up to its measured volume, cool, then add syrup.',
    serve: 'Add chilled water and ice. Adjust with a little syrup if the kokum is especially tart.',
    extras: ['Ice'],
  },
  {
    id: 'x-chaas', name: 'Masala Chaas',
    items: [['Plain curd', 75, 'g'], ['Chilled water', 100, 'ml'], ['Mint', 2, 'leaves', 'serve']],
    prep: 'Whisk curd and cold water together. Season lightly with cumin and black salt. Refrigerate promptly.',
    serve: 'Stir again and finish with the mint. Contains dairy.',
    extras: ['Black salt', 'Roasted cumin powder'],
  },
];

function key(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function buildPartyPlan(selections, pantry = []) {
  const stocked = new Set(pantry.map(key));
  const rows = new Map();
  const extras = new Set();
  for (const { recipe, servings } of selections) {
    if (!Number.isInteger(servings) || servings < 1 || servings > 60) throw new RangeError('Choose 1–60 servings per drink');
    for (const [name, amount, unit, timing] of recipe.items) {
      const id = key(name) + '|' + unit;
      const row = rows.get(id) || { name, unit, prepare: 0, serve: 0, onShelf: stocked.has(key(name)) };
      row[timing === 'serve' ? 'serve' : 'prepare'] += amount * servings;
      rows.set(id, row);
    }
    for (const extra of recipe.extras) extras.add(extra);
  }
  return { rows: [...rows.values()], extras: [...extras].map(name => ({ name, onShelf: stocked.has(key(name)) })) };
}

export const measure = (n, unit) => n >= 1000 && unit === 'ml' ? n / 1000 + ' L'
  : n >= 1000 && unit === 'g' ? n / 1000 + ' kg' : n + ' ' + unit;

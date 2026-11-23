import { buildPartyPlan, measure, partyRecipes } from './party-plan.mjs';

const [shikanji, kokum, chaas] = partyRecipes;
const gingerFizz = {
  name: 'Ginger Lime Fizz',
  items: [['Lime juice', 20, 'ml'], ['Ginger syrup', 25, 'ml'], ['Soda water', 130, 'ml', 'serve']],
  prep: 'Stir lime juice into ginger syrup and chill. Taste the base diluted with soda.',
  serve: 'Pour the base over ice and top with chilled soda immediately before serving.',
  extras: ['Ice', 'Fresh ginger for garnish'],
};
const jamun = {
  name: 'Jamun and Lime Soda',
  items: [['Unsweetened jamun pulp', 40, 'g'], ['Lime juice', 10, 'ml'], ['Sugar syrup (1:1)', 20, 'ml'], ['Soda water', 120, 'ml', 'serve']],
  prep: 'Remove the stones before weighing the pulp. Blend the pulp with lime and syrup, then chill.',
  serve: 'Stir the base before pouring. Add soda at the glass and adjust if the fruit is very tart.',
  extras: ['Ice'],
};
const mango = {
  name: 'Mango and Cardamom Lassi',
  items: [['Ripe mango pulp', 75, 'g'], ['Plain curd', 80, 'g'], ['Chilled water', 35, 'ml']],
  prep: 'Blend the mango, curd and chilled water. Add a little ground cardamom and refrigerate promptly.',
  serve: 'Stir or briefly blend again before pouring. Contains dairy.',
  extras: ['Ground cardamom'],
};

export const freeHostingMenu = { title: 'Nimbu and ginger', description: 'One still pour and one fizz, with lime doing double duty.', recipes: [shikanji, gingerFizz] };
const menus = [
  freeHostingMenu,
  { title: 'Kokum and cumin', description: 'A tart kokum cooler with salted chaas.', recipes: [kokum, chaas] },
  { title: 'Jamun and mango', description: 'A seasonal soda and a cold lassi.', recipes: [jamun, mango] },
];

export function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}

function quantityCell(recipe, guests) {
  return recipe.items.map(([name, amount, unit, stage]) =>
    '<li><span>' + escapeHtml(name) + (stage === 'serve' ? ' <small>(at service)</small>' : '') + '</span><strong>' +
    escapeHtml(measure(amount * guests, unit)) + '</strong></li>').join('');
}
function emitShoppingList(menu) {
  const sheet = [6, 12].map(servings => buildPartyPlan(menu.recipes.map(recipe => ({ recipe, servings }))));
  return '<h3>Shopping list</h3><table><thead><tr><th scope="col">Ingredient</th><th scope="col">6 guests</th><th scope="col">12 guests</th></tr></thead><tbody>' +
    sheet[0].rows.map((row, index) => {
      const double = sheet[1].rows[index];
      return '<tr><th scope="row">' + escapeHtml(row.name) + '</th><td>' + escapeHtml(measure(row.prepare + row.serve, row.unit)) +
      '</td><td>' + escapeHtml(measure(double.prepare + double.serve, row.unit)) + '</td></tr>';
    }).join('') + '</tbody></table><p>Also have ' + escapeHtml(sheet[0].extras.map(extra => extra.name).join(', ').toLowerCase()) + '.</p>';
}

export function emitMenu(menu) {
  return '<section class="batch-menu"><h2>' + escapeHtml(menu.title) + '</h2><p>' + escapeHtml(menu.description) +
    '</p><p>Quantities make one glass of each drink per guest.</p>' + emitShoppingList(menu) +
    menu.recipes.map(recipe => '<article><h3>' + escapeHtml(recipe.name) + '</h3><div class="batch-quantities">' +
      [6, 12].map(guests => '<div><h4>' + guests + ' glasses</h4><ul>' + quantityCell(recipe, guests) + '</ul></div>').join('') +
      '</div><p><strong>Prep.</strong> ' + escapeHtml(recipe.prep) + '</p><p><strong>Serve.</strong> ' + escapeHtml(recipe.serve) + '</p></article>').join('') + '</section>';
}

export const hostingTimeline = '<ol><li><strong>The day before.</strong> Check the shopping list, refrigerate soda and make or buy syrup.</li><li><strong>Before guests arrive.</strong> Taste a single glass. Prep and refrigerate the bases. Set out glasses and label any dairy.</li><li><strong>At service.</strong> Add ice and chilled water as directed. Pour soda last so the drinks stay fizzy.</li></ol>';

export function hostingPackDownload() {
  const printedMenus = menus.map(menu => '<section class="print-menu"><p>The Pubcrawl</p><h2>' +
    escapeHtml(menu.title) + '</h2><ul>' + menu.recipes.map(recipe => '<li>' + escapeHtml(recipe.name) + '</li>').join('') +
    '</ul></section>').join('');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>The Pubcrawl Hosting Pack</title><style>body{font:16px/1.55 system-ui,sans-serif;color:#292f2a;margin:2rem auto;padding:0 1.4rem;max-width:820px}' +
    'h1,h2,h3{font-family:Georgia,serif;line-height:1.2}h1{font-size:2.5rem}h2{padding-top:1.1rem;border-top:1px solid #aaa}' +
    'table{width:100%;border-collapse:collapse}th,td{padding:.35rem .5rem;text-align:left;border-bottom:1px solid #ddd}ul{padding-left:1.3rem}' +
    '.batch-quantities{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1.5rem}.batch-quantities li{margin:.25rem 0}.batch-quantities strong{margin-left:.4rem}' +
    '.print-menu{text-align:center;border:1px solid;padding:2rem;margin:2rem 0}.print-menu ul{list-style:none;padding:0}.print-menu h2{border:0}' +
    '@media print{body{font-size:11pt;margin:0;padding:0}.batch-menu,.print-menu{break-before:page}article,tr{break-inside:avoid}}</style></head>' +
    '<body><header><p>The Pubcrawl</p><h1>The Hosting Pack</h1><p>Three zero-proof menus for 6 or 12 guests. Print this file or save it as a PDF from your browser.</p></header>' +
    '<main><h2>Prep timeline</h2>' + hostingTimeline + menus.map(emitMenu).join('') +
    '<h2>Printable menus</h2>' + printedMenus + '</main></body></html>';
}

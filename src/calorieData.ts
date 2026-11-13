/** Editorial serving estimates, checked 13 Nov 2026. Never nutrition-label claims. */
export const CALORIE_SOURCES = {
  ranking: { title: 'Drinks International · 2026 bestselling classics', url: 'https://drinksint.com/the-bestselling-classic-cocktails-at-the-worlds-best-bars-2026/' },
  energy: { title: 'NHS · energy in alcohol', url: 'https://www.nhs.uk/live-well/alcohol-advice/calories-in-alcohol/' },
  density: { title: 'NIST · ethanol density', url: 'https://physics.nist.gov/cgi-bin/Star/compos.pl?matno=153' },
  campari: { title: 'Alko · Campari 25% nutrition', url: 'https://www.alko.fi/fi/tuotteet/900049/campari' },
  aperol: { title: 'Alko · Aperol 11% nutrition', url: 'https://www.alko.fi/en/products/938435/aperol' },
  vermouth: { title: 'Bacardi · Martini nutrition', url: 'https://www.bacardilimited.com/nutrition/martini?brand_locale=en-GL' },
  triple: { title: 'Cointreau · nutrition', url: 'https://www.cointreau.com/us/en/faq' },
  coffee: { title: 'Pernod Ricard · Kahlúa 16% nutrition', url: 'https://www.pernod-ricard-korea.com/brands/kahlua' },
  amaretto: { title: 'Disaronno · technical specification (2010)', url: 'https://file.givana.be/products/_files/11664.pdf' },
  beer: { title: 'Heineken · original lager nutrition', url: 'https://www.heinekenfrance.fr/nos-marques/valeurs-nutritionnelles/infos-heineken/' },
  usda: { title: 'USDA · FoodData Central', url: 'https://fdc.nal.usda.gov/' },
} as const;

type Source = { title: string; url: string };
export type EnergyIngredient = {
  name: string;
  unit: 'ml' | 'g';
  abv: number;
  kcalPer100: number;
  basis: string;
  source: Source;
};
// 0.789 g/ml is a rounded ethanol density; 7 kcal/g is the NHS energy factor.
export const ethanolKcal = (ml: number, abv: number) => ml * abv / 100 * 0.789 * 7;
const spirit = (name: string, abv = 40): EnergyIngredient => ({ name, abv, unit: 'ml', kcalPer100: ethanolKcal(100, abv), basis: `Model: ${abv}% ABV, unflavoured and unsweetened. Alcohol energy only.`, source: CALORIE_SOURCES.energy });
const liquid = (name: string, abv: number, kcalPer100: number, basis: string, source: Source): EnergyIngredient => ({ name, abv, kcalPer100, basis, source, unit: 'ml' });
const food = (name: string, kcalPer100g: number, fdcId: number, density = 1.03): EnergyIngredient => liquid(name, 0, kcalPer100g * density, `USDA ${kcalPer100g} kcal/100 g; approximate density ${density} g/ml.`, { title: `USDA · ${name}`, url: `https://fdc.nal.usda.gov/food-details/${fdcId}/nutrients` });
export const energyIngredients: Record<string, EnergyIngredient> = {
  gin: spirit('Gin'), plymouth: spirit('Plymouth gin', 41.2), vodka: spirit('Vodka'),
  tequila: spirit('Tequila'), rum: spirit('White rum'), darkRum: spirit('Dark rum'),
  goldRum: spirit('Gold rum'), overproof: spirit('Overproof Demerara rum', 75.5),
  whisky: spirit('Whisky'), bourbon: spirit('Bourbon'), rye: spirit('Rye whiskey'),
  scotch: spirit('Blended Scotch'), islay: spirit('Islay Scotch', 43),
  mezcal: spirit('Mezcal'), cognac: spirit('Cognac / brandy'), pisco: spirit('Pisco'),
  cachaca: spirit('Cachaça'), absinthe: spirit('Absinthe', 60),
  campari: liquid('Campari', 25, 250, 'Published Alko value for its 25% bottling; other markets differ.', CALORIE_SOURCES.campari),
  aperol: liquid('Aperol', 11, 160, 'Published Alko value for its 11% bottling; other markets differ.', CALORIE_SOURCES.aperol),
  sweetVermouth: liquid('Sweet vermouth', 15, 145, 'Martini Rosso: 87 kcal per 60 ml, scaled to 100 ml.', CALORIE_SOURCES.vermouth),
  dryVermouth: liquid('Dry vermouth', 18, 110, 'Martini Extra Dry 18%: 66 kcal per 60 ml, scaled to 100 ml.', CALORIE_SOURCES.vermouth),
  triple: liquid('Orange liqueur', 40, 309, 'Cointreau Original: published 309 kcal per 100 ml.', CALORIE_SOURCES.triple),
  coffeeLiqueur: liquid('Coffee liqueur', 16, 245, 'Kahlúa Original 16%: published 245 kcal per 100 ml.', CALORIE_SOURCES.coffee),
  amaretto: liquid('Amaretto', 28, ethanolKcal(100, 28) + 120, 'Model: 28% ABV and 30 g sugar/100 ml, using the dated Disaronno specification. Representative estimate, not a current label.', CALORIE_SOURCES.amaretto),
  cream: liquid('Cream liqueur', 17, 306, 'NHS representative 17% cream liqueur: 153 kcal per 50 ml.', CALORIE_SOURCES.energy),
  prosecco: liquid('Prosecco', 11, ethanolKcal(100, 11) + 8, 'Model: 11% ABV and 2 g carbohydrate/100 ml; 4 kcal/g carbohydrate.', CALORIE_SOURCES.energy),
  sherry: liquid('Fino sherry', 15, ethanolKcal(100, 15) + 4, 'Model: 15% ABV and 1 g carbohydrate/100 ml; not the USDA sweet-sherry entry.', CALORIE_SOURCES.energy),
  redWine: liquid('Red wine', 13, 85 * .99, 'USDA table red wine 85 kcal/100 g, density approximated as 0.99 g/ml; 13% ABV assumed for the alcohol split.', { title: 'USDA · table red wine', url: 'https://fdc.nal.usda.gov/food-details/173190/nutrients' }),
  whiteWine: liquid('White wine', 12.5, 82 * .99, 'USDA table white wine 82 kcal/100 g, density approximated as 0.99 g/ml; 12.5% ABV assumed for the alcohol split.', { title: 'USDA · table white wine', url: 'https://fdc.nal.usda.gov/food-details/174837/nutrients' }),
  lager: liquid('Lager', 5, 42, 'Heineken Original representative lager: 42 kcal/100 ml; 5% ABV.', CALORIE_SOURCES.beer),
  lemon: food('Lemon juice', 22, 167747), lime: food('Lime juice', 25, 168156),
  grapefruit: food('Grapefruit juice', 39, 173039), tomato: food('Tomato juice', 17, 170545),
  egg: food('Egg white', 52, 172183),
  sugar: { name: 'Sugar', unit: 'g', abv: 0, kcalPer100: 400, basis: 'Model: 4 kcal/g carbohydrate. One cube = 4 g; one level teaspoon = 4 g.', source: CALORIE_SOURCES.energy },
  syrup: liquid('Simple syrup', 0, 246, 'Model: 1:1 sugar to water by weight; density 1.23 g/ml; 4 kcal/g sugar.', CALORIE_SOURCES.energy),
  honeySyrup: liquid('Honey syrup', 0, 304 * .5 * 1.225, 'Model: equal weights honey and water; density 1.225 g/ml. USDA honey supplies 304 kcal/100 g; 61.25 g honey per 100 ml syrup.', { title: 'USDA · honey', url: 'https://fdc.nal.usda.gov/food-details/169640/nutrients' }),
  grapefruitSoda: liquid('Grapefruit soda', 0, 40, 'Model: regular soda with 10 g sugar/100 ml; no diet mixer substitution.', CALORIE_SOURCES.energy),
  gingerBeer: liquid('Ginger beer', 0, 40, 'Model: regular ginger beer with 10 g sugar/100 ml; non-alcoholic.', CALORIE_SOURCES.energy),
  falernum: liquid('Falernum', 11, ethanolKcal(100, 11) + 140, 'Model: 11% ABV and 35 g sugar/100 ml. Bottlings vary substantially.', CALORIE_SOURCES.energy),
  grenadine: liquid('Grenadine', 0, 300, 'Model: 75 g sugar/100 ml; 4 kcal/g sugar.', CALORIE_SOURCES.energy),
  cinnamonSyrup: liquid('Cinnamon syrup', 0, 246, 'Model: same 1:1 sugar syrup; spice calories omitted.', CALORIE_SOURCES.energy),
  bitters: liquid('Aromatic bitters', 44.7, ethanolKcal(100, 44.7) + 24, 'Model: 44.7% ABV and 6 g sugar/100 ml; one dash = 0.8 ml.', CALORIE_SOURCES.energy),
  orangeBitters: liquid('Orange bitters', 28, ethanolKcal(100, 28) + 24, 'Model: 28% ABV and 6 g sugar/100 ml; one dash = 0.8 ml.', CALORIE_SOURCES.energy),
  anise: spirit('Anise spirit', 40),
  seasoning: liquid('Worcestershire / hot sauce', 0, 80, 'Model: 80 kcal/100 ml for a small mixed seasoning allowance.', CALORIE_SOURCES.energy),
  espresso: liquid('Espresso', 0, 9, 'Model: 9 kcal/100 ml for unsweetened espresso.', CALORIE_SOURCES.usda),
  soda: liquid('Soda water', 0, 0, 'Unsweetened soda water; splash volumes are explicit assumptions.', CALORIE_SOURCES.energy),
};

export type CalorieDrink = { id: string; name: string; group: 'cocktail' | 'reference' | 'shot'; serving: string; parts: [string, number][]; rank?: number; recipeSource?: Source; note?: string; menuQuery?: string };
const iba = (slug: string): Source => ({ title: 'IBA · recipe specification', url: `https://iba-world.com/iba-cocktail/${slug}/` });
const cocktail = (rank: number, name: string, slug: string, parts: [string, number][], note = '', recipeSource = iba(slug)): CalorieDrink => ({ id: slug, name, group: 'cocktail', serving: '1 recipe', rank, parts, recipeSource, note, menuQuery: name === 'Aperol Spritz' ? 'Spritz' : name });
export const calorieDrinks: CalorieDrink[] = [
  cocktail(1, 'Negroni', 'negroni', [['gin',30],['campari',30],['sweetVermouth',30]]),
  cocktail(2, 'Margarita', 'margarita', [['tequila',50],['triple',20],['lime',15]], 'Cointreau models the triple sec. Salt rim and garnish excluded.'),
  cocktail(3, 'Old Fashioned', 'old-fashioned', [['bourbon',45],['sugar',4],['bitters',1.6]], 'One sugar cube = 4 g. “Few dashes” = two; water adds no calories.'),
  cocktail(4, 'Dry Martini', 'dry-martini', [['gin',60],['dryVermouth',10]]),
  cocktail(5, 'Espresso Martini', 'espresso-martini', [['vodka',50],['coffeeLiqueur',30],['syrup',10],['espresso',30]], 'One strong espresso = 30 ml; Kahlúa model is the 16% bottling.'),
  cocktail(6, 'Daiquiri', 'daiquiri', [['rum',60],['lime',20],['sugar',8]], 'Two bar spoons of sugar modelled as 8 g total.'),
  cocktail(7, 'Aperol Spritz', 'spritz', [['prosecco',90],['aperol',60],['soda',30]], 'Soda splash = 30 ml. Garnish excluded; no ice calories.'),
  cocktail(8, 'Paloma', 'paloma', [['tequila',50],['lime',5],['grapefruitSoda',100]], 'Regular grapefruit soda model; salt adds no calories.'),
  cocktail(9, 'Whiskey Sour', 'whiskey-sour', [['bourbon',45],['lemon',25],['syrup',20]], 'Optional egg white is excluded.'),
  cocktail(10, 'Manhattan', 'manhattan', [['rye',50],['sweetVermouth',20],['bitters',.8]], 'One dash = 0.8 ml.'),
  cocktail(11, 'Amaretto Sour', 'amaretto-sour', [['amaretto',60],['lemon',30]], 'Disaronno recipe; optional syrup and egg white excluded. Amaretto nutrition uses a representative model.', { title: 'Disaronno · Sour recipe', url: 'https://disaronno.com/en-au/drinks/disaronno-sour/' }),
  cocktail(12, 'Mojito', 'mojito', [['rum',45],['lime',20],['sugar',8],['soda',60]], 'Two teaspoons sugar = 8 g; soda top-up = 60 ml. Mint and garnish excluded.'),
  cocktail(13, 'Gimlet', 'gimlet', [['plymouth',50],['lime',25],['syrup',15]], 'Plymouth fresh-lime version at 41.2% ABV; other Gimlet recipes use lime cordial.', { title: 'Plymouth · Gimlet recipe', url: 'https://www.plymouthgin.com/en/cocktail/gimlet/' }),
  cocktail(14, 'Bloody Mary', 'bloody-mary', [['vodka',45],['tomato',90],['lemon',15],['seasoning',2]], '2 ml allowance for Worcestershire and hot sauce; celery garnish excluded.'),
  cocktail(15, 'Americano', 'americano', [['campari',30],['sweetVermouth',30],['soda',30]], 'Soda splash = 30 ml.'),
  cocktail(16, 'Moscow Mule', 'moscow-mule', [['vodka',45],['gingerBeer',120],['lime',10]], 'Regular non-alcoholic ginger beer; no diet mixer substitution.'),
  cocktail(17, 'Bamboo', 'bamboo', [['sherry',45],['dryVermouth',45],['bitters',.8],['orangeBitters',.8]], 'Equal measures, each 1½ oz rounded to 45 ml. One dash = 0.8 ml.', { title: 'Liquor.com · Bamboo recipe', url: 'https://www.liquor.com/recipes/bamboo/' }),
  cocktail(18, 'Zombie', 'zombie', [['darkRum',45],['goldRum',45],['overproof',30],['lime',20],['falernum',15],['grapefruit',10],['cinnamonSyrup',5],['grenadine',5],['bitters',.8],['anise',.3]], 'Demerara rum assumed 75.5% ABV. Donn’s Mix = 10 ml grapefruit + 5 ml cinnamon syrup. 1 tsp = 5 ml; 6 drops = 0.3 ml. This estimate is especially recipe-sensitive.'),
  cocktail(19, 'Boulevardier', 'boulevardier', [['bourbon',45],['campari',30],['sweetVermouth',30]]),
  cocktail(20, 'Penicillin', 'penicillin', [['scotch',60],['islay',7.5],['lemon',22.5],['honeySyrup',22.5]], 'Islay float assumed 43% ABV. Equal-weight honey syrup model; ginger and garnish excluded.'),
  { id: 'beer', name: 'Pint of lager', group: 'reference', serving: '568 ml · 5%', parts: [['lager',568]], note: 'UK imperial pint, rounded to 568 ml. A US pint is 473 ml. Representative Heineken Original nutrition.' },
  { id: 'red-wine', name: 'Glass of red wine', group: 'reference', serving: '150 ml · 13%', parts: [['redWine',150]], note: 'A 150 ml table-wine serving, not a universal glass size. Brand and strength vary.' },
  { id: 'white-wine', name: 'Glass of white wine', group: 'reference', serving: '150 ml · 12.5%', parts: [['whiteWine',150]], note: 'A 150 ml table-wine serving. USDA mass values converted using an approximate density.' },
  ...['vodka','gin','rum','darkRum','whisky','bourbon','tequila','mezcal','cognac','pisco','cachaca','absinthe','triple','amaretto','coffeeLiqueur','cream'].map((id): CalorieDrink => ({ id: `shot-${id}`, name: energyIngredients[id].name, group: 'shot', serving: `30 ml · ${energyIngredients[id].abv}%`, parts: [[id,30]], note: energyIngredients[id].basis })),
];

export function drinkEnergy(drink: CalorieDrink) {
  let alcohol = 0, total = 0;
  for (const [id, amount] of drink.parts) {
    const ingredient = energyIngredients[id];
    if (!ingredient) throw new Error(`Unknown calorie ingredient: ${id}`);
    total += amount / 100 * ingredient.kcalPer100;
    alcohol += ingredient.unit === 'ml' ? ethanolKcal(amount, ingredient.abv) : 0;
  }
  return { total, alcohol, other: Math.max(0, total - alcohol) };
}
export const roundedKcal = (value: number) => Math.round(value / 5) * 5;

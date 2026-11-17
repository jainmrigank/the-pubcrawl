/** Editorial serving estimates, checked 14 Nov 2026. Never nutrition-label claims. */
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

export type CalorieDrink = { id: string; name: string; group: 'cocktail' | 'beer' | 'wine' | 'shot'; serving: string; parts: [string, number][]; rank?: number; recipeSource?: Source; note?: string; menuQuery?: string };
const iba = (slug: string): Source => ({ title: 'IBA · recipe specification', url: `https://iba-world.com/iba-cocktail/${slug}/` });
const cocktail = (rank: number, name: string, slug: string, parts: [string, number][], note = '', recipeSource = iba(slug)): CalorieDrink => ({ id: slug, name, group: 'cocktail', serving: '1 recipe', rank, parts, recipeSource, note, menuQuery: name === 'Aperol Spritz' ? 'Spritz' : name });
type ServingProfile = { id: string; name: string; group: 'beer' | 'wine'; ingredient: EnergyIngredient; amount: number; example: string; approximateAbv?: boolean };
const brewer = (name: string, abv: number, kcal: number, volume: number, url: string) => liquid(name, abv, kcal / volume * 100, `Published ${kcal} kcal per ${volume} ml; scaled linearly to the stated serving. A named example, not a style-wide average.`, { title: name + ' · brewer nutrition', url });
const sierra = (name: string, abv: number, kcal: number, slug: string) => brewer('Sierra Nevada ' + name, abv, kcal, 354.882, 'https://sierranevada.com/brews/' + slug);
const wineSector = { title: 'Wine sector · typical energy values (2018), hosted by the European Commission', url: 'https://food.ec.europa.eu/document/download/ff877db0-752c-4970-9434-1e989f6a8136_en?filename=fs_labelling-nutrition_legis_alcohol-self-regulatory-proposal_annex-wine-en.pdf' };
const sparkling = (name: string, kcal: number) => liquid(name, 11, kcal, '2018 wine-sector typical energy table, page 10. Alcohol split assumes 11% ABV; total energy is the published style estimate, not a bottle label.', wineSector);
const wine = (name: string, id: number, kcal: number, alcohol: number, gramsPerOz: number) => liquid(name, alcohol * (gramsPerOz / 29.5735) / .789, kcal * (gramsPerOz / 29.5735), `USDA SR Legacy ${id}: ${kcal} kcal and ${alcohol} g alcohol per 100 g. Density estimated from its ${gramsPerOz} g/fl oz portion. ABV and ml conversion are approximate; vintage and producer vary.`, { title: 'USDA · ' + name, url: `https://fdc.nal.usda.gov/food-details/${id}/nutrients` });
const servingProfiles: ServingProfile[] = [
  { id: 'beer', name: 'Lager', group: 'beer', ingredient: energyIngredients.lager, amount: 568, example: 'Heineken Original' },
  { id: 'beer-light', name: 'Light lager', group: 'beer', ingredient: brewer('Coors Light', 4.2, 102, 354.882, 'https://www.coorslight.com/en-US/our-beer'), amount: 568, example: 'Coors Light' },
  { id: 'beer-pilsner', name: 'Pilsner', group: 'beer', ingredient: sierra('Summerfest', 5, 155, 'summerfest'), amount: 568, example: 'Sierra Nevada Summerfest' },
  { id: 'beer-wheat', name: 'Wheat beer', group: 'beer', ingredient: brewer('Erdinger Weissbier', 5.3, 44, 100, 'https://static.erdinger.de/assets/biere/weissbier/gebinde-hefe-flasche.pdf'), amount: 568, example: 'Erdinger Weissbier' },
  { id: 'beer-pale', name: 'Pale ale', group: 'beer', ingredient: sierra('Pale Ale', 5.6, 175, 'pale-ale'), amount: 568, example: 'Sierra Nevada Pale Ale' },
  { id: 'beer-ipa', name: 'IPA', group: 'beer', ingredient: sierra('Torpedo', 7.2, 237, 'torpedo'), amount: 568, example: 'Sierra Nevada Torpedo' },
  { id: 'beer-hazy', name: 'Hazy IPA', group: 'beer', ingredient: sierra('Hazy Little Thing', 6.7, 214, 'hazy-little-thing'), amount: 568, example: 'Sierra Nevada Hazy Little Thing' },
  { id: 'beer-imperial-ipa', name: 'Imperial IPA', group: 'beer', ingredient: sierra('Big Little Thing', 9.5, 250, 'big-little-thing'), amount: 568, example: 'Sierra Nevada Big Little Thing' },
  { id: 'beer-stout', name: 'Dry stout', group: 'beer', ingredient: brewer('Guinness Draught', 4.2, 35, 100, 'https://www.guinness.com/en-gb/beers/guinness-draught'), amount: 568, example: 'Guinness Draught' },
  { id: 'beer-porter', name: 'Porter', group: 'beer', ingredient: brewer('Guinness West Indies Porter', 6, 53, 100, 'https://www.guinness.com/en-gb/frequently-asked-questions'), amount: 568, example: 'Guinness West Indies Porter' },
  { id: 'beer-imperial-stout', name: 'Imperial stout', group: 'beer', ingredient: sierra('Narwhal', 10.2, 327, 'narwhal'), amount: 568, example: 'Sierra Nevada Narwhal' },
  { id: 'beer-sour', name: 'Sour ale', group: 'beer', ingredient: sierra('Wild Little Thing', 5.5, 180, 'wild-little-thing'), amount: 568, example: 'Sierra Nevada Wild Little Thing' },
  { id: 'beer-bitter', name: 'Bitter / light ale', group: 'beer', ingredient: brewer("Young’s Light Ale", 3.2, 29, 100, 'https://www.carlsbergbritvic.co.uk/products/youngs/young-s-light-ale/?Ckey=56700'), amount: 568, example: "Young’s Light Ale" },
  { id: 'beer-zero', name: 'Alcohol-free lager', group: 'beer', ingredient: brewer('Heineken 0.0', 0, 21, 100, 'https://www.heineken.com/global/en/our-products/heineken-0-0'), amount: 568, example: 'Heineken 0.0' },
  // All wines use 150 ml for a like-volume comparison, including dessert wine.
  { id: 'red-wine', name: 'Red wine', group: 'wine', ingredient: wine('Red wine', 173190, 85.0, 10.6, 29.4), amount: 150, example: 'USDA style estimate', approximateAbv: true },
  { id: 'wine-cabernet', name: 'Cabernet Sauvignon', group: 'wine', ingredient: wine('Cabernet Sauvignon', 174833, 83.0, 10.5, 29.4), amount: 150, example: 'USDA style estimate', approximateAbv: true },
  { id: 'wine-merlot', name: 'Merlot', group: 'wine', ingredient: wine('Merlot', 171925, 83.0, 10.6, 29.4), amount: 150, example: 'USDA style estimate', approximateAbv: true },
  { id: 'wine-pinot-noir', name: 'Pinot Noir', group: 'wine', ingredient: wine('Pinot Noir', 174835, 82.0, 10.4, 29.4), amount: 150, example: 'USDA style estimate', approximateAbv: true },
  { id: 'wine-syrah', name: 'Syrah / Shiraz', group: 'wine', ingredient: wine('Syrah / Shiraz', 174836, 83.0, 10.5, 29.4), amount: 150, example: 'USDA style estimate', approximateAbv: true },
  { id: 'wine-zinfandel', name: 'Zinfandel', group: 'wine', ingredient: wine('Zinfandel', 173192, 88.0, 11.1, 29.4), amount: 150, example: 'USDA style estimate', approximateAbv: true },
  { id: 'wine-sangiovese', name: 'Sangiovese', group: 'wine', ingredient: wine('Sangiovese', 174839, 86.0, 10.9, 29.4), amount: 150, example: 'USDA style estimate', approximateAbv: true },
  { id: 'wine-gamay', name: 'Gamay', group: 'wine', ingredient: wine('Gamay', 171872, 78.0, 9.8, 29.4), amount: 150, example: 'USDA style estimate', approximateAbv: true },
  { id: 'white-wine', name: 'White wine', group: 'wine', ingredient: wine('White wine', 174837, 82.0, 10.3, 29.4), amount: 150, example: 'USDA style estimate', approximateAbv: true },
  { id: 'wine-chardonnay', name: 'Chardonnay', group: 'wine', ingredient: wine('Chardonnay', 174110, 84.0, 10.7, 29.3), amount: 150, example: 'USDA style estimate', approximateAbv: true },
  { id: 'wine-sauvignon', name: 'Sauvignon Blanc', group: 'wine', ingredient: wine('Sauvignon Blanc', 173201, 81.0, 10.5, 29.3), amount: 150, example: 'USDA style estimate', approximateAbv: true },
  { id: 'wine-pinot-grigio', name: 'Pinot Grigio', group: 'wine', ingredient: wine('Pinot Grigio', 174841, 83.0, 10.7, 29.3), amount: 150, example: 'USDA style estimate', approximateAbv: true },
  { id: 'wine-riesling', name: 'Riesling', group: 'wine', ingredient: wine('Riesling', 173200, 80.0, 9.5, 29.6), amount: 150, example: 'USDA style estimate', approximateAbv: true },
  { id: 'wine-chenin', name: 'Chenin Blanc', group: 'wine', ingredient: wine('Chenin Blanc', 173195, 80.0, 9.6, 29.5), amount: 150, example: 'USDA style estimate', approximateAbv: true },
  { id: 'wine-gewurztraminer', name: 'Gewürztraminer', group: 'wine', ingredient: wine('Gewürztraminer', 174843, 81.0, 10.1, 29.5), amount: 150, example: 'USDA style estimate', approximateAbv: true },
  { id: 'wine-muscat', name: 'Muscat', group: 'wine', ingredient: wine('Muscat', 174849, 82.0, 8.8, 30), amount: 150, example: 'USDA style estimate', approximateAbv: true },
  { id: 'wine-semillon', name: 'Sémillon', group: 'wine', ingredient: wine('Sémillon', 174845, 82.0, 10.1, 29.5), amount: 150, example: 'USDA style estimate', approximateAbv: true },
  { id: 'wine-rose', name: 'Rosé', group: 'wine', ingredient: wine('Rosé', 171908, 83.0, 9.6, 30.3), amount: 150, example: 'USDA style estimate', approximateAbv: true },
  { id: 'wine-late-harvest', name: 'Late-harvest white', group: 'wine', ingredient: wine('Late-harvest white', 173202, 112.0, 8.5, 30.8), amount: 150, example: 'USDA style estimate', approximateAbv: true },
  { id: 'wine-dessert-sweet', name: 'Sweet dessert wine', group: 'wine', ingredient: wine('Sweet dessert wine', 173176, 160.0, 15.3, 29.5), amount: 150, example: 'USDA style estimate', approximateAbv: true },
  { id: 'wine-dessert-dry', name: 'Dry dessert wine', group: 'wine', ingredient: wine('Dry dessert wine', 175112, 152.0, 15.3, 29.5), amount: 150, example: 'USDA style estimate', approximateAbv: true },
  { id: 'wine-light', name: 'Light wine', group: 'wine', ingredient: wine('Light wine', 169071, 49.0, 6.4, 29.5), amount: 150, example: 'USDA style estimate', approximateAbv: true },
  { id: 'wine-brut-nature', name: 'Sparkling · brut nature', group: 'wine', ingredient: sparkling('Sparkling · brut nature', 68), amount: 150, example: 'Wine-sector style estimate', approximateAbv: true },
  { id: 'wine-extra-brut', name: 'Sparkling · extra brut', group: 'wine', ingredient: sparkling('Sparkling · extra brut', 68), amount: 150, example: 'Wine-sector style estimate', approximateAbv: true },
  { id: 'wine-brut', name: 'Sparkling · brut', group: 'wine', ingredient: sparkling('Sparkling · brut', 70), amount: 150, example: 'Wine-sector style estimate', approximateAbv: true },
  { id: 'wine-extra-dry', name: 'Sparkling · extra dry', group: 'wine', ingredient: sparkling('Sparkling · extra dry', 73), amount: 150, example: 'Wine-sector style estimate', approximateAbv: true },
  { id: 'wine-dry', name: 'Sparkling · dry', group: 'wine', ingredient: sparkling('Sparkling · dry', 77), amount: 150, example: 'Wine-sector style estimate', approximateAbv: true },
  { id: 'wine-demi-sec', name: 'Sparkling · demi-sec', group: 'wine', ingredient: sparkling('Sparkling · demi-sec', 84), amount: 150, example: 'Wine-sector style estimate', approximateAbv: true },
  { id: 'wine-sweet', name: 'Sparkling · sweet', group: 'wine', ingredient: sparkling('Sparkling · sweet', 92), amount: 150, example: 'Wine-sector style estimate', approximateAbv: true },
];
for (const profile of servingProfiles) energyIngredients['profile-' + profile.id] = profile.ingredient;
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
  ...servingProfiles.map((profile): CalorieDrink => ({ id: profile.id, name: profile.name, group: profile.group, serving: `${profile.amount} ml · ${profile.approximateAbv ? '~' : ''}${Number(profile.ingredient.abv.toFixed(1))}%`, parts: [['profile-' + profile.id, profile.amount]], note: profile.example })),
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

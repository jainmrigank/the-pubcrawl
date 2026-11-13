import atlas from '../../generated/bar_atlas.json';
import { norm } from '../../../shared/catalog-engine';
export const catalogue = atlas.catalogue;
export const hasCatalogueDrink = (name: string) =>
  catalogue.recipes.some((recipe) => norm(recipe.name).includes(norm(name)));
export const facts = atlas.facts;
export const sources: Record<
  string,
  { title: string; publisher: string; url: string; period?: string }
> = atlas.sources;
export const palette = [
  'var(--atlas-orange)',
  'var(--atlas-teal)',
  'var(--atlas-plum)',
  'var(--atlas-gold)',
  'var(--atlas-blue)',
  'var(--atlas-rose)',
  'var(--atlas-olive)',
];
export const chapters = [
  {
    name: 'The drinking world',
    short: 'World',
    note: 'Change the denominator. Change the story.',
  },
  {
    name: 'Bottle architecture',
    short: 'Recipes',
    note: 'A few ingredients. A lot of possibilities.',
  },
  {
    name: 'A little bar science',
    short: 'Science',
    note: 'Adjust something. See what follows.',
  },
  {
    name: 'The cultural aftertaste',
    short: 'Culture',
    note: 'Every glass has a backstory.',
  },
];
export type Story = {
  id: string;
  title: string;
  dek: string;
  type: string;
  facts: string[];
  method: string;
  extraSources?: { title: string; url: string }[];
};
export const stories: Story[] = [
  {
    id: 'beer',
    title: 'Big country. Bigger thirst?',
    dek: 'China leads the total. The Czech Republic leads per person. A denominator can change the entire cast.',
    type: 'Reordering bar chart',
    facts: ['F001', 'F002', 'F003', 'F004', 'F005'],
    method:
      'Top ten countries in each of Kirin’s 2024 tables. Total volume is converted from thousand kilolitres to billion litres. Per capita uses total population, including non-drinkers; it is not consumption per drinker. The two lists contain different countries.',
  },
  {
    id: 'scotch',
    title: 'Two ways to top the bar.',
    dek: 'India buys the most volume. The United States generates the most export value. Follow the same markets through both lists.',
    type: 'Linked rank slopes',
    facts: ['F010', 'F011', 'F012'],
    method:
      '2025 SWA / HMRC data, revised March 2026. Lines connect seven markets appearing in both published top tens. All top-ten entries remain visible; an unconnected entry has no value in the other top-ten list. 70 cl bottle equivalents are a volume unit; export value is not retail price.',
  },
  {
    id: 'wine',
    title: 'More wine. A smaller round.',
    dek: 'Production edged up. Consumption and trade went the other way. These are four different measures of the same unsettled year.',
    type: 'Diverging change plot',
    facts: ['F006', 'F007', 'F008', 'F009'],
    method:
      'OIV 2025 estimates, released May 2026. Changes are percentages against 2024; absolute values retain their own units. These are production, consumption and trade measures, not four additive slices of a whole.',
  },
  {
    id: 'drinkers',
    title: 'The room is changing.',
    dek: 'In Gallup’s U.S. surveys, the share of adults saying they drink fell eight percentage points in two years.',
    type: 'Interactive unit chart',
    facts: ['F013'],
    method:
      'Gallup U.S. adults, 2023–2025. Each dot represents one percentage point, not one survey respondent. Separate survey samples; this does not follow the same individuals. The difference is eight percentage points, or about a 12.9% relative decrease.',
  },
  {
    id: 'rankings',
    title: 'Still ordering the usual?',
    dek: 'The Negroni holds its ground. Below it, the order shifts. Trace five familiar names across three annual surveys.',
    type: 'Bump chart',
    facts: ['F015', 'F016'],
    method:
      'Five selected cocktails, not the entire ranking. Drinks International surveys a changing panel of 100 award-winning bars. Rank is ordinal; gaps do not measure sales volume or worldwide popularity.',
    extraSources: [2024, 2025, 2026].map((year) => ({
      title: `Drinks International ${year}`,
      url: `https://drinksint.com/the-bestselling-classic-cocktails-at-the-worlds-best-bars-${year}/`,
    })),
  },
  {
    id: 'dna',
    title: 'Same shelf. Different intentions.',
    dek: 'A drink is a set of proportions. Switch from millilitres to shares and see which structures rhyme.',
    type: 'Recipe fingerprints',
    facts: ['F069', 'F071', 'F072', 'F073', 'F075', 'F076'],
    method:
      'IBA specifications for seven fully measured recipes. Linear segments encode liquid quantities before ice and dilution. Ingredient families are editorial groupings. Glass drawings are illustrative; garnish is not part of the measured total.',
  },
  {
    id: 'constellation',
    title: 'The bottle knows people.',
    dek: 'Pick an ingredient. See the recipes it brings to the party, and the ingredients that keep it company.',
    type: 'Radial ingredient network',
    facts: [],
    method:
      'Computed from the app catalogue. Exact ingredient names are trimmed and lowercased; variants such as gin and dry gin remain separate. A recipe counts once per ingredient. Up to 16 related ingredients and 8 recipe links are shown; counts use all 691 recipes. Lines encode co-occurrence, not flavour compatibility.',
  },
  {
    id: 'pairings',
    title: 'Who keeps whose company?',
    dek: 'Raw counts favour the regulars. Shared-recipe similarity finds the closer relationships. Try both.',
    type: 'Co-occurrence matrix',
    facts: [],
    method:
      'The 12 most frequent exact normalized ingredient names. Count = recipes containing both. Similarity = intersection / union (Jaccard); it is not a recommendation score. Self-pairs show the ingredient’s total recipe count. Every cell can be selected with a button or the row/column controls.',
  },
  {
    id: 'pantry',
    title: 'Just one more bottle.',
    dek: 'Build a little imaginary shelf. Find what is complete, what is close, and which next ingredient opens the most doors.',
    type: 'Live recipe universe',
    facts: [],
    method:
      'Local sandbox; it does not alter Your Shelf. Every listed ingredient is required for this analysis, including garnishes, optional items and staples. Quantities and equipment are not checked. Exact names are not substituted. “One away” means one distinct catalogue ingredient is missing.',
  },
  {
    id: 'flows',
    title: 'From mood to glass.',
    dek: 'Follow the recipes from their catalogue mood into the vessel that holds them. A highball has more than one personality.',
    type: 'Weighted alluvial diagram',
    facts: [],
    method:
      'All 691 recipes, using the app’s existing vibe labels. Glass labels are trimmed and case-normalized; the six most common vessels are shown separately, all others grouped. Ribbon thickness equals recipe count; the same ordering and linear scale are used on both sides. Editorial vibes are not measured sensory scores.',
  },
  {
    id: 'dilution',
    title: 'Water changes the terms.',
    dek: 'The alcohol stays. The concentration moves. Give a model Negroni a little meltwater.',
    type: 'Interactive dilution curve',
    facts: ['F104', 'F113'],
    method:
      'Illustrative 30/30/30 ml Negroni, using gin 40%, Campari 25% and sweet vermouth 16% ABV. Pure ethanol = 24.3 ml. ABV = 24.3 / (90 + water) × 100. Assumes additive liquid volumes, ignoring contraction and temperature. This is not a measured serving strength.',
  },
  {
    id: 'units',
    title: 'A glass is not a unit.',
    dek: 'Different glasses can carry similar amounts of alcohol. Different countries count that alcohol differently.',
    type: 'Linked measure calculator',
    facts: ['F101', 'F102', 'F103'],
    method:
      'UK units = volume in ml × ABV / 1,000. NHS equates 10 ml ethanol to about 8 g; this approximate mass equivalence is used for comparison with the U.S. 14 g standard drink. This is an alcohol-content calculator, not a safe-consumption target or driving estimate.',
  },
  {
    id: 'sugar',
    title: 'Extra dry. Plot twist.',
    dek: 'Extra Dry is sweeter than Brut. Follow the sugar scale instead of the adjective.',
    type: 'Overlapping interval plot',
    facts: ['F043'],
    method:
      'Champagne sugar categories in g/L, from Comité Champagne. The categories overlap; numerical eligibility alone does not determine the label. Brut Nature additionally requires no added sugar. Doux extends above 50 g/L; the chart is displayed only to 60. Endpoints follow the source’s stated ranges.',
    extraSources: [
      {
        title: 'Comité Champagne: dosage',
        url: 'https://www.champagne.fr/en/about-champagne/how-champagne-is-made/dosage',
      },
      {
        title: 'Comité Champagne: labelling reference',
        url: 'https://www.champagne.fr/system/files/2022-06/champagne_francais.pdf',
      },
    ],
  },
  {
    id: 'ages',
    title: 'Age is a floor.',
    dek: 'The same number on different bottles can mean very different rules. Compare minimum maturation periods, one family at a time.',
    type: 'Faceted age ladder',
    facts: ['F033', 'F037', 'F039', 'F040', 'F135'],
    method:
      'Selected minimum maturation periods, not a ranking of quality. Scotch ≥3 years; straight bourbon ≥2 years; aged tequila categories 2 / 12 / 36 months; Cognac designations 2 / 4 / 10 / 14 years. Japanese whisky reference is the JSLMA industry standard, not a national statute. Other production requirements are omitted here.',
  },
  {
    id: 'blend',
    title: 'The youngest gets the name.',
    dek: 'Give three hypothetical casks a share of the blend. The weighted average can rise while the age statement stays put.',
    type: 'Interactive blend model',
    facts: ['F035'],
    method:
      'Illustrative Scotch blend of 8-, 12- and 20-year-old whiskies. Any positive amount participates. The age statement is limited by the youngest whisky, not the weighted mean. Shares are normalized from the relative parts selected. No commercial blend is represented.',
  },
  {
    id: 'history',
    title: 'We’ve been at this a while.',
    dek: 'Archaeological traces, printed recipes and changing customs. Zoom into the recent centuries to find a different kind of history.',
    type: 'Zoomable historical timeline',
    facts: [
      'F047',
      'F048',
      'F049',
      'F050',
      'F051',
      'F052',
      'F053',
      'F054',
      'F055',
      'F056',
      'F057',
      'F058',
      'F059',
      'F118',
      'F124',
      'F126',
      'F137',
      'F159',
      'F160',
      'F167',
    ],
    method:
      'Selected dated events from the research. Ancient dates are approximate ranges; the placement of a range uses its midpoint. “About 13,000 years old” at Raqefet is shown around 11,000 BCE. Evidence of a drink is not proof of its invention. Modern mode is 1500–2026 on a linear scale; deep-time mode uses a linear BCE/CE scale with no year-zero precision claim.',
  },
  {
    id: 'screen',
    title: 'Seen this somewhere?',
    dek: 'A novel, a scene, a glass that outlives the credits. Follow the drinks through their documented cultural appearances.',
    type: 'Culture-to-cocktail network',
    facts: [
      'F083',
      'F084',
      'F085',
      'F086',
      'F087',
      'F089',
      'F092',
      'F145',
      'F147',
    ],
    method:
      'Dates denote releases of the named works, not the first appearance or invention of a drink. The Vesper connects the 1953 novel with the 2006 film. Sideways is a wine association, not a cocktail cameo. The song connection is its lyric, not the writer’s drinking preference. Sources document different kinds of association; no audience or sales impact is inferred.',
  },
  {
    id: 'agave',
    title: 'Leave some for the night shift.',
    dek: 'Flowering agaves feed nectar-loving bats. The Bat Friendly project asks participating producers to let at least five per cent flower.',
    type: 'Flowering-field model',
    facts: ['F141', 'F138'],
    method:
      '100 plant symbols represent percentages, not a surveyed field. The project’s minimum is 5%; higher slider values are hypothetical scenarios for a 1,000-plant field. No yield, bat population or biodiversity effect is estimated. Sotol is Dasylirion, not agave; not every Mexican spirit belongs in this picture.',
  },
  {
    id: 'chemistry',
    title: 'A little chemistry. A lot of character.',
    dek: 'Pepper, banana, smoke, a milky cloud. Explore the compounds and processes behind familiar bar phenomena.',
    type: 'Sensory relationship diagram',
    facts: [
      'F020',
      'F021',
      'F022',
      'F023',
      'F025',
      'F026',
      'F027',
      'F128',
      'F129',
      'F132',
      'F133',
      'F151',
    ],
    method:
      'A qualitative relationship diagram; position and line thickness do not encode concentration, intensity or similarity. Conditions and study limits remain in the selected note. Compound names are labels, not molecular-structure drawings. Not all listed effects are aromas.',
  },
  {
    id: 'bottles',
    title: 'Same wine. Different entrance.',
    dek: 'A Magnum doubles the standard bottle. A Mathusalem makes eight. Change the pour and count the glasses.',
    type: 'Volume unit chart',
    facts: ['F156'],
    method:
      'Champagne formats: standard 0.75 L, Magnum 1.5 L, Jeroboam 3 L, Mathusalem 6 L. Each 750 ml unit is one standard bottle. Drawings are illustrative, not scaled bottle dimensions. Full pours are floor(volume / serving size); any remainder is shown. No spill or foam allowance.',
  },
];
export const beerTotal: [string, number][] = [
  ['China', 40.534],
  ['United States', 22.34],
  ['Brazil', 15.304],
  ['Mexico', 10.787],
  ['Russia', 9.512],
  ['Germany', 7.236],
  ['South Africa', 4.586],
  ['Vietnam', 4.577],
  ['United Kingdom', 4.509],
  ['Spain', 4.362],
];
export const beerPerson: [string, number][] = [
  ['Czech Republic', 148.8],
  ['Lithuania', 110.6],
  ['Austria', 104.6],
  ['Ireland', 99.0],
  ['Croatia', 95.1],
  ['Estonia', 93.2],
  ['Spain', 91.8],
  ['Slovenia', 88.4],
  ['Romania', 87.4],
  ['Germany', 86.9],
];
export const scotchValue: [string, number][] = [
  ['United States', 933],
  ['France', 404],
  ['India', 286],
  ['Singapore', 274],
  ['Turkey', 255],
  ['Taiwan', 233],
  ['Spain', 208],
  ['Germany', 177],
  ['China', 161],
  ['UAE', 155],
];
export const scotchVolume: [string, number][] = [
  ['India', 220],
  ['France', 152],
  ['United States', 120],
  ['Germany', 59],
  ['Brazil', 54],
  ['Japan', 54],
  ['Spain', 54],
  ['Turkey', 53],
  ['Poland', 43],
  ['China', 34],
];
export const dna = [
  {
    name: 'Negroni',
    source: 'negroni',
    parts: [
      ['Gin', 30, 0],
      ['Campari', 30, 1],
      ['Sweet vermouth', 30, 2],
    ],
    finish: 'Orange · ice',
  },
  {
    name: 'Spritz',
    source: 'spritz',
    parts: [
      ['Prosecco', 90, 2],
      ['Aperol', 60, 1],
      ['Soda', 30, 4],
    ],
    finish: 'Orange · ice',
  },
  {
    name: 'Margarita',
    source: 'margarita',
    parts: [
      ['Tequila', 50, 0],
      ['Triple sec', 20, 3],
      ['Lime juice', 15, 5],
    ],
    finish: 'Optional salt · ice',
  },
  {
    name: 'Cosmopolitan',
    source: 'cosmopolitan',
    parts: [
      ['Citron vodka', 40, 0],
      ['Cointreau', 15, 3],
      ['Lime juice', 15, 5],
      ['Cranberry juice', 30, 6],
    ],
    finish: 'Lemon twist · ice',
  },
  {
    name: 'Paper Plane',
    source: 'paper-plane',
    parts: [
      ['Bourbon', 30, 0],
      ['Amaro Nonino', 30, 1],
      ['Aperol', 30, 1],
      ['Lemon juice', 30, 5],
    ],
    finish: 'No garnish · ice',
  },
  {
    name: 'Naked and Famous',
    source: 'naked-and-famous',
    parts: [
      ['Mezcal', 22.5, 0],
      ['Yellow Chartreuse', 22.5, 3],
      ['Aperol', 22.5, 1],
      ['Lime juice', 22.5, 5],
    ],
    finish: 'No garnish · ice',
  },
  {
    name: 'Hemingway Special',
    source: 'hemingway-special',
    parts: [
      ['Rum', 60, 0],
      ['Grapefruit juice', 40, 6],
      ['Maraschino', 15, 3],
      ['Lime juice', 15, 5],
    ],
    finish: 'No garnish · ice',
  },
] as {
  name: string;
  source: string;
  parts: [string, number, number][];
  finish: string;
}[];
export const ingredientFamilies = [
  'Base spirit',
  'Bitter / amaro',
  'Wine / vermouth',
  'Other liqueur',
  'Soda',
  'Citrus',
  'Other juice',
];
export const history = [
  {
    date: -11000,
    label: 'c. 11,000 BCE',
    name: 'Raqefet brewing traces',
    id: 'F047',
  },
  {
    date: -6500,
    label: '7th millennium BCE',
    name: 'Jiahu fermented mixture',
    id: 'F048',
  },
  {
    date: -5900,
    label: '6000–5800 BCE',
    name: 'Wine traces in Georgia',
    id: 'F049',
  },
  {
    date: -3050,
    label: '3100–3000 BCE',
    name: 'Beer ration tablet',
    id: 'F050',
  },
  { date: 1516, label: '1516', name: 'Bavaria’s beer decree', id: 'F137' },
  { date: 1740, label: '1740', name: 'The naval grog order', id: 'F055' },
  { date: 1751, label: '1751', name: 'Gin Lane & Beer Street', id: 'F057' },
  { date: 1759, label: '1759', name: 'Guinness signs its lease', id: 'F058' },
  { date: 1763, label: '1763', name: 'Franklin’s milk punch', id: 'F053' },
  { date: 1799, label: '1799', name: 'Washington’s distillery', id: 'F124' },
  { date: 1806, label: '1806', name: 'Cocktail, defined in print', id: 'F051' },
  { date: 1807, label: '1807', name: 'The Basi Revolt', id: 'F167' },
  { date: 1862, label: '1862', name: 'Jerry Thomas’s guide', id: 'F052' },
  { date: 1916, label: '1916', name: 'The Last Word on a menu', id: 'F160' },
  { date: 1920, label: '1920–1933', name: 'U.S. Prohibition', id: 'F056' },
  { date: 1935, label: '1935', name: 'Commercial canned beer', id: 'F126' },
  { date: 1955, label: '1955', name: 'Guinness record book', id: 'F059' },
  { date: 1970, label: '1970', name: 'Black Tot Day', id: 'F054' },
  {
    date: 2016,
    label: '2016',
    name: 'A 133-year-old beer’s yeast',
    id: 'F118',
  },
  {
    date: 2024,
    label: '2024 paper',
    name: 'Liquid wine in a Roman urn',
    id: 'F159',
  },
];
export const screen = [
  {
    year: 1925,
    work: 'The Great Gatsby',
    drink: 'Mint Julep',
    kind: 'Novel',
    id: 'F087',
  },
  {
    year: 1934,
    work: 'The Thin Man',
    drink: 'Martini',
    kind: 'Film',
    id: 'F145',
  },
  {
    year: 1942,
    work: 'Casablanca',
    drink: 'French 75',
    kind: 'Film',
    id: 'F083',
  },
  {
    year: 1953,
    work: 'Casino Royale',
    drink: 'Vesper',
    kind: 'Novel',
    id: 'F089',
  },
  {
    year: 1959,
    work: 'Some Like It Hot',
    drink: 'Manhattan',
    kind: 'Film',
    id: 'F085',
  },
  {
    year: 1959,
    work: 'North by Northwest',
    drink: 'Gibson',
    kind: 'Film',
    id: 'F086',
  },
  {
    year: 1979,
    work: 'Escape',
    drink: 'Piña Colada',
    kind: 'Song',
    id: 'F092',
  },
  {
    year: 1998,
    work: 'The Big Lebowski',
    drink: 'White Russian',
    kind: 'Film',
    id: 'F084',
  },
  {
    year: 2004,
    work: 'Sideways',
    drink: 'Pinot Noir',
    kind: 'Film',
    id: 'F147',
  },
  {
    year: 2006,
    work: 'Casino Royale',
    drink: 'Vesper',
    kind: 'Film',
    id: 'F089',
  },
];
export const chemistry = [
  { name: 'Rotundone', sense: 'Pepper', where: 'Red wine', id: 'F026' },
  { name: 'Isoamyl acetate', sense: 'Banana', where: 'Some beers', id: 'F132' },
  {
    name: '4-vinyl guaiacol',
    sense: 'Clove',
    where: 'Some wheat beers',
    id: 'F132',
  },
  { name: 'Anethole', sense: 'Milky cloud', where: 'Diluted ouzo', id: 'F022' },
  {
    name: 'Guaiacol',
    sense: 'Smoky aroma',
    where: 'Whisky models',
    id: 'F023',
  },
  {
    name: 'Quinine',
    sense: 'Blue fluorescence',
    where: 'Tonic under UV',
    id: 'F021',
  },
  { name: 'TCA', sense: 'Cork taint', where: 'Wine', id: 'F027' },
  {
    name: 'Casein',
    sense: 'Curd clarification',
    where: 'Milk punch',
    id: 'F129',
  },
  { name: 'Tartrates', sense: 'Crystals', where: 'Wine', id: 'F128' },
  {
    name: 'Brettanomyces',
    sense: 'Funk',
    where: 'Some beer & wine',
    id: 'F133',
  },
];

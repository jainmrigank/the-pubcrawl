/**
 * Generates data/indian_cocktails.json: Indian cocktails built on real regional
 * flavours, in classic structures that actually suit them.
 *
 * The previous version crossed every flavour with every structure and sliced the
 * result at 100. That produced drinks nobody would order (coffee, lime and ginger
 * beer), drinks whose flavour was missing from the glass entirely (a "Masala Chai
 * Sour" that was a plain Whisky Sour), and Martinis made with rum. Three rules
 * prevent all of that now:
 *
 *   1. Every flavour has a signature ingredient, and it is always in the glass.
 *      Nothing is described as tasting of something it does not contain.
 *   2. Each flavour lists only the structures that suit it. There is no
 *      Coffee Spritz, because a Coffee Spritz is not a drink.
 *   3. Instructions are written from the finished ingredient list, so they
 *      cannot claim an ingredient that isn't there.
 *
 * Ingredients are limited to things you can actually buy in India. Bael, sea
 * buckthorn and custard apple were dropped for that reason.
 *
 * Ids are x-in-NNN so they merge as house drinks. Videos and images are attached
 * later by scripts/fetch_videos.mjs and scripts/fetch_images.mjs.
 *
 * Run: node scripts/build_indian_cocktails.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * A flavour is an Indian ingredient, the spirit it belongs with, and the short
 * list of structures it works in. `role` tells a structure which slot the
 * signature fills: the sour, the sweetener, the base spirit, or an aromatic
 * that gets muddled.
 */
const FLAVOURS = [
  {
    key: 'Kokum', spirit: 'Gin', region: 'Konkan', vibe: 'refreshing',
    signature: { name: 'Kokum Syrup', role: 'sour' },
    note: 'the tart magenta fruit the Konkan coast cools itself with',
    templates: ['Sour', 'Highball', 'Spritz'],
  },
  {
    key: 'Gondhoraj', spirit: 'Gin', region: 'Kolkata', vibe: 'refreshing',
    signature: { name: 'Gondhoraj Lime', role: 'sour' },
    note: "Bengal's wildly fragrant lime, closer to a lime leaf than a lime",
    templates: ['Collins', 'Highball', 'Sour'],
  },
  {
    key: 'Imli', spirit: 'Dark Rum', region: 'North India', vibe: 'boozy',
    signature: { name: 'Tamarind Syrup', role: 'sour' },
    note: 'sweet-sour imli, the backbone of every plate of chaat',
    templates: ['Sour', 'Old Fashioned', 'Sling'],
  },
  {
    key: 'Khus', spirit: 'Vodka', region: 'North India', vibe: 'refreshing',
    signature: { name: 'Khus Syrup', role: 'sweet' },
    note: 'cooling vetiver root, the green sharbat of North Indian summers',
    templates: ['Highball', 'Collins', 'Spritz'],
  },
  {
    key: 'Rose Thandai', spirit: 'Brandy', region: 'North India', vibe: 'sweet',
    signature: { name: 'Thandai Syrup', role: 'sweet' },
    note: 'the almond, saffron and rose milk poured at Holi',
    templates: ['Flip', 'Old Fashioned'],
  },
  {
    key: 'Filter Coffee', spirit: 'Dark Rum', region: 'South India', vibe: 'sweet',
    signature: { name: 'Filter Coffee', role: 'sweet' },
    note: 'South Indian filter kaapi, pulled strong and bitter',
    templates: ['Old Fashioned', 'Flip'],
  },
  {
    key: 'Jamun', spirit: 'Gin', region: 'North India', vibe: 'refreshing',
    signature: { name: 'Jamun Syrup', role: 'sweet' },
    note: 'the astringent purple berry that arrives with the monsoon',
    templates: ['Sour', 'Collins', 'Spritz'],
  },
  {
    key: 'Aam Papad', spirit: 'White Rum', region: 'North India', vibe: 'tropical',
    signature: { name: 'Aam Papad', role: 'sweet' },
    note: 'sun-dried mango leather, melted down into a thick sweet-sour syrup',
    templates: ['Sour', 'Sling'],
  },
  {
    key: 'Paan', spirit: 'Vodka', region: 'North India', vibe: 'sweet',
    signature: { name: 'Gulkand Syrup', role: 'sweet' },
    note: 'gulkand and betel leaf, the after-dinner paan in a glass',
    templates: ['Martini', 'Fizz'],
  },
  {
    key: 'Masala Chai', spirit: 'Whisky', region: 'Pan-India', vibe: 'cozy',
    signature: { name: 'Masala Chai', role: 'sweet' },
    note: 'cutting chai brewed triple strength, ginger and cardamom and all',
    // no Toddy here: extra_cocktails.json already has a hand-written
    // Masala Chai Toddy, and it is the better version
    templates: ['Old Fashioned', 'Flip', 'Sour'],
  },
  {
    key: 'Guava Chilli', spirit: 'Tequila', region: 'Pan-India', vibe: 'tropical',
    signature: { name: 'Guava Puree', role: 'sweet' },
    extra: { name: 'Chaat Masala', measure: '1 pinch' },
    note: 'street guava under a heavy dusting of chilli and black salt',
    templates: ['Sour', 'Sling', 'Highball'],
  },
  {
    key: 'Kala Khatta', spirit: 'Vodka', region: 'Mumbai', vibe: 'party',
    signature: { name: 'Kala Khatta Syrup', role: 'sweet' },
    note: 'the black-salt jamun syrup off a Chowpatty gola cart',
    templates: ['Highball', 'Sling', 'Spritz'],
  },
  {
    key: 'Feni', spirit: 'Feni', region: 'Goa', vibe: 'boozy',
    signature: { name: 'Feni', role: 'spirit' },
    note: "Goa's cashew spirit, funky and unapologetic",
    templates: ['Sour', 'Highball', 'Collins'],
  },
  {
    key: 'Tender Coconut', spirit: 'White Rum', region: 'Coastal', vibe: 'tropical',
    signature: { name: 'Coconut Water', role: 'sweet' },
    note: 'nariyal pani straight off the roadside cart',
    templates: ['Highball', 'Sling'],
  },
  {
    key: 'Ginger Honey', spirit: 'Whisky', region: 'Pan-India', vibe: 'cozy',
    signature: { name: 'Ginger', role: 'aromatic', unit: 'slices' },
    sweetener: 'Honey', // the shahad has to be in every one of them
    note: 'adrak and shahad, the cold remedy every Indian mother swears by',
    templates: ['Toddy', 'Mule', 'Sour'],
  },
  {
    key: 'Saffron', spirit: 'Gin', region: 'Kashmir', vibe: 'boozy',
    signature: { name: 'Saffron Syrup', role: 'sweet' },
    note: 'Kashmiri kesar, a pinch of which colours the whole glass',
    templates: ['Martini', 'Sour', 'Fizz'],
  },
  {
    key: 'Anardana', spirit: 'Vodka', region: 'North India', vibe: 'refreshing',
    signature: { name: 'Pomegranate Juice', role: 'sour' },
    note: 'tart anar, pressed rather than sweetened',
    templates: ['Collins', 'Spritz', 'Sour'],
  },
  {
    key: 'Curry Leaf', spirit: 'Gin', region: 'South India', vibe: 'refreshing',
    signature: { name: 'Curry Leaves', role: 'aromatic' },
    note: 'kadi patta, slapped once to wake it up before it goes in',
    templates: ['Martini', 'Sour', 'Highball'],
  },
  {
    key: 'Tulsi', spirit: 'Gin', region: 'Pan-India', vibe: 'refreshing',
    signature: { name: 'Tulsi', role: 'aromatic' },
    note: 'holy basil, off the pot outside every front door',
    templates: ['Collins', 'Sour', 'Highball'],
  },
  {
    key: 'Jaggery', spirit: 'Dark Rum', region: 'Pan-India', vibe: 'boozy',
    signature: { name: 'Jaggery Syrup', role: 'sweet' },
    note: 'unrefined gur, all molasses and smoke',
    templates: ['Old Fashioned', 'Sour', 'Mule'],
  },
  {
    key: 'Cardamom', spirit: 'Gin', region: 'Kerala', vibe: 'boozy',
    signature: { name: 'Cardamom Syrup', role: 'sweet' },
    note: 'green elaichi off the Kerala hills',
    templates: ['Old Fashioned', 'Sour', 'Collins'],
  },
];

/** the citrus a flavour prefers when the structure needs one and the signature is not itself the sour */
const citrusOf = (f) => (['Tequila', 'Dark Rum', 'White Rum'].includes(f.spirit) ? 'Lime Juice' : 'Lemon Juice');

const lower = (s) => s.toLowerCase();

/** a flavour can name its own sweetener, so "Ginger Honey" is never just ginger */
const sweetOf = (f) => f.sweetener || 'Sugar Syrup';

/** leaves are counted in leaves, root is counted in slices */
const aroma = (f, leaves) => (f.signature.unit === 'slices' ? '3 slices' : `${leaves} leaves`);

/**
 * Every structure receives the flavour and must place its signature ingredient.
 * `spirits` restricts a structure to bases it genuinely belongs on: a Martini
 * made with rum is not a Martini, whatever the menu calls it.
 */
const TEMPLATES = {
  Sour: {
    glass: 'Coupe',
    build: (f) => {
      const ings = [[f.spirit, '60 ml']];
      if (f.signature.role === 'sour') ings.push([f.signature.name, '25 ml'], [sweetOf(f), '15 ml']);
      else if (f.signature.role === 'aromatic') ings.push([citrusOf(f), '25 ml'], [sweetOf(f), '20 ml'], [f.signature.name, aroma(f, 6)]);
      else if (f.signature.role === 'spirit') ings.push([citrusOf(f), '25 ml'], [sweetOf(f), '20 ml']);
      else ings.push([citrusOf(f), '25 ml'], [f.signature.name, '20 ml']);
      ings.push(['Egg White', '1']);
      return ings;
    },
    how: (f) =>
      `${f.signature.role === 'aromatic' ? `Muddle the ${lower(f.signature.name)} in the shaker first, then add everything else. ` : ''}Dry shake without ice to build the foam, then shake again hard with ice. Double strain into a chilled coupe.`,
  },

  Highball: {
    glass: 'Highball glass',
    build: (f) => {
      const ings = [[f.spirit, '45 ml']];
      if (f.signature.role === 'aromatic') ings.push([f.signature.name, aroma(f, 8)], ['Lime Juice', '15 ml']);
      else if (f.signature.role !== 'spirit') ings.push([f.signature.name, '25 ml']);
      else ings.push(['Lime Juice', '15 ml']);
      ings.push(['Soda Water', 'top up']);
      return ings;
    },
    how: (f) =>
      `Fill a tall glass with ice, add ${lower(f.spirit)}${f.signature.role === 'spirit' ? ' and lime' : ` and ${lower(f.signature.name)}`}, top with cold soda and stir once.`,
  },

  Collins: {
    glass: 'Collins glass',
    build: (f) => {
      const ings = [[f.spirit, '45 ml']];
      if (f.signature.role === 'sour') ings.push([f.signature.name, '25 ml'], [sweetOf(f), '15 ml']);
      else if (f.signature.role === 'aromatic') ings.push([citrusOf(f), '25 ml'], [sweetOf(f), '15 ml'], [f.signature.name, aroma(f, 8)]);
      else if (f.signature.role === 'spirit') ings.push([citrusOf(f), '25 ml'], [sweetOf(f), '15 ml']);
      else ings.push([citrusOf(f), '25 ml'], [f.signature.name, '15 ml']);
      ings.push(['Soda Water', 'top up']);
      return ings;
    },
    how: () => `Shake everything but the soda with ice, strain into an ice-filled collins glass and lengthen with soda.`,
  },

  Fizz: {
    glass: 'Highball glass',
    build: (f) => {
      const ings = [[f.spirit, '45 ml']];
      if (f.signature.role === 'sour') ings.push([f.signature.name, '25 ml'], [sweetOf(f), '15 ml']);
      else ings.push([citrusOf(f), '20 ml'], [f.signature.name, '20 ml']);
      ings.push(['Egg White', '1'], ['Soda Water', 'splash']);
      return ings;
    },
    how: () => `Dry shake everything but the soda, then shake again with ice. Strain into a chilled glass and top with a splash of soda to lift the foam.`,
  },

  'Old Fashioned': {
    glass: 'Old-fashioned glass',
    build: (f) => [[f.spirit, '60 ml'], [f.signature.name, '15 ml'], ['Angostura Bitters', '2 dashes']],
    how: (f) => `Stir ${lower(f.spirit)}, ${lower(f.signature.name)} and the bitters over one large cube until cold and silky. Express an orange peel over the top.`,
  },

  Mule: {
    glass: 'Mug',
    build: (f) => {
      const ings = [[f.spirit, '50 ml'], ['Lime Juice', '15 ml']];
      ings.push([f.signature.name, f.signature.role === 'aromatic' ? aroma(f, 6) : '15 ml']);
      // an aromatic signature is not a sweetener, so the drink still needs one
      if (f.signature.role === 'aromatic') ings.push([sweetOf(f), '15 ml']);
      ings.push(['Ginger Beer', 'top up']);
      return ings;
    },
    how: (f) =>
      `${f.signature.role === 'aromatic' ? `Muddle the ${lower(f.signature.name)} in the base of a copper mug, then ` : 'In a copper mug, '}add ice, ${lower(f.spirit)} and lime, top with cold ginger beer and give it one stir.`,
  },

  Spritz: {
    glass: 'Wine glass',
    build: (f) => [[f.signature.name, '35 ml'], [f.spirit, '20 ml'], ['Prosecco', '90 ml'], ['Soda Water', 'splash']],
    how: (f) => `Fill a wine glass with ice, add ${lower(f.signature.name)} and ${lower(f.spirit)}, top with prosecco and a splash of soda, then stir gently once.`,
  },

  Sling: {
    glass: 'Hurricane glass',
    build: (f) => [[f.spirit, '45 ml'], ['Lime Juice', '20 ml'], [f.signature.name, '25 ml'], ['Soda Water', 'top up']],
    how: () => `Shake everything but the soda with ice, pour unstrained into a tall glass and lengthen with soda.`,
  },

  Martini: {
    glass: 'Martini glass',
    spirits: ['Gin', 'Vodka'], // anything else is not a Martini
    build: (f) => [
      [f.spirit, '60 ml'],
      ['Dry Vermouth', '10 ml'],
      [f.signature.name, f.signature.role === 'aromatic' ? aroma(f, 10) : '10 ml'],
    ],
    how: (f) =>
      f.signature.role === 'aromatic'
        ? `Muddle the ${lower(f.signature.name)} in the mixing glass, add ${lower(f.spirit)} and dry vermouth, stir hard over ice and double strain into a chilled martini glass.`
        : `Stir ${lower(f.spirit)}, dry vermouth and ${lower(f.signature.name)} over ice until very cold, then strain into a chilled martini glass.`,
  },

  Toddy: {
    glass: 'Mug',
    build: (f) => [
      [f.spirit, '45 ml'],
      [f.signature.name, f.signature.role === 'aromatic' ? aroma(f, 6) : '30 ml'],
      [f.sweetener || 'Honey', '15 ml'],
      ['Lemon Juice', '10 ml'],
      ['Hot Water', 'top up'],
    ],
    how: (f) => `Warm a mug, add ${lower(f.spirit)}, ${lower(f.signature.name)}, honey and lemon, then top with hot water and stir until the honey dissolves.`,
  },

  Flip: {
    glass: 'Coupe',
    build: (f) => [[f.spirit, '45 ml'], [f.signature.name, '30 ml'], [sweetOf(f), '10 ml'], ['Whole Egg', '1']],
    how: (f) => `Dry shake ${lower(f.spirit)}, ${lower(f.signature.name)}, sugar syrup and the whole egg until thick, then shake again with ice. Strain into a coupe and grate nutmeg over the top.`,
  },
};

/* ---------------------------------------------------------------- build ---- */

const drinks = [];
let n = 0;

for (const f of FLAVOURS) {
  for (const tName of f.templates) {
    const t = TEMPLATES[tName];
    if (!t) throw new Error(`${f.key}: unknown template ${tName}`);
    if (t.spirits && !t.spirits.includes(f.spirit))
      throw new Error(`${f.key}: a ${tName} is not made with ${f.spirit}`);

    const ings = t.build(f);
    if (f.extra) ings.push([f.extra.name, f.extra.measure]);

    // rule 1, enforced rather than assumed
    for (const must of [f.signature.name, f.extra?.name, f.sweetener].filter(Boolean))
      if (!ings.some(([name]) => name === must))
        throw new Error(`${f.key} ${tName}: ${must} is missing from the glass`);

    n++;
    drinks.push({
      id: `x-in-${String(n).padStart(3, '0')}`,
      name: `${f.key} ${tName}`, // the name always says what is in the glass
      category: 'Cocktail',
      alcoholic: 'Alcoholic',
      glass: t.glass,
      instructions: `${t.how(f)} ${f.note.charAt(0).toUpperCase()}${f.note.slice(1)}.`,
      thumb: '',
      video: '',
      tags: ['India', f.region, f.key],
      iba: '',
      ingredients: ings.map(([name, measure]) => ({ name, measure })),
      vibeHint: f.vibe,
    });
  }
}

writeFileSync(join(ROOT, 'data', 'indian_cocktails.json'), JSON.stringify(drinks, null, 1));
console.log(`Wrote ${drinks.length} Indian cocktails across ${FLAVOURS.length} flavours.`);

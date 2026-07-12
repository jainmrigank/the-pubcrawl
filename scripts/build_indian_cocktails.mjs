/**
 * Generates data/indian_cocktails.json: 100 Indian alcoholic cocktails, each
 * a real classic structure (sour, highball, mule, spritz, old fashioned,
 * collins, sling, negroni, fizz, martini) built on an Indian flavour system
 * (kokum, gondhoraj, imli, khus, thandai, filter coffee, jamun, aam papad,
 * paan, chai masala, etc.). Balanced measures come from the structure; the
 * regional ingredient is swapped into the right slot.
 *
 * Ids are x-in-NNN so they merge as house drinks. Videos are attached later
 * by scripts/fetch_videos.mjs / audit_videos.mjs.
 *
 * Run: node scripts/build_indian_cocktails.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---- flavour systems: an Indian ingredient + the base spirit it loves ---- */
const FLAVOURS = [
  { key: 'Kokum', spirit: 'Gin', sour: 'Kokum Syrup', note: 'the sour magenta fruit of the Konkan coast', region: 'Konkan', vibe: 'refreshing' },
  { key: 'Gondhoraj', spirit: 'Gin', sour: 'Gondhoraj Lime', note: 'Bengal\'s intensely fragrant lime', region: 'Kolkata', vibe: 'refreshing' },
  { key: 'Imli', spirit: 'Dark Rum', sour: 'Tamarind Syrup', note: 'sweet-sour tamarind', region: 'North India', vibe: 'boozy' },
  { key: 'Khus', spirit: 'Vodka', sour: 'Lime Juice', sweet: 'Khus Syrup', note: 'cooling vetiver-root syrup', region: 'North India', vibe: 'refreshing' },
  { key: 'Rose Thandai', spirit: 'Brandy', sweet: 'Thandai Syrup', note: 'the almond-saffron-rose festival milk', region: 'North India', vibe: 'sweet' },
  { key: 'Filter Coffee', spirit: 'Dark Rum', sweet: 'Coffee Liqueur', note: 'South Indian filter kaapi', region: 'South India', vibe: 'sweet' },
  { key: 'Jamun', spirit: 'Gin', sour: 'Lime Juice', sweet: 'Jamun Syrup', note: 'the astringent purple monsoon berry', region: 'North India', vibe: 'refreshing' },
  { key: 'Aam Papad', spirit: 'White Rum', sweet: 'Mango Puree', note: 'sun-dried mango leather', region: 'North India', vibe: 'tropical' },
  { key: 'Paan', spirit: 'Vodka', sweet: 'Gulkand Syrup', note: 'the betel-leaf and rose after-dinner sweet', region: 'North India', vibe: 'sweet' },
  { key: 'Masala Chai', spirit: 'Whisky', sweet: 'Honey', note: 'spiced milk tea', region: 'Pan-India', vibe: 'cozy' },
  { key: 'Nimbu', spirit: 'Gin', sour: 'Lime Juice', note: 'the everyday Indian lime of nimbu pani', region: 'Pan-India', vibe: 'refreshing' },
  { key: 'Guava Chilli', spirit: 'Tequila', sour: 'Lime Juice', sweet: 'Guava Puree', note: 'street guava dusted with chilli and salt', region: 'Pan-India', vibe: 'tropical' },
  { key: 'Kala Khatta', spirit: 'Vodka', sweet: 'Kala Khatta Syrup', note: 'the black-salt jaljeera-berry gola syrup', region: 'Mumbai', vibe: 'party' },
  { key: 'Feni', spirit: 'Feni', sour: 'Lime Juice', note: 'Goa\'s fierce cashew spirit', region: 'Goa', vibe: 'boozy' },
  { key: 'Coconut', spirit: 'White Rum', sweet: 'Coconut Cream', note: 'coastal tender coconut', region: 'Coastal', vibe: 'tropical' },
  { key: 'Ginger Honey', spirit: 'Whisky', sweet: 'Honey', sour: 'Lemon Juice', note: 'the adrak-shahad cold remedy', region: 'Pan-India', vibe: 'cozy' },
  { key: 'Saffron', spirit: 'Gin', sweet: 'Saffron Syrup', note: 'Kashmiri kesar', region: 'Kashmir', vibe: 'boozy' },
  { key: 'Pomegranate Anardana', spirit: 'Vodka', sour: 'Pomegranate Juice', note: 'tart anardana', region: 'North India', vibe: 'refreshing' },
  { key: 'Sea Buckthorn', spirit: 'Vodka', sour: 'Sea Buckthorn Juice', note: 'Ladakh\'s tart orange leh berry', region: 'Ladakh', vibe: 'refreshing' },
  { key: 'Curry Leaf', spirit: 'Gin', sour: 'Lime Juice', note: 'the aromatic South Indian leaf', region: 'South India', vibe: 'refreshing' },
  { key: 'Tulsi', spirit: 'Gin', sour: 'Lime Juice', sweet: 'Honey', note: 'holy basil', region: 'Pan-India', vibe: 'refreshing' },
  { key: 'Bael', spirit: 'White Rum', sweet: 'Bael Syrup', note: 'the woody wood-apple sherbet fruit', region: 'North India', vibe: 'tropical' },
  { key: 'Sitaphal', spirit: 'White Rum', sweet: 'Custard Apple Pulp', note: 'creamy custard apple', region: 'Deccan', vibe: 'sweet' },
  { key: 'Jaggery Rum', spirit: 'Dark Rum', sweet: 'Jaggery Syrup', note: 'unrefined cane gur', region: 'Pan-India', vibe: 'boozy' },
  { key: 'Cardamom', spirit: 'Gin', sweet: 'Cardamom Syrup', note: 'green elaichi', region: 'Kerala', vibe: 'boozy' },
];

/* ---- classic structures: measured skeletons the flavour drops into ---- */
const STRUCTS = [
  {
    name: 'Sour',
    glass: 'Coupe',
    vibe: 'refreshing',
    build: (f) => ({
      glass: 'Coupe',
      ings: [
        [f.spirit, '60 ml'],
        [f.sour || 'Lemon Juice', '25 ml'],
        [f.sweet || 'Sugar Syrup', '20 ml'],
        ['Egg White', '1'],
      ],
      how: (n) =>
        `Dry shake ${f.spirit.toLowerCase()}, ${(f.sour || 'lemon juice').toLowerCase()}, ${(f.sweet || 'sugar syrup').toLowerCase()} and egg white without ice to build the foam, then shake again hard with ice. Double strain into a chilled coupe and finish with a few drops of bitters drawn through the foam. ${n}`,
    }),
  },
  {
    name: 'Highball',
    glass: 'Highball glass',
    vibe: 'refreshing',
    build: (f) => ({
      glass: 'Highball glass',
      ings: [
        [f.spirit, '45 ml'],
        [f.sweet || f.sour || 'Lime Juice', '20 ml'],
        ['Soda Water', 'top up'],
      ],
      how: (n) =>
        `Build over plenty of ice: ${f.spirit.toLowerCase()} and ${(f.sweet || f.sour || 'lime juice').toLowerCase()}, then top with cold soda and stir once. ${n}`,
    }),
  },
  {
    name: 'Mule',
    glass: 'Mug',
    vibe: 'refreshing',
    build: (f) => ({
      glass: 'Mug',
      ings: [
        [f.spirit, '50 ml'],
        ['Lime Juice', '15 ml'],
        [f.sweet || 'Sugar Syrup', '10 ml'],
        ['Ginger Beer', 'top up'],
      ],
      how: (n) =>
        `Fill a copper mug with ice. Add ${f.spirit.toLowerCase()}, lime juice and ${(f.sweet || 'sugar syrup').toLowerCase()}, top with cold ginger beer and give it one stir. ${n}`,
    }),
  },
  {
    name: 'Old Fashioned',
    glass: 'Old-fashioned glass',
    vibe: 'boozy',
    build: (f) => ({
      glass: 'Old-fashioned glass',
      ings: [
        [f.spirit, '60 ml'],
        [f.sweet || 'Jaggery Syrup', '10 ml'],
        ['Angostura Bitters', '2 dashes'],
      ],
      how: (n) =>
        `Stir ${f.spirit.toLowerCase()}, ${(f.sweet || 'jaggery syrup').toLowerCase()} and the bitters over a large ice cube until cold and silky. Express an orange peel over the top. ${n}`,
    }),
  },
  {
    name: 'Collins',
    glass: 'Collins glass',
    vibe: 'refreshing',
    build: (f) => ({
      glass: 'Collins glass',
      ings: [
        [f.spirit, '45 ml'],
        [f.sour || 'Lemon Juice', '25 ml'],
        [f.sweet || 'Sugar Syrup', '15 ml'],
        ['Soda Water', 'top up'],
      ],
      how: (n) =>
        `Shake ${f.spirit.toLowerCase()}, ${(f.sour || 'lemon juice').toLowerCase()} and ${(f.sweet || 'sugar syrup').toLowerCase()} with ice, strain into an ice-filled collins glass and top with soda. ${n}`,
    }),
  },
  {
    name: 'Spritz',
    glass: 'Wine glass',
    vibe: 'refreshing',
    build: (f) => ({
      glass: 'Wine glass',
      ings: [
        [f.sweet || f.sour || 'Kokum Syrup', '30 ml'],
        [f.spirit, '20 ml'],
        ['Prosecco', '90 ml'],
        ['Soda Water', 'splash'],
      ],
      how: (n) =>
        `Fill a wine glass with ice. Add ${(f.sweet || f.sour || 'kokum syrup').toLowerCase()} and ${f.spirit.toLowerCase()}, top with prosecco and a splash of soda, and stir gently. ${n}`,
    }),
  },
  {
    name: 'Sling',
    glass: 'Hurricane glass',
    vibe: 'tropical',
    build: (f) => ({
      glass: 'Hurricane glass',
      ings: [
        [f.spirit, '45 ml'],
        [f.sour || 'Lime Juice', '20 ml'],
        [f.sweet || 'Mango Puree', '20 ml'],
        ['Soda Water', 'top up'],
      ],
      how: (n) =>
        `Shake ${f.spirit.toLowerCase()}, ${(f.sour || 'lime juice').toLowerCase()} and ${(f.sweet || 'mango puree').toLowerCase()} with ice, pour unstrained into a tall glass and lengthen with soda. ${n}`,
    }),
  },
  {
    name: 'Fizz',
    glass: 'Highball glass',
    vibe: 'refreshing',
    build: (f) => ({
      glass: 'Highball glass',
      ings: [
        [f.spirit, '45 ml'],
        [f.sour || 'Lemon Juice', '20 ml'],
        [f.sweet || 'Sugar Syrup', '15 ml'],
        ['Egg White', '1'],
        ['Soda Water', 'splash'],
      ],
      how: (n) =>
        `Dry shake everything but the soda, then shake with ice. Strain into a chilled glass and top with a splash of soda to lift the foam. ${n}`,
    }),
  },
  {
    name: 'Negroni',
    glass: 'Old-fashioned glass',
    vibe: 'boozy',
    build: (f) => ({
      glass: 'Old-fashioned glass',
      ings: [
        [f.spirit, '30 ml'],
        ['Campari', '30 ml'],
        ['Sweet Vermouth', '30 ml'],
        [f.sweet || f.sour || 'Kokum Syrup', '5 ml'],
      ],
      how: (n) =>
        `Stir ${f.spirit.toLowerCase()}, Campari, sweet vermouth and a barspoon of ${(f.sweet || f.sour || 'kokum syrup').toLowerCase()} over ice, strain over a fresh cube and garnish with an orange slice. ${n}`,
    }),
  },
  {
    name: 'Martini',
    glass: 'Martini glass',
    vibe: 'boozy',
    build: (f) => ({
      glass: 'Martini glass',
      ings: [
        [f.spirit, '60 ml'],
        ['Dry Vermouth', '10 ml'],
        [f.sweet || f.sour || 'Saffron Syrup', '5 ml'],
      ],
      how: (n) =>
        `Stir ${f.spirit.toLowerCase()}, dry vermouth and a barspoon of ${(f.sweet || f.sour || 'saffron syrup').toLowerCase()} over ice until very cold, then strain into a chilled martini glass. ${n}`,
    }),
  },
];

/* evocative name parts, seeded per drink for stability */
const ADJ = ['Monsoon', 'Bazaar', 'Midnight', 'Marigold', 'Deccan', 'Coastal', 'Royal', 'Smoke', 'Velvet', 'Spice Route', 'Verandah', 'Backwater', 'Havelock', 'Old City', 'Rooftop', 'Ghat', 'Chowk', 'Sundown', 'Palace', 'Bandra'];

const cap = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

const drinks = [];
let n = 0;
outer: for (const f of FLAVOURS) {
  for (const s of STRUCTS) {
    if (drinks.length >= 100) break outer;
    n++;
    const b = s.build(f);
    const name = `${cap(f.key)} ${s.name === 'Old Fashioned' ? 'Old Fashioned' : s.name}`.trim();
    const alt = `${ADJ[(n * 7) % ADJ.length]} ${f.key.split(' ')[0]}`;
    drinks.push({
      id: `x-in-${String(n).padStart(3, '0')}`,
      name: n % 3 === 0 ? alt : name,
      category: 'Cocktail',
      alcoholic: 'Alcoholic',
      glass: b.glass,
      instructions: b.how(`A ${f.region} riff built on ${f.note}.`),
      thumb: '',
      video: '',
      tags: ['India', f.region, f.key],
      iba: '',
      ingredients: b.ings.map(([name, measure]) => ({ name, measure })),
      vibeHint: f.vibe || s.vibe,
    });
  }
}

writeFileSync(join(ROOT, 'data', 'indian_cocktails.json'), JSON.stringify(drinks, null, 1));
console.log(`Wrote ${drinks.length} Indian cocktails.`);

/**
 * Offline "house mixologist" — invents a plausible cocktail from the pantry
 * when the LLM is unavailable. Randomised so repeated clicks vary the pick of
 * base spirit, modifier, template and name.
 */
import { categorise, isBoozeCategory, norm } from './catalog.mjs';
import { withVibe } from './vibes.mjs';

const FIRST = ['Velvet', 'Midnight', 'Golden', 'Smoked', 'Electric', 'Tropic', 'Crimson', 'Neon', 'Drifting', 'Silk', 'Monsoon', 'Copper', 'Paper', 'Iron', 'Quiet', 'Northern'];
const SECOND = ['Alchemy', 'Mirage', 'Ember', 'Bloom', 'Riddle', 'Lagoon', 'Halo', 'Serenade', 'Voltage', 'Fable', 'Sonata', 'Drift', 'Meridian', 'Standard', 'Archive', 'Signal'];

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

export function generateFallback(pantry, avoid = []) {
  const cats = shuffle(pantry.map((p) => ({ name: p, cat: categorise(p) })));

  const spirits = cats.filter((c) => c.cat === 'Spirit');
  const liqueurs = cats.filter((c) => c.cat === 'Liqueur' || c.cat === 'Wine & Fortified');
  const citrus = cats.filter((c) => /lemon|lime|grapefruit|yuzu|calamansi|orange/.test(norm(c.name)) && c.cat !== 'Liqueur');
  const sweet = cats.filter((c) => c.cat === 'Syrup & Sweetener');
  const mixers = cats.filter((c) => c.cat === 'Soda & Mixer' || c.cat === 'Juice');
  const herbs = cats.filter((c) => c.cat === 'Herb & Spice');
  const fruit = cats.filter((c) => c.cat === 'Fruit');
  const bitters = cats.filter((c) => c.cat === 'Bitters');

  const ingredients = [];
  const base = spirits[0] || liqueurs[0];
  if (base) ingredients.push({ name: base.name, measure: rand(['60 ml', '50 ml', '45 ml']) });
  const modifier = liqueurs.find((l) => !base || l.name !== base.name);
  if (modifier && Math.random() > 0.3) ingredients.push({ name: modifier.name, measure: rand(['20 ml', '15 ml', '25 ml']) });
  if (citrus.length) ingredients.push({ name: citrus[0].name, measure: rand(['25 ml', '20 ml', '30 ml']) });
  if (sweet.length) ingredients.push({ name: sweet[0].name, measure: rand(['15 ml', '10 ml', '20 ml']) });
  const mixer = mixers.find((m) => !ingredients.some((i) => i.name === m.name));
  if (mixer && Math.random() > 0.25) ingredients.push({ name: mixer.name, measure: 'top up' });
  if (bitters.length && Math.random() > 0.4) ingredients.push({ name: bitters[0].name, measure: rand(['2 dashes', '3 dashes']) });
  const garnish = rand([...herbs, ...fruit].filter(Boolean).length ? [...herbs, ...fruit] : [null]);
  if (garnish && !ingredients.some((i) => i.name === garnish.name))
    ingredients.push({ name: garnish.name, measure: 'to garnish' });

  if (!ingredients.length)
    ingredients.push(...pantry.slice(0, 3).map((name) => ({ name, measure: 'to taste' })));

  const hasMixer = ingredients.some((i) => i.measure === 'top up');
  const shaken = citrus.length > 0 || sweet.length > 0;
  const glass = hasMixer ? 'Highball glass' : shaken ? 'Coupe' : 'Rocks glass';
  const core = ingredients.filter((i) => i.measure !== 'top up' && i.measure !== 'to garnish').map((i) => i.name);
  const method = shaken
    ? `Shake ${core.join(', ')} hard with ice for 12 seconds. Strain into a chilled ${glass.toLowerCase()}${hasMixer && mixer ? `, top with ${mixer.name}` : ''}.`
    : `Stir all ingredients over ice for 30 seconds and strain into a ${glass.toLowerCase()}${hasMixer && mixer ? `, then top with ${mixer.name}` : ''}.`;

  const avoidSet = new Set(avoid.map((a) => a.toLowerCase()));
  let name = `${rand(FIRST)} ${rand(SECOND)}`;
  for (let i = 0; i < 20 && avoidSet.has(name.toLowerCase()); i++) name = `${rand(FIRST)} ${rand(SECOND)}`;

  return withVibe({
    id: `custom-${Date.now()}`,
    name,
    tagline: 'Improvised off-menu while our robot bartender takes a breather.',
    category: 'AI Original',
    alcoholic: base && isBoozeCategory(base.cat) ? 'Alcoholic' : 'Non alcoholic',
    glass,
    instructions: `${method}${garnish ? ` Garnish with ${garnish.name.toLowerCase()}.` : ''}`,
    thumb: '',
    video: '',
    tags: ['AI Original'],
    iba: '',
    ingredients,
    source: 'fallback',
  });
}

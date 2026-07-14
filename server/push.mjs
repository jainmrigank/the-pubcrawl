/**
 * Bar nudges: the approved notification copy, plus the logic that picks one.
 *
 * Cadence is enforced by the scheduler (every 2–3 days), not here. Every
 * notification opens The Menu; the "specific drink" ones open that drink's
 * card by deep-linking a search for its exact name.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const factsPath = join(ROOT, 'data', 'facts.json');
const FACTS = existsSync(factsPath) ? JSON.parse(readFileSync(factsPath, 'utf8')) : [];

const MENU = '/#/menu';
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
/** deep link straight to a drink's flash card in The Menu */
const drinkUrl = (name) => `${MENU}?q=${encodeURIComponent(name)}`;

/* 1 — after-work unwind */
const AFTER_WORK = [
  { title: 'Long day?', body: "There's a drink on your shelf with your name on it." },
  { title: 'Clock off.', body: "You've earned something cold and proper." },
  { title: "That's enough for today.", body: 'Ten minutes and one good pour. Go on.' },
];

/* 2 — a specific drink, dropped casually */
const DRINK_LINES = [
  (d) => ({ title: `Ever made a ${d}?`, body: "Takes about three minutes. Tonight's as good a night as any." }),
  (d) => ({ title: `${d}.`, body: "That's it. That's the suggestion." }),
  (d) => ({ title: `Tonight's idea: ${d}`, body: 'You might already have everything for it.' }),
  (d) => ({ title: `A ${d} would go down well.`, body: 'Have a look at what it takes.' }),
];

/* 4 — weekend / occasion (day-gated so they always land true) */
const OCCASION = {
  5: { title: "It's Friday.", body: 'You know what to do.' }, // Friday
  0: { title: 'Sunday, slowly.', body: 'Something long, cold and low-effort?' }, // Sunday
};

/* 5 — gentle re-engagement (only for drinkers who've been away) */
const AWAY = [
  { title: "The bar's still open.", body: "Your shelf's where you left it." },
  { title: 'Been a while.', body: 'Fancy trying something new tonight?' },
];

/* 6 — welcome, once, right after they turn nudges on */
export const WELCOME = {
  title: "You're in.",
  body: "Tell us what's on your shelf and we'll pour you something.",
  url: MENU,
  tag: 'welcome',
};

/**
 * Build one nudge.
 * @param drinks  catalogue, to name a real cocktail
 * @param awayDays how long since this drinker last opened the app
 */
export function buildNudge(drinks, awayDays = 0) {
  // been away a fortnight? gently say so instead of a hard sell
  if (awayDays >= 14) return { ...pick(AWAY), url: MENU, tag: 'away' };

  const day = new Date().getDay();
  const occasion = OCCASION[day];

  const buckets = ['drink', 'fact', 'afterwork'];
  if (occasion) buckets.push('occasion');
  const bucket = pick(buckets);

  if (bucket === 'occasion') return { ...occasion, url: MENU, tag: 'occasion' };

  if (bucket === 'drink') {
    const pool = drinks.filter((d) => d.thumb && !/^(kept-|custom-)/.test(d.id));
    if (pool.length) {
      const d = pick(pool);
      return { ...pick(DRINK_LINES)(d.name), url: drinkUrl(d.name), tag: 'drink' };
    }
  }

  if (bucket === 'fact' && FACTS.length) {
    return { title: 'Bar Talk', body: pick(FACTS), url: MENU, tag: 'fact' };
  }

  return { ...pick(AFTER_WORK), url: MENU, tag: 'afterwork' };
}

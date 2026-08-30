/**
 * Re-checks every photo in data/images.json and removes the ones that are not
 * pictures of a drink.
 *
 * fetch_images.mjs accepted an article if its text matched a list of drink
 * words, but those words were unanchored: "spirit" matched "spirituality",
 * "ale" matched "female", "sour" matched "source". That let Bob Marley the
 * musician become the photo for the Bob Marley shot, a wind farm become Rail
 * Splitter, and an actual bumblebee become Bumble Bee.
 *
 * The test here is stricter in both directions: drink words must match on word
 * boundaries, and an article whose one-line description says it is a musician,
 * a film, a species or a place is rejected outright no matter what its text
 * contains. A drink with no photo falls back to its glass glyph, which is the
 * honest outcome.
 *
 * Run: node scripts/audit_images.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'images.json');
const CANDIDATE_OUT = join(ROOT, 'data', 'image_audit_candidates.json');
const UA = { 'user-agent': 'PubCrawl/1.0 (personal cocktail app; https://github.com/jainmrigank/the-pubcrawl)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cocktails = JSON.parse(readFileSync(join(ROOT, 'data', 'cocktails.json'), 'utf8'));
for (const f of ['extra_cocktails.json', 'indian_cocktails.json']) {
  const p = join(ROOT, 'data', f);
  if (existsSync(p)) cocktails.push(...JSON.parse(readFileSync(p, 'utf8')));
}
const byId = new Map(cocktails.map((c) => [c.id, c]));
const images = JSON.parse(readFileSync(OUT, 'utf8'));
const candidates = {};

/** drink words, on word boundaries this time */
const DRINK =
  /\b(cocktails?|drinks?|beverages?|liqueurs?|shots?|punch|juice|lassi|sherbet|sharbat|spirits?|rum|gin|whisky|whiskey|bourbon|vodka|tequila|mezcal|brandy|wine|beer|ale|lager|stout|cider|mocktails?|smoothie|soda|fizz|sour|spritz|toddy|feni|mule|highball|aperitif|ap[eé]ritif|digestif|bitters|vermouth|sake|schnapps|absinthe)\b/i;

/**
 * What the article is actually about, when it is not a drink. Every term is
 * anchored on word boundaries, because that is the whole bug this script
 * exists to clean up: unanchored "bee" matches "beer", "brand" matches
 * "brandy", "plant" matches "plantation".
 */
const NOT_DRINK =
  /\b(musicians?|singers?|songwriters?|rappers?|guitarists?|bands?|albums?|songs?|films?|movies?|actors?|actress|characters?|novels?|novelist|books?|poet|footballers?|cricketers?|athletes?|politicians?|species|insects?|bees?|wasps?|birds?|fish|plants?|genus|flowers?|villages?|towns?|cities|city|county|island|mountains?|loch|lake|river|region|parks?|companies|company|brands?|logos?|paintings?|sculptures?|deity|mythology|mythological|goddess|god|baptism|sacrament)\b/i;

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
      if (r.status === 429) {
        await sleep(2500 * (i + 1));
        continue;
      }
      if (!r.ok) return null;
      return await r.json();
    } catch {
      await sleep(800 * (i + 1));
    }
  }
  return null;
}

async function summary(title) {
  const j = await getJson('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title));
  if (!j || j.type === 'disambiguation') return null;
  return {
    title: j.title || title,
    description: j.description || '',
    extract: (j.extract || '').slice(0, 400),
    img: j.originalimage?.source || j.thumbnail?.source || null,
  };
}

/**
 * Is this article about a drink? The one-line description is short and precise,
 * so it decides first, and a description that says "cocktail" wins outright:
 * "Brandy-based cocktail of cognac" is a drink even though it also says brandy.
 */
function isDrink(s) {
  if (!s) return false;
  if (/^(list|index|outline) of/i.test(s.title)) return false; // a list is not a photo of a drink
  if (/\((cocktail|drink|mixed drink)\)$/i.test(s.title)) return true;
  if (DRINK.test(s.description)) return true;
  if (NOT_DRINK.test(s.description)) return false;
  if (NOT_DRINK.test(s.extract)) return false;
  return DRINK.test(s.extract);
}

/**
 * Second opinion for photos the title lookup cannot reproduce: ask Commons what
 * the file itself is filed under. Categories are blunt and factual, so a wind
 * farm sits in "Wind farms in Illinois" and a bumblebee in "Bombus lapidarius",
 * neither of which looks remotely like a drink.
 */
async function commonsVerdict(url) {
  const file = decodeURIComponent((url.split('/').pop() || '')).replace(/^\d+px-/, '');
  if (!file) return null;
  const j = await getJson(
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=categories&cllimit=60&titles=' +
      encodeURIComponent('File:' + file)
  );
  const pages = j?.query?.pages;
  if (!pages) return null;
  const cats = Object.values(pages).flatMap((p) => (p.categories || []).map((c) => c.title.replace(/^Category:/, '')));
  if (!cats.length) return null;
  const text = cats.join(' ; ');
  // Asymmetric on purpose. Categories name the drink rather than describing it
  // ("Soju", "Negroni", "Shikanjvi"), so absence of the word "cocktail" proves
  // nothing. Only positive evidence of something else gets a photo deleted.
  if (NOT_DRINK.test(text) && !DRINK.test(text)) return { ok: false, cats: text.slice(0, 130) };
  return { ok: true, cats: text };
}

const same = (a, b) => a && b && decodeURIComponent(a).split('/').pop() === decodeURIComponent(b).split('/').pop();

const TOTAL = Object.keys(images).length;
const removed = [];
const kept = [];
const unresolved = [];
let n = 0;

for (const [id, url] of Object.entries(images)) {
  n++;
  const drink = byId.get(id);
  if (!url || !drink) continue;

  // find the article this photo came from, trying the same titles in the same order
  let source = null;
  for (const t of [`${drink.name} (cocktail)`, `${drink.name} (drink)`, drink.name]) {
    const s = await summary(t);
    await sleep(220);
    if (s && same(s.img, url)) {
      source = s;
      break;
    }
  }

  if (!source) {
    // came from the search pass: fall back to what Commons says the file is
    const v = await commonsVerdict(url);
    await sleep(220);
    if (v && !v.ok) {
      removed.push({ name: drink.name, article: 'commons categories', why: v.cats });
      candidates[id] = { status: 'remove', current: url, source: 'commons categories', note: v.cats };
    } else if (v) {
      kept.push(drink.name);
      candidates[id] = { status: 'available', current: url, source: 'commons categories', note: 'Availability only; recipe-specific visual review still required.' };
    } else {
      unresolved.push(drink.name);
      candidates[id] = { status: 'needs-review', current: url, note: 'Source could not be re-resolved automatically.' };
    }
    continue;
  }
  if (isDrink(source)) {
    kept.push(drink.name);
    candidates[id] = { status: 'available', current: url, source: source.title, note: 'Availability/source match only; recipe-specific visual review still required.' };
  } else {
    removed.push({ name: drink.name, article: source.title, why: source.description || '(no description)' });
    candidates[id] = { status: 'remove', current: url, source: source.title, note: source.description || '(no description)' };
  }
  if (n % 20 === 0) process.stdout.write(`\r  checked ${n}/${TOTAL}   `);
}

console.log(`\n\nkept ${kept.length}  ·  removed ${removed.length}  ·  unresolved ${unresolved.length}`);
if (removed.length) {
  console.log('\nREMOVED (article was not about a drink):');
  for (const r of removed) console.log(`  ${r.name.padEnd(26)} -> "${r.article}"  ${r.why}`);
}
if (unresolved.length) console.log(`\nnot re-resolvable, left as they were: ${unresolved.join(', ')}`);

writeFileSync(CANDIDATE_OUT, JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), entries: candidates }, null, 1));
console.log(`\nWrote ${Object.keys(candidates).length} image candidates to ${CANDIDATE_OUT}; images.json was not modified.`);

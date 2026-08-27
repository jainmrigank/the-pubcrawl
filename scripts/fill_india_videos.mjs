/**
 * Validate or find one useful YouTube tutorial for every recipe in the India
 * collection. Exact named recipes are preferred; a clearly labelled base
 * technique is accepted for an original PubCrawl riff. If YouTube exposes no
 * durable direct result, the card receives a recipe-specific YouTube search
 * rather than a confidently wrong video.
 *
 * Writes:
 *   data/videos.json                       legacy id -> URL lookup
 *   data/indian_cocktail_video_audit.json  title, query, match kind and date
 *
 * Run: node scripts/fill_india_videos.mjs
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../server/catalog.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VIDEOS_PATH = join(ROOT, 'data', 'videos.json');
const AUDIT_PATH = join(ROOT, 'data', 'indian_cocktail_video_audit.json');
const CHECKED_AT = '2026-08-27';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A search result can share enough title words to score well while teaching a
// materially different drink (or, in the case of a Jagerbomb, an unsafe serve).
// These links were manually reviewed on 2026-08-27. Keep them deterministic so
// a future automated refresh cannot undo the editorial/safety pass.
const REVIEWED_OVERRIDES = {
  'x-in-003': {
    url: 'https://www.youtube.com/watch?v=Pnad9IK0H3E',
    title: 'How to Make a Vodka Soda Cocktail | Grey Goose Vodka',
    kind: 'technique',
    query: 'vodka lemon soda cocktail recipe',
    reviewNote: 'Vodka-soda build; add the written recipe lemon component.',
  },
  'x-in-016': {
    url: 'https://www.youtube.com/watch?v=Wfr5DUumWKk',
    title: 'Kala khatta drink || Kala khatta soda || Easy to make || The mocktail house',
    kind: 'technique',
    query: 'kala khatta vodka cocktail recipe',
    reviewNote: 'Shows the kala-khatta soda base; the written recipe adds vodka.',
  },
  'x-in-019': {
    url: 'https://www.youtube.com/watch?v=l-cldHZbdwg',
    title: 'Curry Leaf Gin & Tonic Recipe',
    kind: 'technique',
    query: 'curry leaf margarita recipe',
    reviewNote: 'Curry-leaf gin technique, not the exact margarita build.',
  },
  'x-in-022': {
    url: 'https://www.youtube.com/watch?v=OHrt-Fly7GU',
    title: 'Gin Sour Recipe - Make the PERFECT Gin Sour at Home',
    kind: 'technique',
    query: 'kokum gin sour recipe',
    reviewNote: 'Reliable sour technique; use kokum from the written recipe.',
  },
  'x-in-026': {
    url: 'https://www.youtube.com/watch?v=SeTY6c1dVus',
    title: 'How to Make Cocktails With the Most Popular Herbs | Gin Basil Smash |Thyme | Sage | Rosemary | Mint',
    kind: 'technique',
    query: 'tulsi gin cocktail recipe',
    reviewNote: 'Herb-smash technique; the written recipe specifies tulsi.',
  },
  'x-in-030': {
    url: 'https://www.youtube.com/watch?v=SQcuBII2tpQ',
    title: 'Rasam Bloody Mary Mocktail',
    kind: 'technique',
    query: 'rasam bloody mary cocktail recipe',
    reviewNote: 'Shows the rasam Bloody Mary flavour base; the written version adds vodka.',
  },
  'x-in-031': {
    url: 'https://www.youtube.com/watch?v=pNLFQ5ozeUs',
    title: 'Gin and Tonic. Easy recipe to make gin tonic at home. #gincocktail #mocktail #cocktail #hungerherb',
    kind: 'technique',
    query: 'solkadhi gin cocktail recipe',
    reviewNote: 'A clear gin highball build; follow the written solkadhi proportions.',
  },
  'x-in-033': {
    url: 'https://www.youtube.com/watch?v=7MppgYw-tU8',
    title: 'How to Make the Perfect Toki Highball | Japanese Whisky Cocktail',
    kind: 'technique',
    query: 'kombucha whisky highball recipe',
    reviewNote: 'Whisky-highball technique; kombucha replaces soda in the written build.',
  },
  'x-in-039': {
    url: 'https://www.youtube.com/watch?v=OHrt-Fly7GU',
    title: 'Gin Sour Recipe - Make the PERFECT Gin Sour at Home',
    kind: 'technique',
    query: 'mahua sour cocktail recipe',
    reviewNote: 'Sour technique selected instead of an unsafe home-distillation result.',
  },
  'x-in-040': {
    url: 'https://www.youtube.com/watch?v=Fndp6zEGsjo',
    title: 'coconut boom | signature cocktail | classic cocktail |coconut |coconut Toddy |',
    kind: 'technique',
    query: 'toddy coconut cocktail Kerala recipe',
    reviewNote: 'A cocktail build using coconut toddy, not a home-fermentation tutorial.',
  },
  'x-in-042': {
    url: 'https://www.youtube.com/watch?v=ZrAQekvMtgg',
    title: 'No Alcohol Refreshment Curry Leaves Martini | Swadist Vyanjan |',
    kind: 'technique',
    query: 'kokum curry leaf mocktail recipe',
    reviewNote: 'Alcohol-free curry-leaf technique; use kokum from the written recipe.',
  },
  'x-in-045': {
    url: 'https://www.youtube.com/watch?v=LxsR9cMsYuM',
    title: 'turmeric mojito mocktail | immunity drink | 5 min healthy non alcoholic summer drink recipe at home',
    kind: 'technique',
    query: 'turmeric ginger mocktail highball recipe',
    reviewNote: 'Verified alcohol-free turmeric highball technique.',
  },
  'x-in-052': {
    url: 'https://www.youtube.com/watch?v=ZrAQekvMtgg',
    title: 'No Alcohol Refreshment Curry Leaves Martini | Swadist Vyanjan |',
    kind: 'technique',
    query: 'coconut curry leaf mocktail recipe',
    reviewNote: 'Alcohol-free curry-leaf technique; use coconut water from the written recipe.',
  },
  'x-kokum': {
    url: 'https://www.youtube.com/watch?v=ruuYFWUY_Gc',
    title: 'Kokum Sharbat I How To Make Kokum Sharbat At Home | Sharbat',
    kind: 'technique',
    query: 'Kokum Cooler cocktail recipe',
    reviewNote: 'Alcohol-free kokum base; finish with lime, salt and soda as written.',
  },
  'x-jagerbomb': {
    url: 'https://www.youtube.com/watch?v=8uFnVp-jgqM',
    title: 'Meister Class: Five hacks to meister the Jägermeister highball',
    kind: 'technique',
    query: 'Jägerbomb cocktail recipe',
    reviewNote: 'Safe highball service selected instead of dropping a shot glass.',
  },
};

const videos = existsSync(VIDEOS_PATH) ? JSON.parse(readFileSync(VIDEOS_PATH, 'utf8')) : {};
const audit = existsSync(AUDIT_PATH) ? JSON.parse(readFileSync(AUDIT_PATH, 'utf8')) : {};
const allRecipes = loadCatalog().cocktails.filter((recipe) => recipe.tags?.includes('India'));
const recipes = process.argv.includes('--overrides-only')
  ? allRecipes.filter((recipe) => REVIEWED_OVERRIDES[recipe.id])
  : process.argv.includes('--search-only')
    ? allRecipes.filter((recipe) => audit[recipe.id]?.kind === 'search')
    : allRecipes;

const STOP = new Set([
  'the', 'and', 'with', 'from', 'into', 'made', 'make', 'how', 'easy', 'best',
  'recipe', 'cocktail', 'drink', 'indian', 'india', 'style',
]);
const clean = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const terms = (value) => clean(value).split(' ').filter((word) => word.length >= 3 && !STOP.has(word));

function titleScore(recipe, title) {
  const haystack = clean(title);
  const nameTerms = terms(recipe.name);
  const queryTerms = terms(recipe.videoSearch || recipe.name);
  const nameHits = nameTerms.filter((word) => haystack.includes(word)).length;
  const queryHits = queryTerms.filter((word) => haystack.includes(word)).length;
  const tutorial = /\b(recipe|cocktail|mocktail|drink|how to|make|bartend|mixolog)\b/.test(haystack);
  if (!nameHits && queryHits < Math.min(2, queryTerms.length || 2)) return -1;
  return nameHits * 9 + queryHits * 5 + (tutorial ? 5 : 0);
}

function matchKind(recipe, title) {
  const haystack = clean(title);
  const nameTerms = terms(recipe.name);
  const hits = nameTerms.filter((word) => haystack.includes(word)).length;
  return nameTerms.length && hits >= Math.max(1, Math.ceil(nameTerms.length * 0.6)) ? 'exact' : 'technique';
}

function queryScore(query, title) {
  const haystack = clean(title);
  const queryTerms = terms(query);
  const hits = queryTerms.filter((word) => haystack.includes(word)).length;
  const tutorial = /\b(recipe|cocktail|mocktail|drink|how to|make|bartend|mixolog)\b/.test(haystack);
  if (hits < Math.max(1, Math.ceil(queryTerms.length * 0.4))) return -1;
  return hits * 8 + (tutorial ? 5 : 0);
}

function techniqueQuery(recipe) {
  const name = clean(recipe.name);
  if (/picante/.test(name)) return 'picante cocktail recipe';
  if (/bloody|mary|rasam/.test(name)) return 'bloody mary cocktail recipe';
  if (/martini|kaapi|coffee/.test(name)) return 'espresso martini cocktail recipe';
  if (/margarita/.test(name)) return 'margarita cocktail recipe';
  if (/daiquiri/.test(name)) return 'daiquiri cocktail recipe';
  if (/old fashioned|jaggery/.test(name)) return 'old fashioned cocktail recipe';
  if (/g t|gin tonic/.test(name)) return 'gin and tonic cocktail recipe';
  if (/collins/.test(name)) return 'tom collins cocktail recipe';
  if (/sour/.test(name)) return 'how to make a sour cocktail';
  if (/flip|thandai/.test(name)) return 'how to make a flip cocktail';
  if (/toddy|chai/.test(name)) return 'hot toddy cocktail recipe';
  if (/feni|urrak/.test(name)) return 'feni cocktail recipe Goa';
  if (/mahua/.test(name)) return 'mahua cocktail recipe';
  if (/arrack/.test(name)) return 'arrack cocktail recipe';
  if ((recipe.alcoholic || '').toLowerCase().includes('non')) return 'how to make a mocktail highball';
  return 'how to make a highball cocktail';
}

async function videoTitle(url) {
  if (!/youtu\.?be|youtube\.com/.test(url) || /\/results\?/.test(url)) return null;
  try {
    const response = await fetch(
      'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url),
      { signal: AbortSignal.timeout(15000) }
    );
    if (!response.ok) return null;
    return (await response.json()).title || null;
  } catch {
    return null;
  }
}

async function searchCandidates(query) {
  try {
    const response = await fetch(
      'https://www.youtube.com/results?search_query=' + encodeURIComponent(query),
      {
        headers: {
          cookie: 'CONSENT=YES+cb',
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
          'accept-language': 'en-IN,en;q=0.9',
        },
        signal: AbortSignal.timeout(20000),
      }
    );
    if (!response.ok) return [];
    const html = await response.text();
    const pattern =
      /"videoRenderer":\{"videoId":"([\w-]{11})"[\s\S]{0,1200}?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/g;
    const found = [];
    const seen = new Set();
    let match;
    while ((match = pattern.exec(html)) && found.length < 12) {
      if (seen.has(match[1])) continue;
      seen.add(match[1]);
      let title = match[2];
      try {
        title = JSON.parse('"' + match[2] + '"');
      } catch {}
      found.push({ id: match[1], title });
    }
    return found;
  } catch {
    return [];
  }
}

async function findBest(recipe) {
  const query = recipe.videoSearch || recipe.name + ' cocktail recipe';
  const candidates = (await searchCandidates(query))
    .map((candidate) => ({ ...candidate, score: titleScore(recipe, candidate.title) }))
    .filter((candidate) => candidate.score >= 10)
    .sort((a, b) => b.score - a.score);

  for (const candidate of candidates.slice(0, 5)) {
    const url = 'https://www.youtube.com/watch?v=' + candidate.id;
    const title = await videoTitle(url);
    if (!title || titleScore(recipe, title) < 10) continue;
    return { url, title, kind: matchKind(recipe, title), query };
  }

  const technique = techniqueQuery(recipe);
  const techniqueCandidates = (await searchCandidates(technique))
    .map((candidate) => ({ ...candidate, score: queryScore(technique, candidate.title) }))
    .filter((candidate) => candidate.score >= 8)
    .sort((a, b) => b.score - a.score);
  for (const candidate of techniqueCandidates.slice(0, 5)) {
    const url = 'https://www.youtube.com/watch?v=' + candidate.id;
    const title = await videoTitle(url);
    if (!title || queryScore(technique, title) < 8) continue;
    return { url, title, kind: 'technique', query, techniqueQuery: technique };
  }

  return {
    url: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query),
    title: 'YouTube search: ' + query,
    kind: 'search',
    query,
  };
}

let exact = 0;
let technique = 0;
let search = 0;
let replaced = 0;

for (let index = 0; index < recipes.length; index++) {
  const recipe = recipes[index];
  const current = videos[recipe.id] || recipe.video || '';
  const reviewed = REVIEWED_OVERRIDES[recipe.id];
  const currentTitle = !reviewed && current ? await videoTitle(current) : null;
  let result;

  if (reviewed) {
    result = reviewed;
  } else if (currentTitle && titleScore(recipe, currentTitle) >= 10) {
    result = {
      url: current,
      title: currentTitle,
      kind: matchKind(recipe, currentTitle),
      query: recipe.videoSearch || recipe.name + ' cocktail recipe',
    };
  } else {
    result = await findBest(recipe);
    if (current && current !== result.url) replaced++;
  }

  videos[recipe.id] = result.url;
  audit[recipe.id] = { ...result, checkedAt: CHECKED_AT };
  if (result.kind === 'exact') exact++;
  else if (result.kind === 'technique') technique++;
  else search++;

  if ((index + 1) % 10 === 0) {
    writeFileSync(VIDEOS_PATH, JSON.stringify(videos, null, 1) + '\n');
    writeFileSync(AUDIT_PATH, JSON.stringify(audit, null, 2) + '\n');
    console.log((index + 1) + '/' + recipes.length + ' exact:' + exact + ' technique:' + technique + ' search:' + search);
  }
  await sleep(250);
}

writeFileSync(VIDEOS_PATH, JSON.stringify(videos, null, 1) + '\n');
writeFileSync(AUDIT_PATH, JSON.stringify(audit, null, 2) + '\n');
console.log('Done. exact:' + exact + ' technique:' + technique + ' search:' + search + ' replaced:' + replaced);

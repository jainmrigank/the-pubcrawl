/**
 * Builds data/watchlist.json at library scale.
 *
 * Searches YouTube across a wide set of queries per lane, reads the embedded
 * ytInitialData rather than regexing the page, and keeps only what survives a
 * stack of filters. Everything that gets in is then checked through oEmbed, so
 * a dead or embed-blocked video never reaches the file.
 *
 * The filters exist because a raw search for "cocktail" returns soda taste
 * tests, energy drink rankings and thirty-second Shorts. The rules:
 *
 *   - no Shorts or live streams (both lack a duration in the search payload)
 *   - the title or channel must actually mention drink
 *   - a global blocklist kills the recurring off-topic hits
 *   - a minimum view count, because this is meant to be the good stuff
 *   - a per-channel cap, so one prolific series cannot eat a whole lane
 *
 * Run: node scripts/harvest_watchlist.mjs [--min 50000] [--dry]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'watchlist.json');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const MIN_VIEWS = Number(arg('min', 50000));
const PER_CHANNEL = Number(arg('perchannel', 8));
const DRY = process.argv.includes('--dry');

const H = {
  cookie: 'CONSENT=YES+cb',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'accept-language': 'en-US,en;q=0.9',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 4-20 minutes and over 20 minutes. Requesting both, and never "any", is what
   keeps Shorts out of the results in the first place. */
const DURATIONS = ['EgIYAg%3D%3D', 'EgIYAw%3D%3D'];

const QUERIES = {
  craft: [
    'japanese bartender cocktail technique', 'best bartender in the world', 'craft cocktail bar behind the scenes',
    'world class bartender final', 'cocktail bar tokyo ginza', 'flair bartending competition',
    'inside the best bar in the world', 'speakeasy bar tour cocktails', 'molecular mixology cocktails',
    'ice carving cocktail bartender', 'dead rabbit bartender', 'cocktail bar london',
    'mixologist signature cocktail creation', 'bar director cocktail menu', 'greatest bartenders of all time',
    'pov bartender busy service', 'best bars in the world documentary', 'cocktail competition finals',
    'bar takeover guest shift cocktails', 'connaught bar martini', 'artesian bar cocktails',
    'cocktail bar new york city best', 'bartender life documentary', 'hidden speakeasy new york',
    'awarded bar asia 50 best', 'cocktail bar singapore', 'bartender skills showcase',
    'behind the bar michelin restaurant', 'legendary hotel bar martini', 'cocktail garnish artistry',
  ],
  education: [
    'cocktails every bartender should know', 'how to make classic cocktails at home', 'bartending basics fundamentals',
    'cocktail history explained', 'how to stock a home bar', 'shake or stir cocktail explained',
    'whiskey explained beginners guide', 'gin explained types', 'rum explained guide',
    'tequila mezcal explained', 'vermouth explained cocktails', 'how to make simple syrup cocktails',
    'best cocktail books bartender', 'how to taste whisky properly', 'home bar essentials beginner',
    'classic cocktail recipes old fashioned negroni', 'bitters explained cocktails',
    'how to make an old fashioned properly', 'margarita recipe bartender', 'how to make a negroni',
    'how to make a daiquiri properly', 'how to make a martini bartender', 'whisky regions scotland explained',
    'wine tasting for beginners', 'beer styles explained', 'how to build a cocktail menu',
    'sous vide infusion cocktails', 'clarified milk punch how to', 'batching cocktails for a party',
    'best cheap whiskey bottles', 'cocktail shaking technique explained', 'why your cocktails taste bad',
    'ice for cocktails explained', 'how to make syrups cordials bar', 'aperitif digestif explained',
  ],
  comedy: [
    'day drinking seth meyers', 'stand up comedy about drinking', 'comedian drunk story special',
    'stand up comedy alcohol bit', 'drunk history episode', 'comedian hangover joke special',
    'indian standup comedy drinking', 'bar jokes stand up comedy', 'comedy sketch about drinking',
    'funny bartender stories', 'drunk friends comedy sketch', 'wine tasting comedy sketch',
    'stand up comedy party drunk', 'comedians get drunk podcast', 'jim gaffigan drinking',
    'drinking games comedy sketch', 'hungover comedy special bit',
  ],
  people: [
    'trying alcohol for the first time', 'people try cocktails blind taste test',
    'bartender guesses drink order', 'irish people try alcohol', 'blind taste test whiskey',
    'ranking every vodka taste test', 'sommelier guesses wine blind', 'people try soju first time',
    'bartenders react to movie cocktails', 'reviewing cheap alcohol taste test',
    'trying weird alcohol around the world', 'bartender reacts to tiktok drinks',
    'first time trying whiskey reaction', 'people guess alcohol by taste', 'expensive vs cheap whiskey',
    'blind tasting gin brands', 'tequila taste test ranking', 'rum blind taste test',
    'bartenders try each others cocktails', 'americans try indian alcohol',
    'people try absinthe first time', 'wine expert guesses price', 'beer taste test ranking',
    'trying every drink on the menu', 'bartender rates celebrity cocktails',
  ],
};

/** the title or channel has to be about drink at all */
const ON_TOPIC =
  /\b(cocktails?|bartend\w*|mixolog\w*|whisk(?:e?y)|bourbon|scotch|rum|gin|vodka|tequila|mezcal|brandy|cognac|liqueurs?|drinking|drunk|alcohol|booze|spirits?|margarita|martini|mojito|negroni|daiquiri|old.fashioned|highball|hangover|tipsy|distiller\w*|sake|soju|absinthe|vermouth|aperol|campari|liquor|sommelier|speakeasy|pub|shots?)\b|\b(?:cocktail|dive|hotel|rooftop|speakeasy|behind the|best|top) bar\b|\bbar (?:rescue|crawl|tour|menu|manager|director|takeover)\b/i;

/** the recurring off-topic hits, learned from watching what comes back */
const OFF_TOPIC =
  /\b(coca.?cola|pepsi|energy drinks?|monster energy|soft drinks?|soda taste|mountain dew|boba|bubble tea|protein shake|smoothie recipe|coffee recipe|kids?|baby|prank|fortnite|minecraft|roblox|gta|asmr eating|mukbang|weight loss|diet|vlog|food guide|places to eat|neighbourhood tour|neighborhood tour|city guide|travel guide|things to do in|street food|hotel review|apartment tour|full movie|episode \\d+|reaction to)\\b|\\b(?:movie|film)\\b.*\\b(?:explained|reaction|moments|scenes?|ranked|trailer|ending)\\b|\\b(?:explained|reaction|moments|scenes?|ranked|trailer)\\b.*\\b(?:movie|film)\\b|the hangover|hangover part|dramatizeme|dhar mann|bollywood/i;

/**
 * The query that found a video is a weak signal for what it is: a Tipsy
 * Bartender lesson turns up under a craft search and is plainly teaching. The
 * title says so, so let it decide, and fall back to the query only when the
 * title is silent.
 */
function classify(title, fallback) {
  const t = title.toLowerCase();
  if (/\b(comedy|stand.?up|standup|funny|joke|sketch|drunk history|day drinking|roast|crowd work)\b/.test(t)) return 'comedy';
  if (/\b(first time|trying|try |taste test|blind|reacts?|reaction|guess|ranking|ranked|challenge|vs\.? )/.test(t)) return 'people';
  if (/\b(how to|guide|explained|basics|beginner|learn|tutorial|masterclass|lesson|course|tips|you need to know|should know|recipe)\b/.test(t)) return 'education';
  return fallback;
}

async function search(query, durationParam) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=${durationParam}`;
  const res = await fetch(url, { headers: H, signal: AbortSignal.timeout(25000) });
  if (!res.ok) return [];
  const html = await res.text();
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) return [];

  let data;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return [];
  }

  /* walk the render tree rather than guessing at its shape: YouTube moves
     these nodes around, but a videoRenderer always looks like a videoRenderer */
  const out = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    const v = node.videoRenderer;
    if (v?.videoId && v.lengthText?.simpleText) {
      const views = Number(String(v.viewCountText?.simpleText || '').replace(/[^\d]/g, '')) || 0;
      out.push({
        id: v.videoId,
        title: (v.title?.runs?.[0]?.text || '').trim(),
        channel: (v.ownerText?.runs?.[0]?.text || v.longBylineText?.runs?.[0]?.text || '').trim(),
        views,
        length: v.lengthText.simpleText,
      });
    }
    for (const k of Object.keys(node)) if (k !== 'videoRenderer') visit(node[k]);
  };
  visit(data);
  return out;
}

async function playable(id) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${id}`, {
      signal: AbortSignal.timeout(12000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------- harvest -- */

const found = new Map(); // id -> candidate
let queries = 0;
let empty = 0;

for (const [lane, list] of Object.entries(QUERIES)) {
  for (const q of list) {
    for (const dur of DURATIONS) {
      queries++;
      let results = [];
      for (let attempt = 0; attempt < 2 && !results.length; attempt++) {
        try {
          results = await search(q, dur);
        } catch {
          /* one bad query should not end the harvest */
        }
        if (!results.length) {
          empty++;
          await sleep(4000); // back off: an empty page usually means we are going too fast
        }
      }
      await sleep(1600 + Math.random() * 700);
      for (const r of results) {
        if (found.has(r.id)) continue;
        if (!r.title || !r.channel) continue;
        if (r.views < MIN_VIEWS) continue;
        const hay = `${r.title} ${r.channel}`;
        if (!ON_TOPIC.test(hay)) continue;
        if (OFF_TOPIC.test(hay)) continue;
        found.set(r.id, { ...r, lane: classify(r.title, lane) });
      }
    }
    process.stdout.write(`\r  ${queries} queries · ${found.size} candidates   `);
  }
}
console.log(`\n\n${found.size} candidates passed the filters. ${empty} searches came back empty.`);

/* per-channel cap, biggest first, so one series cannot dominate a lane */
const byViews = [...found.values()].sort((a, b) => b.views - a.views);
const perChannel = new Map();
const capped = [];
for (const v of byViews) {
  const n = perChannel.get(v.channel) || 0;
  if (n >= PER_CHANNEL) continue;
  perChannel.set(v.channel, n + 1);
  capped.push(v);
}
console.log(`${capped.length} left after the ${PER_CHANNEL}-per-channel cap (${perChannel.size} channels).`);

/* every survivor gets checked: dead and embed-blocked videos never ship */
console.log('\nChecking every one is still playable and embeddable...');
const live = [];
for (let i = 0; i < capped.length; i++) {
  if (await playable(capped[i].id)) live.push(capped[i]);
  await sleep(120);
  if (i % 25 === 0) process.stdout.write(`\r  ${i}/${capped.length} · ${live.length} good   `);
}
console.log(`\r  ${capped.length}/${capped.length} · ${live.length} good, ${capped.length - live.length} dropped\n`);

/* keep anything already curated by hand, then append the harvest */
const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { videos: [] };
const kept = existing.videos || [];
const have = new Set(kept.map((v) => v.id));
const today = new Date().toISOString().slice(0, 10);

const merged = [...kept];
for (const v of live) {
  if (have.has(v.id)) continue;
  have.add(v.id);
  merged.push({ id: v.id, title: v.title, channel: v.channel, lane: v.lane, rank: 0, addedAt: today });
}

/* rank is only the fallback ordering before real view counts arrive, so seed
   it from what search reported rather than leaving it arbitrary */
const seedViews = new Map(live.map((v) => [v.id, v.views]));
merged.sort((a, b) => (seedViews.get(b.id) || 0) - (seedViews.get(a.id) || 0));
merged.forEach((v, i) => (v.rank = i + 1));

const lanes = merged.reduce((m, v) => ({ ...m, [v.lane]: (m[v.lane] || 0) + 1 }), {});
console.log(`Library: ${merged.length} videos (${kept.length} kept, ${merged.length - kept.length} new)`);
console.log('Lanes:', lanes);

if (DRY) console.log('\n--dry: nothing written');
else {
  writeFileSync(OUT, JSON.stringify({ _comment: existing._comment, videos: merged }, null, 1) + '\n');
  console.log(`\nWrote ${OUT}`);
}

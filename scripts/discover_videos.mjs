/**
 * Monthly discovery, through the YouTube Data API rather than the scraper.
 *
 * The RSS sweep keeps the library current from channels we already trust, but
 * it can only ever find more of the same. This is how new channels get in.
 *
 * It deliberately does not scrape. scripts/harvest_watchlist.mjs does, and that
 * is fine to run by hand from a home connection, but on a schedule from a CI
 * runner YouTube throttles datacenter IPs hard and the failure mode is an empty
 * page rather than an error. A scheduled job that silently finds nothing is
 * worse than no job. The Data API is quota-metered, documented and honest about
 * refusing you.
 *
 * Quota: search.list costs 100 units a call against 10,000 a day, so the query
 * count is capped. videos.list costs 1 per 50 ids and is what applies the view
 * floor. A 40-query run is ~4,000 units, comfortably inside one day.
 *
 * Needs YOUTUBE_API_KEY. Run: node scripts/discover_videos.mjs [--queries 40] [--dry]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WATCHLIST = join(ROOT, 'data', 'watchlist.json');
const arg = (n, d) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : d);

const KEY = process.env.YOUTUBE_API_KEY || '';
const MAX_QUERIES = Number(arg('queries', 40));
const MIN_VIEWS = Number(arg('min', 100000));
const DRY = process.argv.includes('--dry');

if (!KEY) {
  console.error('YOUTUBE_API_KEY is not set. Discovery needs it; the weekly RSS sweep does not.');
  process.exit(1);
}

/* rotated so a monthly run does not ask the same 40 things forever */
const QUERIES = [
  ['craft', 'craft cocktail bar behind the scenes'], ['craft', 'japanese bartender technique'],
  ['craft', 'best bar in the world cocktails'], ['craft', 'cocktail competition final'],
  ['craft', 'speakeasy bar tour'], ['craft', 'pov bartender service'],
  ['craft', 'bartender ice carving'], ['craft', 'signature cocktail creation'],
  ['education', 'cocktails every bartender should know'], ['education', 'how to make classic cocktails'],
  ['education', 'home bar setup essentials'], ['education', 'whisky explained guide'],
  ['education', 'gin explained guide'], ['education', 'rum explained guide'],
  ['education', 'tequila mezcal explained'], ['education', 'cocktail history'],
  ['education', 'bitters vermouth explained'], ['education', 'batching cocktails party'],
  ['education', 'cocktail syrup cordial how to'], ['education', 'shaking stirring technique'],
  ['comedy', 'stand up comedy drinking'], ['comedy', 'day drinking celebrity'],
  ['comedy', 'drunk history'], ['comedy', 'comedy sketch bar'],
  ['comedy', 'comedian hangover bit'], ['comedy', 'indian standup drinking'],
  ['people', 'trying alcohol first time'], ['people', 'blind taste test whiskey'],
  ['people', 'bartender guesses drink'], ['people', 'ranking vodka taste test'],
  ['people', 'irish people try alcohol'], ['people', 'expensive vs cheap whiskey'],
  ['people', 'sommelier blind wine'], ['people', 'tequila taste test'],
  ['people', 'rum blind tasting'], ['people', 'people guess alcohol by taste'],
  ['people', 'bartenders react cocktails'], ['people', 'beer taste test ranking'],
  ['craft', 'michelin restaurant bar program'], ['education', 'why your cocktails taste bad'],
];

const ON_TOPIC =
  /\b(cocktails?|bartend\w*|mixolog\w*|whisk(?:e?y)|bourbon|scotch|rum|gin|vodka|tequila|mezcal|brandy|cognac|liqueurs?|drinking|drunk|alcohol|booze|spirits?|margarita|martini|mojito|negroni|daiquiri|old.fashioned|highball|hangover|tipsy|distiller\w*|sake|soju|absinthe|vermouth|aperol|campari|liquor|sommelier|speakeasy|pub|shots?)\b/i;

const OFF_TOPIC =
  /\b(coca.?cola|pepsi|energy drinks?|soft drinks?|boba|bubble tea|protein shake|smoothie recipe|coffee recipe|kids?|prank|mukbang|weight loss|vlog|food guide|places to eat|city guide|travel guide|things to do in|street food|full movie|episode \d+)\b|\b(?:movie|film)\b.*\b(?:explained|reaction|moments|scenes?|ranked|trailer|ending)\b|the hangover|hangover part|dramatizeme|dhar mann|bollywood/i;

function classify(title, fallback) {
  const t = title.toLowerCase();
  if (/\b(comedy|stand.?up|standup|funny|joke|sketch|drunk history|day drinking|roast|crowd work)\b/.test(t)) return 'comedy';
  if (/\b(first time|trying|try |taste test|blind|reacts?|reaction|guess|ranking|ranked|challenge|vs\.? )/.test(t)) return 'people';
  if (/\b(how to|guide|explained|basics|beginner|learn|tutorial|masterclass|lesson|course|tips|you need to know|should know|recipe)\b/.test(t)) return 'education';
  return fallback;
}

const api = async (path) => {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}&key=${KEY}`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`${r.status} ${body.slice(0, 160)}`);
  }
  return r.json();
};

const list = JSON.parse(readFileSync(WATCHLIST, 'utf8'));
const have = new Set(list.videos.map((v) => v.id));

/* one search per query; medium and long only, so Shorts never appear */
const candidates = new Map();
let units = 0;
for (const [lane, q] of QUERIES.slice(0, MAX_QUERIES)) {
  try {
    const j = await api(
      `search?part=snippet&type=video&videoDuration=medium&order=relevance&maxResults=25&q=${encodeURIComponent(q)}`
    );
    units += 100;
    for (const item of j.items || []) {
      const id = item.id?.videoId;
      const title = item.snippet?.title || '';
      const channel = item.snippet?.channelTitle || '';
      if (!id || have.has(id) || candidates.has(id)) continue;
      if (!ON_TOPIC.test(title)) continue;
      if (OFF_TOPIC.test(`${title} ${channel}`)) continue;
      candidates.set(id, { id, title, channel, lane: classify(title, lane) });
    }
  } catch (err) {
    console.error(`  query failed (${q}): ${err.message}`);
    if (/quota/i.test(err.message)) break;
  }
  process.stdout.write(`\r  ${units / 100} queries · ${candidates.size} candidates · ~${units} units   `);
}
console.log(`\n\n${candidates.size} candidates. Applying the view floor...`);

/* statistics for all of them at 1 unit per 50 */
const ids = [...candidates.keys()];
const good = [];
for (let i = 0; i < ids.length; i += 50) {
  try {
    const j = await api(`videos?part=statistics,contentDetails&id=${ids.slice(i, i + 50).join(',')}`);
    units += 1;
    for (const item of j.items || []) {
      const views = Number(item.statistics?.viewCount) || 0;
      if (views < MIN_VIEWS) continue;
      // PT#M#S — anything under two minutes is a Short in all but name
      const d = item.contentDetails?.duration || '';
      const mins = (Number(d.match(/(\d+)H/)?.[1] || 0) * 60) + Number(d.match(/(\d+)M/)?.[1] || 0);
      if (mins < 2) continue;
      good.push({ ...candidates.get(item.id), views });
    }
  } catch (err) {
    console.error(`  stats batch failed: ${err.message}`);
  }
}

good.sort((a, b) => b.views - a.views);
console.log(`${good.length} cleared ${MIN_VIEWS.toLocaleString()} views. Quota used: ~${units} of 10,000.\n`);

/* the same per-channel cap the library already lives by */
const perChannel = new Map();
const today = new Date().toISOString().slice(0, 10);
let added = 0;
for (const v of good) {
  const n = perChannel.get(v.channel) || 0;
  if (n >= 3) continue;
  perChannel.set(v.channel, n + 1);
  list.videos.push({ id: v.id, title: v.title, channel: v.channel, lane: v.lane, rank: 0, addedAt: today });
  console.log(`  + [${v.lane}] ${String(v.views).padStart(9)}  ${v.title.slice(0, 56)}  |  ${v.channel}`);
  added++;
}
list.videos.forEach((v, i) => (v.rank = v.rank || i + 1));

if (!added) console.log('Nothing new worth adding.');
else if (DRY) console.log('\n--dry: nothing written');
else {
  writeFileSync(WATCHLIST, JSON.stringify(list, null, 1) + '\n');
  console.log(`\nAdded ${added}. Library is now ${list.videos.length} videos.`);
}

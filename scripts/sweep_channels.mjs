/**
 * Weekly growth: pulls the public RSS feed of every trusted channel and adds
 * whatever is new.
 *
 * This is the backbone of keeping the library current, and it is deliberately
 * not the scraper. Search scraping gets soft-blocked, silently, and a scheduled
 * job that fails by returning nothing is worse than no job at all. RSS is a
 * documented public feed: no key, no quota, no rate limit, and it gives the
 * last 15 uploads per channel.
 *
 * A brand new video has almost no views, so the harvest's view floor would
 * reject everything RSS ever finds. Entry here is on channel trust instead:
 * this channel has already had videos survive the filters. scripts/prune.mjs
 * later drops whatever never found an audience, so the library self-corrects
 * rather than gate-keeping on a number that has not had time to happen.
 *
 * Run: node scripts/sweep_channels.mjs [--days 30] [--dry]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WATCHLIST = join(ROOT, 'data', 'watchlist.json');
const arg = (n, d) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : d);
const DAYS = Number(arg('days', 30));
const DRY = process.argv.includes('--dry');

const H = { 'user-agent': 'PubCrawl/1.0 (personal cocktail app; https://github.com/jainmrigank/the-pubcrawl)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { channels } = JSON.parse(readFileSync(join(ROOT, 'data', 'channels.json'), 'utf8'));
const list = JSON.parse(readFileSync(WATCHLIST, 'utf8'));
const have = new Set(list.videos.map((v) => v.id));

/* the same rules the harvest uses, so RSS cannot smuggle in what search could not */
const ON_TOPIC =
  /\b(cocktails?|bartend\w*|mixolog\w*|whisk(?:e?y)|bourbon|scotch|rum|gin|vodka|tequila|mezcal|brandy|cognac|liqueurs?|drinking|drunk|alcohol|booze|spirits?|margarita|martini|mojito|negroni|daiquiri|old.fashioned|highball|hangover|tipsy|distiller\w*|sake|soju|absinthe|vermouth|aperol|campari|liquor|sommelier|speakeasy|pub|shots?|beer|wine|amaro|bitters|syrup|garnish|shaker)\b/i;

const OFF_TOPIC =
  /\b(coca.?cola|pepsi|energy drinks?|soft drinks?|soda taste|boba|bubble tea|protein shake|smoothie recipe|coffee recipe|kids?|prank|mukbang|weight loss|vlog|food guide|places to eat|city guide|travel guide|things to do in|street food|full movie|episode \d+)\b|\b(?:movie|film)\b.*\b(?:explained|reaction|moments|scenes?|ranked|trailer|ending)\b|the hangover|hangover part|dramatizeme|dhar mann|bollywood/i;

function classify(title, fallback) {
  const t = title.toLowerCase();
  if (/\b(comedy|stand.?up|standup|funny|joke|sketch|drunk history|day drinking|roast|crowd work)\b/.test(t)) return 'comedy';
  if (/\b(first time|trying|try |taste test|blind|reacts?|reaction|guess|ranking|ranked|challenge|vs\.? )/.test(t)) return 'people';
  if (/\b(how to|guide|explained|basics|beginner|learn|tutorial|masterclass|lesson|course|tips|you need to know|should know|recipe)\b/.test(t)) return 'education';
  return fallback;
}

/** YouTube's feed is Atom; one <entry> per upload, newest first */
function parseFeed(xml) {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    id: e.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/)?.[1],
    title: (e.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim(),
    published: e.match(/<published>([^<]+)<\/published>/)?.[1] || '',
  }));
}

/**
 * RSS carries no duration, so a channel that posts Shorts all week would flood
 * the library with them. YouTube answers /shorts/<id> with a 200 only when the
 * video really is a Short; anything longer 303-redirects to /watch. That makes
 * the redirect the test.
 */
async function isShort(id) {
  try {
    const r = await fetch(`https://www.youtube.com/shorts/${id}`, {
      headers: H,
      redirect: 'manual',
      signal: AbortSignal.timeout(12000),
    });
    return r.status === 200;
  } catch {
    return false; // unreachable is not evidence either way
  }
}

/** alive, public and embeddable all at once */
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

const PER_CHANNEL = Number(arg('perchannel', 3));
const cutoff = Date.now() - DAYS * 86400000;
const found = [];
let feeds = 0;
let failed = 0;

for (const ch of channels) {
  let entries = [];
  try {
    const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch.id}`, {
      headers: H,
      signal: AbortSignal.timeout(20000),
    });
    if (r.ok) entries = parseFeed(await r.text());
    else failed++;
  } catch {
    failed++;
  }
  feeds++;
  await sleep(250);

  let takenHere = 0;
  for (const e of entries) {
    if (takenHere >= PER_CHANNEL) break;
    if (!e.id || have.has(e.id)) continue;
    if (Date.parse(e.published) < cutoff) continue;
    // the title alone has to be on topic. Including the channel name here let
    // every upload from "Liquor Store 352" through, baby announcements included.
    if (!ON_TOPIC.test(e.title) || OFF_TOPIC.test(`${e.title} ${ch.name}`)) continue;
    have.add(e.id);
    takenHere++;
    found.push({ id: e.id, title: e.title, channel: ch.name, lane: classify(e.title, ch.lane), published: e.published });
  }
  process.stdout.write(`\r  ${feeds}/${channels.length} feeds · ${found.length} new   `);
}
console.log(`\n\n${found.length} new uploads in the last ${DAYS} days (${failed} feeds unreachable).`);

if (!found.length) {
  console.log('Nothing to add.');
  process.exit(0);
}

console.log('\nChecking each is a real video, playable and embeddable...');
const live = [];
let shorts = 0;
for (const v of found) {
  if (await isShort(v.id)) {
    shorts++;
    await sleep(120);
    continue;
  }
  if (await playable(v.id)) live.push(v);
  await sleep(150);
}
console.log(`${live.length} good · ${shorts} Shorts · ${found.length - live.length - shorts} unplayable\n`);

const today = new Date().toISOString().slice(0, 10);
for (const v of live) {
  list.videos.push({ id: v.id, title: v.title, channel: v.channel, lane: v.lane, rank: 0, addedAt: today });
  console.log(`  + [${v.lane}] ${v.title.slice(0, 62)}  |  ${v.channel}`);
}
list.videos.forEach((v, i) => (v.rank = v.rank || i + 1));

if (DRY) console.log('\n--dry: nothing written');
else {
  writeFileSync(WATCHLIST, JSON.stringify(list, null, 1) + '\n');
  console.log(`\nLibrary is now ${list.videos.length} videos.`);
}

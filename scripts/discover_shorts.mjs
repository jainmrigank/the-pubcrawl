/** Monthly broader Shorts discovery through the existing YouTube Data API key.
 * Search duration is only a candidate filter (<4 minutes); inspectShort still
 * verifies that each result is an actual, embeddable, safe Short of <=180s.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_DURATION_SECONDS,
  ON_TOPIC,
  OFF_TOPIC,
  ROOT,
  classify,
  inspectShort,
  recipeQueryFor,
  sleep,
} from './shorts_common.mjs';

const KEY = process.env.YOUTUBE_API_KEY || '';
const arg = (name, fallback) => (process.argv.includes(`--${name}`) ? process.argv[process.argv.indexOf(`--${name}`) + 1] : fallback);
const MAX_QUERIES = Math.min(Number(arg('queries', 20)), 40);
const MAX_ADD = Number(arg('max', 12));
const DRY = process.argv.includes('--dry');
const SHORTS_FILE = join(ROOT, 'data', 'shorts.json');

if (!KEY) {
  console.error('YOUTUBE_API_KEY is not set. Monthly Shorts discovery needs the existing key.');
  if (DRY) {
    console.error('--dry: discovery skipped without a key; the weekly RSS sweep remains key-free.');
    process.exit(0);
  }
  process.exit(1);
}

const QUERIES = [
  ['craft', 'cocktail technique short bartender'], ['craft', 'bar tricks cocktail short'], ['craft', 'signature cocktail short bartender'],
  ['craft', 'cocktail garnish short'], ['craft', 'home bar cocktail short'], ['craft', 'ice cocktail short bartender'],
  ['education', 'how to make classic cocktail short'], ['education', 'cocktail basics short bartender'], ['education', 'spirits explained short'],
  ['education', 'whiskey tasting cocktail short'], ['education', 'gin cocktail recipe short'], ['education', 'rum cocktail recipe short'],
  ['education', 'tequila cocktail recipe short'], ['education', 'cocktail science short'], ['education', 'bitters vermouth short'],
  ['comedy', 'cocktail bartender comedy short'], ['comedy', 'drinking standup short'], ['comedy', 'bar sketch short'],
  ['people', 'blind cocktail taste test short'], ['people', 'bartender reacts cocktail short'], ['people', 'trying cocktails short'],
  ['people', 'whiskey taste test short'], ['people', 'people try cocktail short'], ['people', 'bartender guesses drink short'],
];

const api = async (path) => {
  const response = await fetch(`https://www.googleapis.com/youtube/v3/${path}&key=${KEY}`, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${response.status} ${(await response.text()).slice(0, 160)}`);
  return response.json();
};

const list = existsSync(SHORTS_FILE) ? JSON.parse(readFileSync(SHORTS_FILE, 'utf8')) : { shorts: [] };
const have = new Set((list.shorts || []).map((short) => short.id));
const candidates = new Map();
for (const [lane, query] of QUERIES.slice(0, MAX_QUERIES)) {
  try {
    const result = await api(`search?part=snippet&type=video&videoDuration=short&videoEmbeddable=true&order=date&maxResults=25&q=${encodeURIComponent(query)}`);
    for (const item of result.items || []) {
      const id = item.id?.videoId;
      const title = item.snippet?.title || '';
      const channel = item.snippet?.channelTitle || '';
      if (!id || have.has(id) || candidates.has(id) || !ON_TOPIC.test(title) || OFF_TOPIC.test(`${title} ${channel}`)) continue;
      candidates.set(id, {
        id,
        title,
        channel,
        channelId: item.snippet?.channelId || '',
        lane: classify(title, lane),
        published: item.snippet?.publishedAt || '',
        recipeQuery: recipeQueryFor(title),
      });
    }
  } catch (error) {
    console.error(`  query failed (${query}): ${error instanceof Error ? error.message : error}`);
    if (/quota/i.test(String(error))) break;
  }
  process.stdout.write(`\r  ${Math.min(candidates.size, 999)} candidates · ${query}   `);
}
console.log(`\n\n${candidates.size} API candidates. Running the actual Shorts and safety checks...`);

const verified = [];
const queue = [...candidates.values()];
await Promise.all(Array.from({ length: 8 }, async () => {
  for (let candidate = queue.pop(); candidate; candidate = queue.pop()) {
    const result = await inspectShort(candidate);
    if (result.ok && result.durationSeconds <= MAX_DURATION_SECONDS) verified.push({ ...candidate, ...result });
    await sleep(100);
  }
}));

const perChannel = new Map();
const additions = [];
for (const candidate of verified.sort((a, b) => Date.parse(b.published) - Date.parse(a.published))) {
  if (additions.length >= MAX_ADD) break;
  const channelKey = candidate.channelId || candidate.channel;
  const count = perChannel.get(channelKey) || 0;
  if (count >= 2) continue;
  perChannel.set(channelKey, count + 1);
  additions.push({
    id: candidate.id,
    title: candidate.title,
    channel: candidate.channel,
    channelId: candidate.channelId,
    lane: candidate.lane,
    rank: 0,
    addedAt: new Date().toISOString().slice(0, 10),
    publishedAt: candidate.published,
    durationSeconds: candidate.durationSeconds,
    thumbnail: candidate.thumbnail || `https://i.ytimg.com/vi/${candidate.id}/hqdefault.jpg`,
    ...(candidate.recipeQuery ? { recipeQuery: candidate.recipeQuery } : {}),
    evergreen: false,
  });
}

for (const short of additions) console.log(`  + [${short.lane}] ${short.title.slice(0, 66)} | ${short.channel}`);
if (!additions.length) process.exit(0);
const next = [...(list.shorts || []), ...additions].slice(-180);
next.forEach((short, index) => (short.rank = index + 1));
if (DRY) console.log(`\n--dry: nothing written (would hold ${next.length} Shorts)`);
else {
  writeFileSync(SHORTS_FILE, JSON.stringify({ ...list, shorts: next }, null, 1) + '\n');
  console.log(`\nShorts catalogue is now ${next.length} entries.`);
}

/**
 * Weekly Shorts curation from the same trusted-channel RSS feeds as Watch.
 *
 * RSS is free and quota-free. Every candidate still has to pass the explicit
 * /shorts URL check, public/embeddable oEmbed check, duration check, safety
 * terms, and the two-per-channel cap before it can enter the review diff.
 * Run with --bootstrap once to fill the launch catalogue; normal Mondays add
 * at most 12 entries.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  H,
  MAX_DURATION_SECONDS,
  ON_TOPIC,
  OFF_TOPIC,
  ROOT,
  classify,
  fetchText,
  inspectShort,
  parseFeed,
  readTrustedChannels,
  recipeQueryFor,
  sleep,
} from './shorts_common.mjs';

const arg = (name, fallback) => (process.argv.includes(`--${name}`) ? process.argv[process.argv.indexOf(`--${name}`) + 1] : fallback);
const DAYS = Number(arg('days', process.argv.includes('--bootstrap') ? 730 : 14));
const PER_CHANNEL = Number(arg('perchannel', process.argv.includes('--bootstrap') ? 6 : 2));
const MAX_ADD = Number(arg('max', process.argv.includes('--bootstrap') ? 180 : 12));
const DRY = process.argv.includes('--dry');
const SHORTS_FILE = join(ROOT, 'data', 'shorts.json');
const list = existsSync(SHORTS_FILE) ? JSON.parse(readFileSync(SHORTS_FILE, 'utf8')) : { shorts: [] };
const existing = new Set((list.shorts || []).map((short) => short.id));
const channels = readTrustedChannels();
const cutoff = Date.now() - DAYS * 86400000;
const candidates = [];
let feeds = 0;
let failed = 0;

for (const channel of channels) {
  let entries = [];
  try {
    const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channel.id}`, { headers: H, signal: AbortSignal.timeout(20000) });
    entries = parseFeed(xml);
  } catch {
    failed++;
  }
  feeds++;
  let taken = 0;
  for (const entry of entries) {
    if (taken >= PER_CHANNEL || candidates.length >= MAX_ADD * 5) break;
    if (!entry.id || existing.has(entry.id) || Date.parse(entry.published) < cutoff) continue;
    if (!ON_TOPIC.test(entry.title) || OFF_TOPIC.test(`${entry.title} ${channel.name}`)) continue;
    existing.add(entry.id);
    candidates.push({
      ...entry,
      channel: channel.name,
      channelId: channel.id,
      lane: classify(entry.title, channel.lane),
      recipeQuery: recipeQueryFor(entry.title),
    });
    taken++;
  }
  process.stdout.write(`\r  ${feeds}/${channels.length} feeds · ${candidates.length} candidates   `);
}
console.log(`\n\n${candidates.length} candidates from ${feeds - failed}/${feeds} feeds.`);

const verified = [];
const queue = [...candidates];
await Promise.all(
  Array.from({ length: 8 }, async () => {
    for (let candidate = queue.pop(); candidate; candidate = queue.pop()) {
      const result = await inspectShort(candidate);
      if (result.ok && result.durationSeconds <= MAX_DURATION_SECONDS) {
        verified.push({ ...candidate, ...result });
      }
      await sleep(100);
    }
  })
);
console.log(`${verified.length} passed the Shorts, safety, duration, and embed checks.`);

const perChannel = new Map();
const additions = [];
const today = new Date().toISOString().slice(0, 10);
for (const candidate of verified.sort((a, b) => Date.parse(b.published) - Date.parse(a.published))) {
  if (additions.length >= MAX_ADD) break;
  const count = perChannel.get(candidate.channelId) || 0;
  if (count >= PER_CHANNEL) continue;
  perChannel.set(candidate.channelId, count + 1);
  additions.push({
    id: candidate.id,
    title: candidate.title,
    channel: candidate.channel,
    channelId: candidate.channelId,
    lane: candidate.lane,
    rank: 0,
    addedAt: today,
    publishedAt: candidate.published,
    durationSeconds: candidate.durationSeconds,
    thumbnail: candidate.thumbnail || `https://i.ytimg.com/vi/${candidate.id}/hqdefault.jpg`,
    ...(candidate.recipeQuery ? { recipeQuery: candidate.recipeQuery } : {}),
    evergreen: false,
  });
}

for (const short of additions) console.log(`  + [${short.lane}] ${short.title.slice(0, 66)} | ${short.channel} (${short.durationSeconds}s)`);
if (!additions.length) {
  console.log('Nothing new to add.');
  process.exit(0);
}

const next = [...(list.shorts || []), ...additions].slice(-180);
next.forEach((short, index) => (short.rank = index + 1));
if (DRY) {
  console.log(`\n--dry: nothing written (would hold ${next.length} Shorts)`);
} else {
  writeFileSync(SHORTS_FILE, JSON.stringify({ ...list, shorts: next }, null, 1) + '\n');
  console.log(`\nShorts catalogue is now ${next.length} entries.`);
}

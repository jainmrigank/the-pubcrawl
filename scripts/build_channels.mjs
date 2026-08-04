/**
 * Builds data/channels.json: the channels the library already trusts, with the
 * UC… ids their RSS feeds need.
 *
 * A channel earns a place by already having had videos survive the harvest and
 * the junk filters, so this is derived from the library rather than guessed at.
 * The id is read off a real watch page for one of its videos, because the only
 * reliable way to get a channel id is to ask YouTube for one.
 *
 * Run: node scripts/build_channels.mjs [--min 2]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'channels.json');
const MIN = Number(process.argv.includes('--min') ? process.argv[process.argv.indexOf('--min') + 1] : 2);

const H = {
  cookie: 'CONSENT=YES+cb',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'accept-language': 'en-US,en;q=0.9',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const videos = JSON.parse(readFileSync(join(ROOT, 'data', 'watchlist.json'), 'utf8')).videos;
const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { channels: [] };
const known = new Map(existing.channels.map((c) => [c.name, c]));

/* how many videos each channel has, and which lane it mostly belongs to */
const byChannel = new Map();
for (const v of videos) {
  const c = byChannel.get(v.channel) || { name: v.channel, count: 0, lanes: {}, sample: v.id };
  c.count++;
  c.lanes[v.lane] = (c.lanes[v.lane] || 0) + 1;
  byChannel.set(v.channel, c);
}

const trusted = [...byChannel.values()]
  .filter((c) => c.count >= MIN)
  .sort((a, b) => b.count - a.count);

console.log(`${trusted.length} channels with ${MIN}+ videos in the library.\n`);

const out = [];
for (const c of trusted) {
  if (known.has(c.name)) {
    out.push(known.get(c.name));
    continue;
  }
  let id = null;
  try {
    const html = await (await fetch(`https://www.youtube.com/watch?v=${c.sample}`, {
      headers: H,
      signal: AbortSignal.timeout(20000),
    })).text();
    id = html.match(/"channelId":"(UC[\w-]{22})"/)?.[1] || null;
  } catch {
    /* one unreachable page should not stop the build */
  }
  await sleep(700);
  if (!id) {
    console.log(`  no id  ${c.name}`);
    continue;
  }
  const lane = Object.entries(c.lanes).sort((a, b) => b[1] - a[1])[0][0];
  out.push({ id, name: c.name, lane, videos: c.count });
  console.log(`  ${id}  ${c.name} (${c.count}, ${lane})`);
}

writeFileSync(OUT, JSON.stringify({ _comment: 'Channels the library already trusts. Swept weekly for new uploads via their public RSS feeds, which need no API key and no quota. `lane` is the default kind for a new upload when its title does not say otherwise.', channels: out }, null, 1) + '\n');
console.log(`\nWrote ${out.length} channels to ${OUT}`);

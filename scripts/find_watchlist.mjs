/**
 * Curation aid for data/watchlist.json. Searches YouTube for the kinds of
 * videos the Watch shelf is meant to hold, checks each one is actually alive
 * and embeddable, and prints candidates grouped by lane.
 *
 * This is not run by the app or by CI. It exists so the watchlist is built
 * from ids that were verified to exist rather than remembered, which is how
 * you end up with dead embeds.
 *
 * Run: node scripts/find_watchlist.mjs [lane]
 */
const H = {
  cookie: 'CONSENT=YES+cb',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'accept-language': 'en-US,en;q=0.9',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const QUERIES = {
  craft: [
    'japanese bartender cocktail technique',
    'best bartender in the world cocktail',
    'craft cocktail bar behind the scenes',
    'cocktail garnish technique masterclass',
  ],
  education: [
    'cocktails you need to know bartender',
    'how to make classic cocktails at home beginner',
    'bartending basics fundamentals',
    'cocktail history explained',
  ],
  comedy: [
    'day drinking seth meyers',
    'stand up comedy about drinking',
    'comedian drunk bit special',
  ],
  people: [
    'trying alcohol for the first time reaction',
    'people try cocktails blind taste test',
    'bartender guesses drink order',
  ],
};

async function searchIds(query) {
  const r = await fetch('https://www.youtube.com/results?search_query=' + encodeURIComponent(query), {
    headers: H,
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) return [];
  const html = await r.text();
  return [...new Set([...html.matchAll(/"videoId":"([\w-]{11})"/g)].map((m) => m[1]))].slice(0, 8);
}

/** alive, public, and embeddable: oEmbed 200s only when all three hold */
async function check(id) {
  try {
    const r = await fetch('https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=' + id, {
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return { id, title: j.title, channel: j.author_name };
  } catch {
    return null;
  }
}

const only = process.argv[2];
const seen = new Set();

for (const [lane, queries] of Object.entries(QUERIES)) {
  if (only && lane !== only) continue;
  console.log(`\n${'='.repeat(70)}\n${lane.toUpperCase()}\n${'='.repeat(70)}`);
  for (const q of queries) {
    console.log(`\n  ~ ${q}`);
    const ids = await searchIds(q);
    await sleep(600);
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const v = await check(id);
      await sleep(180);
      if (!v) continue;
      console.log(`    ${v.id}  ${v.title.slice(0, 68)}`);
      console.log(`    ${' '.repeat(11)}[${v.channel}]`);
    }
  }
}
console.log(`\n${seen.size} unique ids checked.`);

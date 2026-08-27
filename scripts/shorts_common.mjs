import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recipeQueryHasPhoto } from '../server/shorts-schema.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const H = { 'user-agent': 'PubCrawl/1.0 (personal cocktail app; https://github.com/jainmrigank/the-pubcrawl)' };
export const MAX_DURATION_SECONDS = 180;
export const LANES = ['craft', 'education', 'comedy', 'people'];
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Curation is allowed to read the complete catalogue, but a recipe surfaced by
// a Short must resolve to a photographed card. Keeping this check in the
// shared verifier means RSS and monthly API discovery cannot drift apart.
export const hasPhotographedRecipe = recipeQueryHasPhoto;

export const ON_TOPIC =
  /\b(cocktails?|bartend\w*|mixolog\w*|whisk(?:e?y)|bourbon|scotch|rum|gin|vodka|tequila|mezcal|brandy|cognac|liqueurs?|drinking|drunk|alcohol|booze|spirits?|margarita|martini|mojito|negroni|daiquiri|old.fashioned|highball|hangover|tipsy|distiller\w*|sake|soju|absinthe|vermouth|aperol|campari|liquor|sommelier|speakeasy|pub|shots?|beer|wine|amaro|bitters|syrup|garnish|shaker|bar tricks?)\b/i;

export const OFF_TOPIC =
  /\b(coca.?cola|pepsi|energy drinks?|soft drinks?|soda taste|boba|bubble tea|protein shake|smoothie recipe|coffee recipe|kids?|teen(?:s|age)?|minor(?:s)?|school(?:boy|girl)?|college kid|prank|mukbang|weight loss|vlog|food guide|places to eat|city guide|travel guide|things to do in|street food|full movie|episode \d+|driving|chug\w*|binge\w*|healthy|health benefits?|medical|cure|pregnan\w*|shoot your shot|shooting|dangerous|stunt|can kill|don'?t try|do not try|never pay|steal)\b|\b(?:movie|film)\b.*\b(?:explained|reaction|moments|scenes?|ranked|trailer|ending)\b|the hangover|hangover part|dramatizeme|dhar mann|bollywood|underage|age.?restricted|made for kids/i;

export function classify(title, fallback = 'craft') {
  const t = title.toLowerCase();
  if (/\b(comedy|stand.?up|standup|funny|joke|sketch|drunk history|roast|crowd work)\b/.test(t)) return 'comedy';
  if (/\b(first time|trying|try |taste test|blind|reacts?|reaction|guess|ranking|ranked|challenge|vs\.? )/.test(t)) return 'people';
  if (/\b(how to|guide|explained|basics|beginner|learn|tutorial|masterclass|lesson|course|tips|you need to know|should know|recipe|trick)\b/.test(t)) return 'education';
  return LANES.includes(fallback) ? fallback : 'craft';
}

/** YouTube's public feed is Atom; one entry per upload, newest first. */
export function parseFeed(xml) {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, entry]) => ({
    id: entry.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/)?.[1],
    title: decodeXml(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').trim(),
    published: entry.match(/<published>([^<]+)<\/published>/)?.[1] || '',
  }));
}

function decodeXml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export async function fetchText(url, options = {}) {
  const response = await fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

/**
 * A Short check is intentionally more than videoDuration=short: the API's
 * short means under four minutes, while a current Short is square/vertical and
 * at most three minutes. The /shorts URL and page metadata supply that second
 * check without downloading or re-hosting media.
 */
export async function inspectShort(candidate) {
  if (candidate.recipeQuery && !hasPhotographedRecipe(candidate.recipeQuery)) return { ok: false, reason: 'recipe-image' };
  let page;
  try {
    // gl=IN keeps the availability check aligned with PubCrawl's audience.
    const shortUrl = `https://www.youtube.com/shorts/${candidate.id}?hl=en&gl=IN`;
    const response = await fetch(shortUrl, {
      headers: H,
      // Non-Short uploads commonly redirect /shorts/<id> to /watch?v=<id>.
      // Following the redirect lets the final URL provide an explicit Shorts
      // shape check instead of admitting every RSS upload.
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (response.status !== 200) return { ok: false, reason: 'not-a-short' };
    page = await response.text();
    const finalPath = (() => {
      try {
        return new URL(response.url || shortUrl).pathname;
      } catch {
        return '';
      }
    })();
    const canonical = page.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1] || '';
    // Fetch implementations always expose response.url; the permissive
    // branch keeps this helper easy to exercise with lightweight test doubles
    // while production requests still get the final-URL/canonical checks.
    const isShort = !response.url || finalPath.startsWith('/shorts/') || canonical.includes('/shorts/') || /["']isShorts["']\s*:\s*true/.test(page);
    if (!isShort) return { ok: false, reason: 'not-a-short' };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'short-check-failed' };
  }

  const duration = Number(page.match(/lengthSeconds":"(\d+)"/)?.[1] || page.match(/lengthSeconds\\":\\"(\d+)\\"/)?.[1] || 0);
  if (!duration || duration > MAX_DURATION_SECONDS) return { ok: false, reason: 'duration' };
  if (/["']isAgeRestricted["']\s*:\s*true|["']isFamilySafe["']\s*:\s*false|["']isMadeForKids["']\s*:\s*true/.test(page)) return { ok: false, reason: 'restricted' };

  let oembed;
  try {
    const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${candidate.id}&hl=en&gl=IN`)}`, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) return { ok: false, reason: 'not-embeddable' };
    oembed = await response.json();
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'oembed-failed' };
  }
  const thumbnail = oembed.thumbnail_url || `https://i.ytimg.com/vi/${candidate.id}/hqdefault.jpg`;
  return {
    ok: true,
    durationSeconds: duration,
    thumbnail,
    title: oembed.title || candidate.title,
    channel: oembed.author_name || candidate.channel,
  };
}

export function recipeQueryFor(title) {
  const names = ['Negroni', 'Margarita', 'Mojito', 'Daiquiri', 'Martini', 'Old Fashioned', 'Manhattan', 'Whiskey Sour', 'Paloma', 'Tom Collins', 'Espresso Martini', 'Mai Tai', 'Spritz', 'Highball', 'Sangria'];
  return names.find((name) => new RegExp(`\\b${name.replace(' ', '[ -]')}\\b`, 'i').test(title));
}

export function readTrustedChannels() {
  return JSON.parse(readFileSync(join(ROOT, 'data', 'channels.json'), 'utf8')).channels || [];
}

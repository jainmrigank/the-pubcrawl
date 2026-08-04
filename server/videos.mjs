/**
 * The Watch shelf: a curated library of cocktail and drinking videos, sorted
 * into three views.
 *
 *   allTime   the biggest of them, by lifetime views
 *   rising    what is moving right now, plus what we added this month
 *   pool      everything, for the shuffle
 *
 * Curation lives in data/watchlist.json, in git, where a change is reviewable
 * in a diff. View counts live in the store, written by a scheduled refresh.
 * The two never mix, so a failed stats fetch can degrade the ordering but can
 * never corrupt the library.
 *
 * With no YOUTUBE_API_KEY configured there are simply no numbers, and every
 * shelf falls back to the curated `rank`. The page looks the same minus the
 * view counts, which is the right way for this to fail.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = join(ROOT, 'data', 'watchlist.json');

const raw = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { videos: [] };
export const VIDEOS = (raw.videos || []).filter((v) => v.id && v.title);

export const LANES = {
  craft: { id: 'craft', label: 'The Craft', color: '#8A5A24' },
  education: { id: 'education', label: 'Learn It', color: '#5C7A3B' },
  comedy: { id: 'comedy', label: 'For The Laugh', color: '#4A4E7A' },
  people: { id: 'people', label: 'People & Drink', color: '#8E4A5B' },
};

const DAY = 86400000;
const SHELF = 15;

/** views over the last ~30 days, from whatever snapshots we have */
function movement(stat) {
  const h = stat?.history;
  if (!Array.isArray(h) || h.length < 2 || !stat.views) return 0;
  const cutoff = Date.now() - 30 * DAY;
  // the oldest snapshot still inside the window, else the oldest we hold
  const old = h.find((p) => p.at >= cutoff) || h[0];
  const delta = stat.views - old.views;
  return delta > 0 ? delta : 0;
}

const addedWithin = (v, days) => {
  const t = Date.parse(v.addedAt || '');
  return Number.isFinite(t) && Date.now() - t <= days * DAY;
};

/**
 * Join curation with statistics. Videos the refresh has marked dead are
 * dropped here rather than in the client, so a broken embed never reaches
 * anyone's screen.
 */
export function buildShelves(stats = {}) {
  const live = VIDEOS.filter((v) => !stats[v.id]?.dead).map((v) => {
    const s = stats[v.id] || {};
    return {
      ...v,
      lane: LANES[v.lane] ? v.lane : 'craft',
      views: s.views ?? null,
      likes: s.likes ?? null,
      movement: movement(s),
    };
  });

  const hasNumbers = live.some((v) => v.views != null);
  const byRank = (a, b) => a.rank - b.rank;

  const allTime = [...live]
    .sort((a, b) => (hasNumbers ? (b.views || 0) - (a.views || 0) || a.rank - b.rank : a.rank - b.rank))
    .slice(0, SHELF);

  /*
   * "Rising" is deliberately two things at once, because either alone is thin:
   * what is genuinely moving (view growth we measured ourselves, since YouTube
   * will not tell you a video's views *this month*), and what we put on the
   * shelf this month.
   *
   * On a fresh install neither exists: nothing has been counted yet and the
   * whole library was seeded on one day, so "added this month" means all of it
   * and the shelf would be a carbon copy of All Time. In that case it becomes
   * Just Added and shows the far end of the curation instead, so the two
   * shelves never hold the same fifteen videos.
   */
  const movers = live.filter((v) => v.movement > 0).sort((a, b) => b.movement - a.movement);
  const seededInOneGo = new Set(live.map((v) => v.addedAt)).size <= 1;
  const fresh = seededInOneGo
    ? []
    : live.filter((v) => addedWithin(v, 31)).sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt) || a.rank - b.rank);

  const rising = [];
  const seen = new Set();
  for (const v of [...movers, ...fresh]) {
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    rising.push({ ...v, why: v.movement > 0 ? 'climbing' : 'new here' });
    if (rising.length >= SHELF) break;
  }

  // nothing to say yet: fall back to the other end of the shelf
  const risingMode = rising.length ? 'climbing' : 'fresh';
  if (!rising.length) rising.push(...[...live].sort((a, b) => b.rank - a.rank).slice(0, SHELF));

  return {
    allTime,
    rising,
    risingMode,
    pool: live,
    lanes: Object.values(LANES),
    hasNumbers,
    updatedAt: Math.max(0, ...Object.values(stats).map((s) => s?.checkedAt || 0)) || null,
  };
}

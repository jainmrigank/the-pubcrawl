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

/** IDs used by the static landing Watch teaser (three per lane). */
export const LANDING_FEATURED_IDS = [
  'i1iqVGORUck', 'ml_KwtaTC-A', 'OIVGM79KvDQ',
  'b0IuTL3Z-kk', 'c6GV_vRlIIA', 'pdcrJ5V7YKM',
  'GE8vyfKyZfQ', 'X3n5Pk8fkLg', 'ZFvup0aXRsU',
  'UckkY0rrsAM', 'RGOWPswqRwc', 'gIg1gAy4lVg',
];

export const LANES = {
  craft: { id: 'craft', label: 'The Craft', color: '#8A5A24' },
  education: { id: 'education', label: 'Learn It', color: '#5C7A3B' },
  comedy: { id: 'comedy', label: 'For The Laugh', color: '#4A4E7A' },
  people: { id: 'people', label: 'People & Drink', color: '#8E4A5B' },
};

const DAY = 86400000;

/** views gained over the last ~30 days, from whatever snapshots we hold */
export function movement(stat) {
  const h = stat?.history;
  if (!Array.isArray(h) || h.length < 2 || !stat.views) return 0;
  const cutoff = Date.now() - 30 * DAY;
  const old = h.find((p) => p.at >= cutoff) || h[0];
  const delta = stat.views - old.views;
  return delta > 0 ? delta : 0;
}

/**
 * Join curation with statistics and hand the whole library over. Sorting,
 * searching and slicing all happen in the browser: the payload is small, and
 * doing it client-side means filtering feels instant instead of costing a
 * round trip per keystroke.
 *
 * Videos the weekly refresh marked dead are dropped here rather than in the
 * client, so a broken embed never reaches anyone's screen.
 */
export function buildLibrary(stats = {}) {
  const videos = VIDEOS.filter((v) => !stats[v.id]?.dead).map((v) => {
    const s = stats[v.id] || {};
    return {
      ...v,
      lane: LANES[v.lane] ? v.lane : 'craft',
      views: s.views ?? null,
      likes: s.likes ?? null,
      movement: movement(s),
      landingFeatured: Boolean(v.landingFeatured),
    };
  });

  return {
    videos,
    lanes: Object.values(LANES),
    hasNumbers: videos.some((v) => v.views != null),
    updatedAt: Math.max(0, ...Object.values(stats).map((s) => s?.checkedAt || 0)) || null,
  };
}

/** Validate the reviewed landing set against the latest health snapshot. */
export function validateLandingFeatured(stats = {}) {
  const byId = new Map(VIDEOS.map((video) => [video.id, video]));
  const missing = LANDING_FEATURED_IDS.filter((id) => !byId.has(id));
  const dead = LANDING_FEATURED_IDS.filter((id) => stats?.[id]?.dead);
  const lanes = new Map();
  for (const id of LANDING_FEATURED_IDS) {
    const lane = byId.get(id)?.lane;
    if (lane) lanes.set(lane, (lanes.get(lane) || 0) + 1);
  }
  const distribution = Object.fromEntries(lanes);
  return {
    ok: missing.length === 0 && dead.length === 0 && Object.values(distribution).length === 4 && Object.values(distribution).every((count) => count === 3),
    missing,
    dead,
    distribution,
  };
}

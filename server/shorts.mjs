/**
 * The Shorts shelf. Metadata is reviewed in data/shorts.json; counters are
 * joined from the same durable store used by Watch. No video bytes ever pass
 * through this server.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANES, movement } from './videos.mjs';
import { recipeQueryHasPhoto, validateShort } from './shorts-schema.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = join(ROOT, 'data', 'shorts.json');
const raw = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { shorts: [] };

export const SHORTS = (raw.shorts || [])
  .filter((short) => validateShort(short).ok && (!short.recipeQuery || recipeQueryHasPhoto(short.recipeQuery)))
  .slice(0, 180);

export function buildShortLibrary(stats = {}) {
  const shorts = SHORTS.filter((short) => !stats[short.id]?.dead).map((short) => {
    const s = stats[short.id] || {};
    return {
      ...short,
      lane: LANES[short.lane] ? short.lane : 'craft',
      views: s.views ?? null,
      likes: s.likes ?? null,
      movement: movement(s),
    };
  });
  const ids = new Set(SHORTS.map((short) => short.id));
  return {
    shorts,
    lanes: Object.values(LANES),
    hasNumbers: shorts.some((short) => short.views != null),
    updatedAt: Math.max(0, ...Object.entries(stats).filter(([id]) => ids.has(id)).map(([, s]) => s?.checkedAt || 0)) || null,
  };
}

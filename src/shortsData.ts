import type { ShortVideo } from './types';
import raw from '../data/shorts.json?raw';
import policy from '../data/shorts-policy.json';

const FALLBACK_THUMBNAIL = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const LANES = new Set(['craft', 'education', 'comedy', 'people']);

function validShort(value: unknown): value is ShortVideo {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<ShortVideo>;
  return (
    typeof v.id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(v.id) &&
    typeof v.title === 'string' && Boolean(v.title.trim()) &&
    typeof v.channel === 'string' && Boolean(v.channel.trim()) &&
    typeof v.channelId === 'string' && Boolean(v.channelId.trim()) &&
    typeof v.lane === 'string' && LANES.has(v.lane) &&
    Number.isInteger(v.rank) && Number(v.rank) > 0 &&
    typeof v.addedAt === 'string' && typeof v.publishedAt === 'string' &&
    Number.isFinite(v.durationSeconds) && Number(v.durationSeconds) >= 1 && Number(v.durationSeconds) <= policy.maxDurationSeconds
  );
}

let parsed: unknown;
try {
  parsed = JSON.parse(raw);
} catch {
  parsed = null;
}

const reviewed = (Array.isArray(parsed) ? parsed : (parsed as { shorts?: unknown[] } | null)?.shorts || [])
  .filter(validShort);

if (reviewed.length > policy.maxEntries) {
  throw new Error(`Shorts catalogue has ${reviewed.length} valid entries; maximum is ${policy.maxEntries}`);
}

/** Build-time fallback: the landing teaser never waits for Render to wake. */
export const SHORTS_SEED: ShortVideo[] = reviewed
  .map((short) => ({ ...short, thumbnail: short.thumbnail || FALLBACK_THUMBNAIL(short.id) }));

export const thumbnailForShort = (short: Pick<ShortVideo, 'id' | 'thumbnail'>) => short.thumbnail || FALLBACK_THUMBNAIL(short.id);

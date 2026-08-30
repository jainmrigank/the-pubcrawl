import raw from '../data/watchlist.json?raw';
import type { WatchLane, WatchLibrary, WatchVideo } from './types';
import { WATCH_LANES } from './watchData';

export const STATIC_WATCH_LANES: WatchLane[] = WATCH_LANES;

const LANE_IDS = new Set(STATIC_WATCH_LANES.map((lane) => lane.id));

function validVideo(value: unknown): value is Omit<WatchVideo, 'views' | 'likes' | 'movement'> {
  if (!value || typeof value !== 'object') return false;
  const video = value as Partial<WatchVideo>;
  return (
    typeof video.id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(video.id) &&
    typeof video.title === 'string' && Boolean(video.title.trim()) &&
    typeof video.channel === 'string' && Boolean(video.channel.trim()) &&
    typeof video.lane === 'string' && LANE_IDS.has(video.lane) &&
    Number.isInteger(video.rank) && Number(video.rank) > 0 &&
    typeof video.addedAt === 'string' && Boolean(video.addedAt)
  );
}

export function buildStaticWatchLibrary(value: unknown): WatchLibrary {
  const source = value && typeof value === 'object' ? value as { videos?: unknown[] } : null;
  const seen = new Set<string>();
  const videos = (Array.isArray(source?.videos) ? source.videos : [])
    .filter(validVideo)
    .filter((video) => {
      if (seen.has(video.id)) return false;
      seen.add(video.id);
      return true;
    })
    .map((video) => ({
      ...video,
      views: null,
      likes: null,
      movement: 0,
      landingFeatured: Boolean(video.landingFeatured),
    }));

  return {
    videos,
    lanes: STATIC_WATCH_LANES,
    hasNumbers: false,
    updatedAt: null,
  };
}

let parsed: unknown = null;
try {
  parsed = JSON.parse(raw);
} catch {
  parsed = null;
}

/** Reviewed fallback, loaded as its own chunk only when the Watch route opens. */
export const STATIC_WATCH_LIBRARY = buildStaticWatchLibrary(parsed);

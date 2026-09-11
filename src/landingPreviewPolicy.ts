import type { ShortVideo } from './types.ts';
import { sampleUnique, type RandomSource } from './random.ts';

export const LANDING_SHORTS_COUNT = 6;

export function selectLandingShorts(
  shorts: readonly ShortVideo[],
  random: RandomSource = Math.random,
): ShortVideo[] {
  return sampleUnique(
    shorts.filter((short) => /^[A-Za-z0-9_-]{11}$/.test(short.id)),
    LANDING_SHORTS_COUNT,
    (short) => short.id,
    random,
  );
}

export interface Rectangle {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

/** Visible-area ratio inside both the page viewport and horizontal rail. */
export function previewVisibilityRatio(card: Rectangle, viewport: Rectangle, rail: Rectangle): number {
  if (card.width <= 0 || card.height <= 0) return 0;
  const left = Math.max(card.left, viewport.left, rail.left);
  const right = Math.min(card.right, viewport.right, rail.right);
  const top = Math.max(card.top, viewport.top, rail.top);
  const bottom = Math.min(card.bottom, viewport.bottom, rail.bottom);
  const area = Math.max(0, right - left) * Math.max(0, bottom - top);
  return Math.max(0, Math.min(1, area / (card.width * card.height)));
}

export function nextEligiblePreview(
  ids: readonly string[],
  completed: ReadonlySet<string>,
): string | null {
  return ids.find((id) => !completed.has(id)) || null;
}

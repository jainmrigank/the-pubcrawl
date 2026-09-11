import { shuffle, type RandomSource } from './random.ts';
import type { ShortVideo } from './types.ts';

/** Build one stable, duplicate-free order for a fresh Shorts route visit. */
export function createShortsVisitOrder(
  shorts: readonly ShortVideo[],
  requestedId = '',
  random: RandomSource = Math.random,
): ShortVideo[] {
  const seen = new Set<string>();
  const eligible = shorts.filter((short) => {
    if (!/^[A-Za-z0-9_-]{11}$/.test(short.id) || seen.has(short.id)) return false;
    seen.add(short.id);
    return true;
  });
  const requested = eligible.find((short) => short.id === requestedId);
  const remainder = requested ? eligible.filter((short) => short.id !== requested.id) : eligible;
  return requested ? [requested, ...shuffle(remainder, random)] : shuffle(remainder, random);
}

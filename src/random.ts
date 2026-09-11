export type RandomSource = () => number;

function unitInterval(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(0.9999999999999999, value));
}

/** A non-mutating Fisher-Yates shuffle with injectable randomness for tests. */
export function shuffle<T>(items: readonly T[], random: RandomSource = Math.random): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(unitInterval(random()) * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

/** Deduplicate first, then sample without replacement from the full pool. */
export function sampleUnique<T>(
  items: readonly T[],
  count: number,
  identity: (item: T) => string,
  random: RandomSource = Math.random,
): T[] {
  const seen = new Set<string>();
  const eligible = items.filter((item) => {
    const id = identity(item);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return shuffle(eligible, random).slice(0, Math.max(0, Math.floor(count)));
}

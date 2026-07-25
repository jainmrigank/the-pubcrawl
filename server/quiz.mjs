/**
 * The quiz bank, plus the two ways it's served:
 *   playlistSlice()  an endless ramped run, streamed in batches
 *   questionOfDay()  one question, the same for everyone, rotating daily
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = join(ROOT, 'data', 'quiz.json');
export const QUESTIONS = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];

/**
 * Deterministic PRNG (mulberry32) so a run's playlist is stable across batch
 * requests. Every step goes through Math.imul: a plain `h * 1103515245`
 * overflows past 2^53, loses its low bits and degenerates into long runs of
 * near-identical values, which is enough to leave a shuffle barely shuffled.
 */
function rng(seedStr) {
  let h = 2166136261;
  for (const ch of String(seedStr)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(arr, rand) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const WINDOW = 25; // questions per rung of the ladder
const RAMP = [
  [3, 6],
  [4, 7],
  [5, 8],
  [6, 9],
];
const STEADY = [6, 9]; // where it stays once the ladder runs out

/**
 * One endless run, no question twice.
 *
 * Difficulty climbs in blocks of 25 rather than by strict tier, so the first
 * question can already be a 6 and the run bites long before the old version
 * did (reaching a 9 used to take 301 correct answers, which nobody was ever
 * going to do). Each block draws at random from a sliding band — 3–6, then
 * 4–7, 5–8, 6–9 — and past 100 it holds at 6–9 until that band is spent. Only
 * then do the easy questions nobody happened to draw come back, so a run that
 * goes all the way ends on the whole bank rather than a subset.
 */
function playlist(seed) {
  const rand = rng(seed);
  // one shuffled pool, drawn from without replacement: a question the run has
  // already served is simply no longer in it
  let pool = shuffled(QUESTIONS, rand);
  const out = [];

  /**
   * Move up to `n` questions of difficulty lo..hi from the pool into the run.
   * The band is re-shuffled on every draw rather than read off the front of the
   * pool: earlier windows strip their own difficulties out of the front, which
   * would leave it stacked with whatever no previous band touched — enough to
   * hand out a whole block of nothing but 8s.
   */
  const draw = (lo, hi, n) => {
    const band = pool.filter((q) => q.d >= lo && q.d <= hi);
    if (!band.length) return 0;
    const picked = shuffled(band, rand).slice(0, n);
    const taken = new Set(picked);
    pool = pool.filter((q) => !taken.has(q));
    out.push(...picked);
    return picked.length;
  };

  for (const [lo, hi] of RAMP) draw(lo, hi, WINDOW);
  while (draw(STEADY[0], STEADY[1], WINDOW) > 0);
  out.push(...pool); // the unused easy ones, already shuffled
  return out;
}

/** A slice of the run, so the client can keep pouring questions as it goes. */
export function playlistSlice(seed, from = 0, count = 20) {
  const list = playlist(seed);
  return { questions: list.slice(from, from + count), total: list.length };
}

/** Same question for everyone on a given day, rotating through the bank. */
export function questionOfDay(date = new Date()) {
  if (!QUESTIONS.length) return null;
  const day = Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000
  );
  // a prime stride so consecutive days aren't adjacent in the bank
  const idx = (day * 97) % QUESTIONS.length;
  return { ...QUESTIONS[idx], day };
}

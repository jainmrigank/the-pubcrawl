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

/** deterministic PRNG so a run's playlist is stable across batch requests */
function rng(seedStr) {
  let h = 2166136261;
  for (const ch of String(seedStr)) h = ((h ^ ch.charCodeAt(0)) * 16777619) >>> 0;
  return () => ((h = (h * 1103515245 + 12345) >>> 0) / 4294967296);
}

function shuffled(arr, rand) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * One endless run: every question in the bank, ordered so difficulty climbs
 * smoothly from 3 to 10, shuffled within each difficulty step so no two runs
 * are the same. Nobody is expected to reach the end — the ramp is the point.
 */
function playlist(seed) {
  const rand = rng(seed);
  const byDifficulty = new Map();
  for (const q of QUESTIONS) {
    if (!byDifficulty.has(q.d)) byDifficulty.set(q.d, []);
    byDifficulty.get(q.d).push(q);
  }
  const steps = [...byDifficulty.keys()].sort((a, b) => a - b);
  const out = [];
  for (const d of steps) out.push(...shuffled(byDifficulty.get(d), rand));
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

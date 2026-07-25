/**
 * The quiz bank, plus the two ways it's served:
 *   buildRound()   a run of questions that climbs evenly from easy to expert
 *   questionOfDay() one question, the same for everyone, rotating daily
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = join(ROOT, 'data', 'quiz.json');
export const QUESTIONS = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];

const EASY = QUESTIONS.filter((q) => q.d <= 5);
const MID = QUESTIONS.filter((q) => q.d >= 6 && q.d <= 8);
const HARD = QUESTIONS.filter((q) => q.d >= 9);

const shuffle = (arr) => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/**
 * A round that ramps: roughly a third easy, a third intermediate, a third
 * expert, each block internally sorted by difficulty so the climb is smooth
 * rather than jumping about.
 */
export function buildRound(length = 15) {
  const nEasy = Math.round(length / 3);
  const nMid = Math.round(length / 3);
  const nHard = length - nEasy - nMid;
  const take = (pool, n) => shuffle(pool).slice(0, n).sort((a, b) => a.d - b.d);
  return [...take(EASY, nEasy), ...take(MID, nMid), ...take(HARD, nHard)];
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

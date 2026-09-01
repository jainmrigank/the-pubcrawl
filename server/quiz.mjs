/**
 * The quiz bank, plus the two ways it's served:
 *   playlistSlice()  an endless ramped run, streamed in batches
 *   questionOfDay()  one question, the same for everyone, rotating daily
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dailyQuizQuestion, quizPlaylistSlice } from '../shared/quiz-engine.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = join(ROOT, 'data', 'quiz.json');
export const QUESTIONS = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];

/** A slice of the run, so the client can keep pouring questions as it goes. */
export function playlistSlice(seed, from = 0, count = 20) {
  return quizPlaylistSlice(QUESTIONS, seed, from, count);
}

/** Same question for everyone on a given day, rotating through the bank. */
export function questionOfDay(date = new Date()) {
  return dailyQuizQuestion(QUESTIONS, date);
}

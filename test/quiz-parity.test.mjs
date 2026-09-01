import assert from 'node:assert/strict';
import test from 'node:test';
import { dailyQuizQuestion, quizPlaylistSlice } from '../shared/quiz-engine.mjs';
import { playlistSlice, questionOfDay, QUESTIONS } from '../server/quiz.mjs';

test('shared browser/Worker Quiz ordering stays byte-aligned with the Express adapter', () => {
  for (const seed of ['x', 'contract', '2026-08-31', 'reverse-me']) {
    for (const [from, count] of [[0, 25], [19, 37], [100, 50], [330, 30]]) {
      const shared = quizPlaylistSlice(QUESTIONS, seed, from, count);
      const server = playlistSlice(seed, from, count);
      assert.equal(shared.total, server.total);
      assert.deepEqual(shared.questions.map((question) => question.id), server.questions.map((question) => question.id));
      assert.equal(new Set(shared.questions.map((question) => question.id)).size, shared.questions.length);
    }
  }
  const date = new Date('2026-08-31T12:00:00.000Z');
  assert.deepEqual(dailyQuizQuestion(QUESTIONS, date), questionOfDay(date));
});


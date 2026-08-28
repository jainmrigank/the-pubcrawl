import test from 'node:test';
import assert from 'node:assert/strict';

import { playlistSlice } from '../server/quiz.mjs';

test('the first 25 quiz questions stay within difficulty 3 to 5', () => {
  for (const seed of ['opening-a', 'opening-b', 'opening-c']) {
    const { questions } = playlistSlice(seed, 0, 25);

    assert.equal(questions.length, 25);
    assert.ok(
      questions.every(({ d }) => d >= 3 && d <= 5),
      `seed ${seed} included a question outside the opening difficulty band`,
    );
  }
});

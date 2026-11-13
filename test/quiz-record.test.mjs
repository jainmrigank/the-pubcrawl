import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuizRecordStore } from '../shared/quiz-record-store.mjs';
import { createQuizSession } from '../shared/quiz-session.mjs';

const bank = Array.from({ length: 15 }, (_, i) => ({ id: `q-${i}`, q: `Question ${i}`, o: ['Right', 'Wrong', 'Also wrong', 'Nope'], a: 0, r: 'A sourced explanation.', d: 3 + i % 7 }));
const post = (token, question, pick = 0) => ({ token, questionId: question.id, pick, score: 9999 });
function setup(initial = { score: 0, at: 0 }) {
  const store = createQuizRecordStore({ readLocal: () => initial });
  return { store, quiz: createQuizSession(bank, store) };
}
async function finish(quiz, correct = 1) {
  const run = await quiz.start(crypto.randomUUID());
  let question = run.question;
  for (let i = 0; i < correct; i++) question = (await quiz.answer(post(run.token, question))).question;
  const result = await quiz.answer(post(run.token, question, 1));
  return { run, result };
}

test('non-perfect run wins; server scores it and only its token can name it', async () => {
  const { quiz, store } = setup();
  const { run, result } = await finish(quiz, 2);
  assert.equal('a' in run.question, false);
  assert.equal('r' in run.question, false);
  assert.equal(result.score, 2);
  assert.equal(result.done, true);
  assert.equal(result.swept, false);
  assert.equal(result.canName, true);
  assert.equal(result.beaten, true);
  assert.notEqual((await store.readRecord()).owner, run.token);
  assert.deepEqual(Object.keys(result.record).sort(), ['at', 'name', 'score']);
  const other = await quiz.start('someone-else');
  await assert.rejects(quiz.claim({ token: other.token, name: 'Thief' }, 'x'), { status: 403 });
  const named = await quiz.claim({ token: run.token, name: '  Jo\u200bn   Doe  ' }, 'x');
  assert.equal(named.name, 'Jon Doe');
  assert.equal((await quiz.claim({ token: run.token, name: 'Jon Doe' }, 'x')).name, 'Jon Doe');
  await assert.rejects(quiz.claim({ token: run.token, name: 'Changed' }, 'x'), { status: 409 });
  assert.equal((await quiz.high()).name, 'Jon Doe');
  assert.equal('owner' in await quiz.high(), false);
});

test('simultaneous identical answer retries count once; changed answer and skips fail', async () => {
  const { quiz } = setup();
  const run = await quiz.start('x');
  const payload = post(run.token, run.question);
  const replies = await Promise.all([quiz.answer(payload), quiz.answer(payload)]);
  assert.equal(replies[0].score, 1);
  assert.deepEqual(replies[0], replies[1]);
  await assert.rejects(quiz.answer({ ...payload, pick: 1 }), { status: 409 });
  await assert.rejects(quiz.answer({ ...payload, questionId: 'invented-question' }), { status: 409 });
  await assert.rejects(quiz.answer({ ...payload, questionId: replies[0].question.id, pick: 0.5 }), { status: 400 });
});

test('higher record replaces score and name together; ties and stale claims cannot rename it', async () => {
  const { quiz } = setup();
  const first = await finish(quiz, 1);
  await quiz.claim({ token: first.run.token, name: 'First' }, 'a');
  const tie = await finish(quiz, 1);
  assert.equal(tie.result.beaten, false);
  assert.equal((await quiz.high()).name, 'First');
  const second = await finish(quiz, 3);
  assert.equal(second.result.record.name, null);
  await assert.rejects(quiz.claim({ token: first.run.token, name: 'Hijack' }, 'a'), { status: 409 });
  await quiz.claim({ token: second.run.token, name: 'Second' }, 'b');
  assert.equal((await quiz.high()).score, 3);
  assert.equal((await quiz.high()).name, 'Second');
});

test('concurrent winners preserve the highest score and its own name', async () => {
  const { quiz } = setup();
  const [lower, higher] = await Promise.all([finish(quiz, 2), finish(quiz, 4)]);
  await Promise.allSettled([
    quiz.claim({ token: lower.run.token, name: 'Lower' }, 'a'),
    quiz.claim({ token: higher.run.token, name: 'Higher' }, 'b'),
  ]);
  assert.equal((await quiz.high()).score, 4);
  assert.equal((await quiz.high()).name, 'Higher');
});

test('keeps an existing unnamed score; zero is not a win', async () => {
  const { quiz } = setup({ score: 12, at: 7 });
  const low = await finish(quiz, 1);
  assert.equal(low.result.beaten, false);
  assert.deepEqual(await quiz.high(), { score: 12, at: 7, name: null, bank: 15 });
  const { quiz: empty } = setup();
  const zero = await finish(empty, 0);
  assert.equal(zero.result.beaten, false);
});

test('expired/fake tokens, excessive names and unavailable storage fail closed', async () => {
  const { quiz } = setup();
  await assert.rejects(quiz.answer({ token: 'forged', questionId: 'q-0', pick: 0 }), { status: 400 });
  await assert.rejects(quiz.answer({ token: 'a'.repeat(64), questionId: 'q-0', pick: 0 }), { status: 410 });
  const { run } = await finish(quiz);
  await assert.rejects(quiz.claim({ token: run.token, name: 'x'.repeat(25) }, 'x'), { status: 400 });
  const down = createQuizSession(bank, createQuizRecordStore({ available: false }));
  await assert.rejects(down.start('x'), /unavailable/);
  await assert.rejects(down.high(), /unavailable/);
  const failedWrite = createQuizSession(bank, createQuizRecordStore({ writeLocal() { throw new Error('disk full'); } }));
  await assert.rejects(finish(failedWrite), /disk full/);
  assert.equal((await failedWrite.high()).score, 0);
});

test('new round requests are bounded per client', async () => {
  const { quiz } = setup();
  for (let i = 0; i < 60; i++) await quiz.start('same-client');
  await assert.rejects(quiz.start('same-client'), { status: 429 });
});

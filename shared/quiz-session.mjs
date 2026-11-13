import { quizPlaylist } from './quiz-engine.mjs';

export class QuizError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const publicRecord = (value) => ({ score: Number(value?.score) || 0, at: Number(value?.at) || 0, name: typeof value?.name === 'string' ? value.name : null });
const publicQuestion = ({ id, q, o, d }) => ({ id, q, o, d });
const tokenPattern = /^[a-f0-9]{64}$/;
function tokenFrom(body) {
  if (typeof body?.token !== 'string' || !tokenPattern.test(body.token)) throw new QuizError(400, 'Invalid round');
  return body.token;
}
export async function quizClientKey(address, salt) {
  const bytes = new TextEncoder().encode(`${salt}:${address}`);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (x) => x.toString(16).padStart(2, '0')).join('');
}

/** A round is graded server-side, in order; an identical answer retry is safe. */
export function createQuizSession(bank, store) {
  async function answerResponse(state, high) {
    high ??= await store.readRecord();
    return {
      ...state.last,
      score: state.score,
      done: state.done,
      swept: state.done && state.score === bank.length,
      beaten: Boolean(state.beaten),
      canName: high.owner === state.owner && !high.name,
      record: publicRecord(high),
    };
  }
  return {
    async high() { return { ...publicRecord(await store.readRecord()), bank: bank.length }; },
    async start(client) {
      if (!bank.length) throw new QuizError(503, 'No questions are available');
      if (!await store.limit(client, 'start', 60)) throw new QuizError(429, 'Too many rounds. Take a short break.');
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) => x.toString(16).padStart(2, '0')).join('');
      const owner = await quizClientKey(token, 'quiz-record-owner');
      const state = { seed: token, owner, index: 0, score: 0, revision: 0, done: false, at: Date.now() };
      if (!await store.createRun(token, state)) throw new QuizError(503, 'Could not open a round');
      return { token, question: publicQuestion(quizPlaylist(bank, state.seed)[0]), bank: bank.length, record: publicRecord(await store.readRecord()) };
    },
    async answer(body) {
      const token = tokenFrom(body);
      if (!Number.isInteger(body.pick) || typeof body.questionId !== 'string') throw new QuizError(400, 'Choose an answer');
      // Two attempts allow a concurrent identical retry to read the winner.
      for (let attempt = 0; attempt < 2; attempt++) {
        const state = await store.readRun(token);
        if (!state) throw new QuizError(410, 'This round has expired. Start a fresh one.');
        if (state.last?.questionId === body.questionId) {
          if (state.last.pick !== body.pick) throw new QuizError(409, 'That answer is already on the board');
          return answerResponse(state);
        }
        if (state.done) throw new QuizError(409, 'This round has ended');
        const order = quizPlaylist(bank, state.seed);
        const question = order[state.index];
        if (question.id !== body.questionId) throw new QuizError(409, 'Answer the current question first');
        if (body.pick < 0 || body.pick >= question.o.length) throw new QuizError(400, 'Choose an answer');
        const correct = body.pick === question.a;
        const done = !correct || state.index + 1 === order.length;
        const next = {
          ...state, index: state.index + 1, score: state.score + Number(correct), revision: state.revision + 1, done, at: done ? Date.now() : state.at,
          last: { questionId: question.id, pick: body.pick, answer: question.a, explanation: question.r, correct, question: done ? null : publicQuestion(order[state.index + 1]) },
        };
        const committed = await store.commit(token, state.revision, next);
        if (committed) return answerResponse(committed.state, committed.record);
      }
      throw new QuizError(409, 'The round moved on. Please try again.');
    },
    async claim(body, client) {
      const token = tokenFrom(body);
      const name = typeof body.name === 'string' ? body.name.normalize('NFKC').replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim() : '';
      if (!name || Array.from(name).length > 24) throw new QuizError(400, 'Use a name of 1–24 characters');
      if (!await store.limit(client, 'claim', 30)) throw new QuizError(429, 'Too many attempts. Try again later.');
      const run = await store.readRun(token);
      if (!run?.done || !run.beaten) throw new QuizError(403, 'Only the winning round can sign the board');
      if (!await store.claim(run.owner, name)) throw new QuizError(409, 'The house has a new record, or this name is already saved');
      return publicRecord(await store.readRecord());
    },
  };
}

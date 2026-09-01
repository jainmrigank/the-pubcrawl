/** Deterministic Quiz ordering shared by browser, Worker, and Express. */

function seededRandom(seed) {
  let state = 2166136261;
  for (const character of String(seed)) state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(items, random) {
  const output = [...items];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [output[index], output[swap]] = [output[swap], output[index]];
  }
  return output;
}

export function quizPlaylist(questions, seed) {
  const random = seededRandom(seed);
  let pool = seededShuffle(questions || [], random);
  const output = [];
  const draw = (lo, hi, count) => {
    const band = pool.filter((question) => question.d >= lo && question.d <= hi);
    if (!band.length) return 0;
    const picked = seededShuffle(band, random).slice(0, count);
    const taken = new Set(picked);
    pool = pool.filter((question) => !taken.has(question));
    output.push(...picked);
    return picked.length;
  };
  for (const [lo, hi] of [[3, 5], [4, 7], [5, 8], [6, 9]]) draw(lo, hi, 25);
  while (draw(6, 9, 25) > 0) {}
  output.push(...pool);
  return output;
}

export function quizPlaylistSlice(questions, seed, from = 0, count = 20) {
  const ordered = quizPlaylist(questions, seed);
  return { questions: ordered.slice(from, from + count), total: ordered.length };
}

export function dailyQuizQuestion(questions, date = new Date()) {
  if (!questions?.length) return null;
  const day = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000);
  return { ...questions[(day * 97) % questions.length], day };
}


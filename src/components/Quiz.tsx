import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { fetchHighScore, fetchRound, submitHighScore } from '../api';
import type { Question } from '../types';
import { ArrowRight, Check, Shuffle, X } from '../icons';
import { EASE, LOADED_HIDDEN } from '../motion';

const ROUND = 15;

const tierLabel = (d: number) => (d <= 5 ? 'EASY' : d <= 8 ? 'TRICKY' : 'EXPERT');

/** How the bar rates you at the end. */
function verdict(score: number, total: number) {
  const pct = score / total;
  if (pct === 1) return { title: 'The bar bows.', line: 'A clean sheet. Someone get this one a job.' };
  if (pct >= 0.8) return { title: 'Steady hands.', line: 'You have clearly spent time on the right side of a bar.' };
  if (pct >= 0.6) return { title: 'Respectable.', line: 'You know your pours. A few gaps to top up.' };
  if (pct >= 0.4) return { title: 'Still finding the ice.', line: 'Promising. Read the Basics and come back.' };
  return { title: 'First round on you.', line: 'Everyone starts somewhere. Basics is that way.' };
}

/** Last Orders — the quiz. */
export function Quiz() {
  const [stage, setStage] = useState<'intro' | 'playing' | 'done'>('intro');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [high, setHigh] = useState(0);
  const [beatIt, setBeatIt] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchHighScore()
      .then((h) => setHigh(h.score))
      .catch(() => {});
  }, []);

  const start = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { questions, high } = await fetchRound(ROUND);
      if (!questions.length) throw new Error('empty');
      setQuestions(questions);
      setHigh((h) => Math.max(h, high));
      setIndex(0);
      setScore(0);
      setPicked(null);
      setBeatIt(false);
      setStage('playing');
    } catch {
      setError("The quizmaster is not in yet. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }, []);

  const current = questions[index];

  function choose(i: number) {
    if (picked !== null) return;
    setPicked(i);
    if (i === current.a) setScore((s) => s + 1);
  }

  async function next() {
    if (index + 1 < questions.length) {
      setIndex((n) => n + 1);
      setPicked(null);
      return;
    }
    setStage('done');
    try {
      const res = await submitHighScore(score);
      setHigh(res.score);
      setBeatIt(res.beaten);
    } catch {
      /* a lost score shouldn't break the ending */
    }
  }

  /* ---------- intro ---------- */
  if (stage === 'intro') {
    return (
      <div className="quiz">
        <div className="quiz-intro">
          <p className="k-label quiz-eyebrow">LAST ORDERS</p>
          <h3 className="quiz-title">Think you know your drinks?</h3>
          <p className="quiz-copy">
            Fifteen questions on cocktails, spirits and the history behind them, from the easy stuff
            to the sort of thing only a bartender would know. One point a correct answer. It gets
            harder as you go.
          </p>
          <div className="quiz-start-row">
            <button className="btn btn-solid" onClick={start} disabled={loading}>
              {loading ? 'POURING…' : 'START THE ROUND'} <ArrowRight size={14} />
            </button>
            <span className="quiz-high">
              <span className="k-label dim">HOUSE RECORD</span>
              <b>{high}</b>
              <span className="k-label dim">/ {ROUND}</span>
            </span>
          </div>
          {error && <p className="err" role="alert">{error}</p>}
        </div>
      </div>
    );
  }

  /* ---------- results ---------- */
  if (stage === 'done') {
    const v = verdict(score, questions.length);
    return (
      <div className="quiz">
        <div className="quiz-intro">
          <p className="k-label quiz-eyebrow">TAB SETTLED</p>
          <h3 className="quiz-title">{v.title}</h3>
          <p className="quiz-score-big">
            {score}
            <span> / {questions.length}</span>
          </p>
          <p className="quiz-copy">{v.line}</p>
          {beatIt && <p className="quiz-record">A new house record. It stands until someone beats it.</p>}
          <div className="quiz-start-row">
            <button className="btn btn-solid" onClick={start} disabled={loading}>
              {loading ? 'POURING…' : 'ANOTHER ROUND'} <Shuffle size={14} />
            </button>
            <span className="quiz-high">
              <span className="k-label dim">HOUSE RECORD</span>
              <b>{high}</b>
              <span className="k-label dim">/ {questions.length}</span>
            </span>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- playing ---------- */
  const answered = picked !== null;
  return (
    <div className="quiz">
      <div className="quiz-meta">
        <span className="k-label dim">
          QUESTION {index + 1} OF {questions.length}
        </span>
        <span className="quiz-score">
          <span className="k-label dim">SCORE</span> <b>{score}</b>
        </span>
      </div>

      <motion.div
        className="quiz-card"
        key={current.id}
        initial={LOADED_HIDDEN ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
      >
        <p className="quiz-q">{current.q}</p>
        <div className="quiz-grid">
          {current.o.map((opt, i) => {
            const isRight = i === current.a;
            const state = !answered ? '' : isRight ? 'right' : i === picked ? 'wrong' : 'muted';
            return (
              <button
                key={i}
                className={`quiz-opt ${state}`}
                onClick={() => choose(i)}
                disabled={answered}
              >
                <span className="quiz-opt-letter k-label">{'ABCD'[i]}</span>
                <span className="quiz-opt-text">{opt}</span>
                {answered && isRight && <Check size={14} />}
                {answered && !isRight && i === picked && <X size={14} />}
              </button>
            );
          })}
        </div>

        <AnimatePresence>
          {answered && (
            <motion.div
              className="quiz-why"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.32, ease: EASE }}
            >
              <p>{current.r}</p>
              <button className="btn btn-solid quiz-next" onClick={next}>
                {index + 1 < questions.length ? 'NEXT' : 'SEE THE DAMAGE'} <ArrowRight size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <span className="quiz-diff k-label">{tierLabel(current.d)} · {current.d}/10</span>
      </motion.div>
    </div>
  );
}

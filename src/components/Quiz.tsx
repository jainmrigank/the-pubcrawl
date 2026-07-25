import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { fetchHighScore, fetchQuizBatch, submitHighScore } from '../api';
import type { Question } from '../types';
import { ArrowRight, Check, X } from '../icons';
import { EASE, LOADED_HIDDEN } from '../motion';

const BATCH = 20;
const REFILL_AT = 5; // fetch more once the queue runs this low

const tierLabel = (d: number) => (d <= 5 ? 'EASY' : d <= 8 ? 'TRICKY' : 'EXPERT');

/** How the bar rates the run that just ended. */
function verdict(score: number) {
  if (score === 0) return { title: 'First round on you.', line: 'Out on the first question. Read the Basics and come back.' };
  if (score < 5) return { title: 'Still finding the ice.', line: 'A start. The easy ones are meant to be free.' };
  if (score < 10) return { title: 'Respectable.', line: 'You know your pours. The tricky tier is where it bites.' };
  if (score < 20) return { title: 'Steady hands.', line: 'You have clearly spent time on the right side of a bar.' };
  if (score < 35) return { title: 'The bar is impressed.', line: 'That is deep into expert territory.' };
  return { title: 'Are you a bartender?', line: 'Genuinely remarkable. Someone get this one a job.' };
}

/**
 * Last Orders — endless, sudden death. Every correct answer is a point and the
 * questions keep getting harder. One wrong answer ends the run and the score
 * goes back to zero, which is what makes the house record worth chasing.
 */
export function Quiz() {
  const [stage, setStage] = useState<'intro' | 'playing' | 'over'>('intro');
  const [queue, setQueue] = useState<Question[]>([]);
  const [current, setCurrent] = useState<Question | null>(null);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [high, setHigh] = useState(0);
  const [beatIt, setBeatIt] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exhausted, setExhausted] = useState(false);
  const seed = useRef('');
  const served = useRef(0);

  useEffect(() => {
    fetchHighScore()
      .then((h) => setHigh(h.score))
      .catch(() => {});
  }, []);

  /** top the queue up in the background so play never stalls */
  const refill = useCallback(async () => {
    try {
      const { questions, total } = await fetchQuizBatch(seed.current, served.current, BATCH);
      served.current += questions.length;
      if (served.current >= total || questions.length === 0) setExhausted(true);
      setQueue((q) => [...q, ...questions]);
    } catch {
      /* the queue still holds enough to keep going */
    }
  }, []);

  const start = useCallback(async () => {
    setLoading(true);
    setError('');
    seed.current = `${Date.now()}-${Math.random()}`;
    served.current = 0;
    setExhausted(false);
    try {
      const { questions, total, high } = await fetchQuizBatch(seed.current, 0, BATCH);
      if (!questions.length) throw new Error('empty');
      served.current = questions.length;
      if (served.current >= total) setExhausted(true);
      setHigh((h) => Math.max(h, high));
      setCurrent(questions[0]);
      setQueue(questions.slice(1));
      setScore(0);
      setPicked(null);
      setBeatIt(false);
      setStage('playing');
    } catch {
      setError('The quizmaster is not in yet. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  }, []);

  async function endRun(finalScore: number) {
    setStage('over');
    try {
      const res = await submitHighScore(finalScore);
      setHigh(res.score);
      setBeatIt(res.beaten);
    } catch {
      /* a lost score shouldn't break the ending */
    }
  }

  function choose(i: number) {
    if (picked !== null || !current) return;
    setPicked(i);
    if (i === current.a) {
      setScore((s) => s + 1);
      if (queue.length <= REFILL_AT && !exhausted) refill();
    }
  }

  function next() {
    if (!current) return;
    // a wrong answer ends the run: score resets and we head back to the intro
    if (picked !== current.a) {
      endRun(score);
      return;
    }
    if (!queue.length) {
      // cleared the entire bank — a run worth ending on
      endRun(score);
      return;
    }
    setCurrent(queue[0]);
    setQueue((q) => q.slice(1));
    setPicked(null);
  }

  /* ---------- intro ---------- */
  if (stage === 'intro' || stage === 'over') {
    const over = stage === 'over';
    const v = verdict(score);
    return (
      <div className="quiz">
        <div className="quiz-intro">
          <p className="k-label quiz-eyebrow">{over ? 'TIME AT THE BAR' : 'LAST ORDERS'}</p>
          <h3 className="quiz-title">{over ? v.title : 'Think you know your drinks?'}</h3>
          {over ? (
            <>
              <p className="quiz-score-big">{score}</p>
              <p className="quiz-copy">{v.line}</p>
              {beatIt && <p className="quiz-record">A new house record. It stands until someone beats it.</p>}
            </>
          ) : (
            <p className="quiz-copy">
              Questions on cocktails, spirits and the history behind them. A point for every correct
              answer and no finish line, but one wrong answer and you are back to zero. It gets
              harder the longer you last.
            </p>
          )}
          <div className="quiz-start-row">
            <button className="btn btn-solid" onClick={start} disabled={loading}>
              {loading ? 'POURING…' : over ? 'GO AGAIN' : 'START THE ROUND'} <ArrowRight size={14} />
            </button>
            <span className="quiz-high">
              <span className="k-label dim">HOUSE RECORD</span>
              <b>{high}</b>
            </span>
          </div>
          {error && <p className="err" role="alert">{error}</p>}
        </div>
      </div>
    );
  }

  /* ---------- playing ---------- */
  if (!current) return null;
  const answered = picked !== null;
  const gotIt = picked === current.a;

  return (
    <div className="quiz">
      <div className="quiz-meta">
        <span className="k-label dim">HOUSE RECORD {high}</span>
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
                {gotIt ? (queue.length ? 'KEEP GOING' : 'THAT IS THE WHOLE BANK') : 'THAT IS LAST ORDERS'}{' '}
                <ArrowRight size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <span className="quiz-diff k-label">{tierLabel(current.d)}</span>
      </motion.div>
    </div>
  );
}

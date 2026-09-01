import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { fetchHighScore, fetchQuizBatch, joinHall, submitHighScore } from '../api';
import { localQuizSlice } from '../localData';
import type { HallMember, Question } from '../types';
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
 * The pub quiz — endless, sudden death. Every correct answer is a point and the
 * questions keep getting harder. One wrong answer ends the run and the score
 * goes back to zero, which is what makes the house record worth chasing.
 *
 * Clear the entire bank and the run stops being a score: it's a name on the
 * wall.
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
  const [hall, setHall] = useState<HallMember[]>([]);
  const [bank, setBank] = useState(0); // how many questions exist in total
  const [swept, setSwept] = useState(false); // this run answered every question
  const [name, setName] = useState('');
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [advancing, setAdvancing] = useState(false); // waiting on a late batch
  const seed = useRef('');
  const served = useRef(0);
  const pending = useRef<Promise<number> | null>(null); // the one in-flight batch
  const servedIds = useRef(new Set<string>()); // every question this run has shown

  useEffect(() => {
    fetchHighScore()
      .then((h) => {
        setHigh(h.score);
        setHall(h.hall || []);
        setBank(h.bank || 0);
      })
      .catch(() => {});
  }, []);

  /**
   * Top the queue up in the background so play never stalls.
   *
   * Only ever one batch in flight: this is called on every correct answer once
   * the queue is short, and each call used to read the offset before awaiting,
   * so a slow reply let several requests stack up on the same offset and append
   * the same questions again. Callers waiting on a refill share the one promise.
   */
  const refill = useCallback(() => {
    if (pending.current) return pending.current;
    const from = served.current;
    const p = (async () => {
      try {
        const { questions, total } = await localQuizSlice(seed.current, from, BATCH).catch(() => fetchQuizBatch(seed.current, from, BATCH));
        served.current = from + questions.length;
        if (served.current >= total || questions.length === 0) setExhausted(true);
        // a question this run has already served never comes round again
        const fresh = questions.filter((q) => !servedIds.current.has(q.id));
        for (const q of fresh) servedIds.current.add(q.id);
        setQueue((queued) => [...queued, ...fresh]);
        return fresh.length;
      } catch {
        /* the queue still holds enough to keep going */
        return 0;
      } finally {
        pending.current = null;
      }
    })();
    pending.current = p;
    return p;
  }, []);

  const start = useCallback(async () => {
    setLoading(true);
    setError('');
    seed.current = `${Date.now()}-${Math.random()}`;
    served.current = 0;
    pending.current = null;
    servedIds.current = new Set();
    setExhausted(false);
    setSwept(false);
    setSigned(false);
    setName('');
    try {
      const { questions, total } = await localQuizSlice(seed.current, 0, BATCH).catch(() => fetchQuizBatch(seed.current, 0, BATCH));
      if (!questions.length) throw new Error('empty');
      served.current = questions.length;
      for (const q of questions) servedIds.current.add(q.id);
      setBank(total);
      if (served.current >= total) setExhausted(true);
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

  async function endRun(finalScore: number, sweep = false) {
    setSwept(sweep);
    setStage('over');
    try {
      const res = await submitHighScore(finalScore);
      setHigh(res.score);
      setBeatIt(res.beaten);
    } catch {
      /* a lost score shouldn't break the ending */
    }
  }

  /** put a clean sweep up on the wall */
  async function sign() {
    const clean = name.trim();
    if (!clean) return;
    setSigning(true);
    setError('');
    try {
      const res = await joinHall(clean, score);
      setHall(res.hall);
      setSigned(true);
    } catch {
      setError('Could not reach the wall. Try once more.');
    } finally {
      setSigning(false);
    }
  }

  // a batch that arrived late: hand over the question the player is waiting on
  useEffect(() => {
    if (!advancing || !queue.length) return;
    setCurrent(queue[0]);
    setQueue((q) => q.slice(1));
    setPicked(null);
    setAdvancing(false);
  }, [advancing, queue]);

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
      // the queue can also run dry because a background refill hasn't landed
      // yet — ending the run there would rob a long streak of questions it
      // never got asked, so wait for the batch and only stop if none comes
      if (!exhausted) {
        setAdvancing(true);
        refill().then((n) => {
          if (n) return; // the effect below picks it up
          setAdvancing(false);
          endRun(score, bank > 0 && score >= bank);
        });
        return;
      }
      // nothing left to serve: if that's every question in the bank, answered
      // without a miss, this is a clean sweep and not just a run
      endRun(score, bank > 0 && score >= bank);
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
          <p className="k-label quiz-eyebrow">
            {swept ? 'THE WHOLE BANK' : over ? 'THAT IS YOUR ROUND' : 'THE PUB QUIZ'}
          </p>
          <h3 className="quiz-title">
            {swept ? 'You drank the bar dry.' : over ? v.title : 'Think you know your drinks?'}
          </h3>
          {over ? (
            <>
              <p className="quiz-score-big">{score}</p>
              {swept ? (
                <p className="quiz-copy">
                  Every question in the book, and not one of them got you. Put your name up and it
                  stays up.
                </p>
              ) : (
                <p className="quiz-copy">{v.line}</p>
              )}
              {beatIt && !swept && (
                <p className="quiz-record">A new house record. It stands until someone beats it.</p>
              )}
            </>
          ) : (
            <p className="quiz-copy">
              Questions on cocktails, spirits and the history behind them. A point for every correct
              answer and no finish line, but one wrong answer and you are back to zero. It gets
              harder the longer you last.
            </p>
          )}

          {/* a clean sweep signs the wall before anything else */}
          {swept &&
            (signed ? (
              <p className="quiz-record">
                <Check size={14} /> You are on the wall. Welcome to the hall.
              </p>
            ) : (
              <div className="hall-sign">
                <label className="k-label dim" htmlFor="hall-name">
                  THE NAME FOR THE WALL
                </label>
                <div className="hall-sign-row">
                  <input
                    id="hall-name"
                    className="hall-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sign()}
                    placeholder="Who are we writing up?"
                    maxLength={24}
                    autoComplete="name"
                  />
                  <button
                    className="btn btn-solid"
                    onClick={sign}
                    disabled={signing || !name.trim()}
                  >
                    {signing ? 'WRITING…' : 'PUT ME UP'} <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            ))}

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

          {hall.length > 0 && (
            <div className="hall">
              <p className="k-label hall-label">BALL KNOWLEDGE INDUCTEES</p>
              <p className="hall-names">{hall.map((m) => m.name).join(' · ')}</p>
              <p className="hall-note">
                Answered all {bank || hall[0].score} questions in one run without a miss.
              </p>
            </div>
          )}
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
                onPointerDown={(event) => {
                  if (event.pointerType === 'touch' || event.pointerType === 'pen') event.currentTarget.blur();
                }}
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
              <button className="btn btn-solid quiz-next" onClick={next} disabled={advancing}>
                {advancing
                  ? 'POURING…'
                  : gotIt
                    ? queue.length || !exhausted
                      ? 'KEEP GOING'
                      : 'THAT IS THE WHOLE BANK'
                    : 'AND THAT IS THAT'}{' '}
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

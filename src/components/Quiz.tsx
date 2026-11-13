import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { answerQuizRun, claimHouseRecord, fetchHighScore, startQuizRun } from '../api';
import { localQuizSlice } from '../localData';
import type { HouseRecord, Question, QuizAnswer, QuizQuestion } from '../types';
import { ArrowRight, Check, X } from '../icons';
import { EASE, LOADED_HIDDEN } from '../motion';

const tierLabel = (d: number) => (d <= 5 ? 'Easy' : d <= 8 ? 'Tricky' : 'Expert');
function verdict(score: number) {
  if (score === 0) return { title: 'First round on you.', line: 'Start with Bar Basics.' };
  if (score < 5) return { title: 'Still finding the ice.', line: 'Try another round.' };
  if (score < 10) return { title: 'Respectable.', line: 'Ready for the tricky ones?' };
  if (score < 20) return { title: 'Steady hands.', line: 'You know your way around.' };
  if (score < 35) return { title: 'The bar is impressed.', line: 'Expert territory.' };
  return { title: 'Are you a bartender?', line: 'Someone get this one a job.' };
}

/** Sudden death; the highest completed, server-checked run signs the shared board. */
export function Quiz() {
  const [stage, setStage] = useState<'intro' | 'playing' | 'over'>('intro');
  const [current, setCurrent] = useState<QuizQuestion | null>(null);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [answer, setAnswer] = useState<QuizAnswer | null>(null);
  const [record, setRecord] = useState<HouseRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingPick, setPendingPick] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [practice, setPractice] = useState(false);
  const [offerPractice, setOfferPractice] = useState(false);
  const [name, setName] = useState('');
  const [signed, setSigned] = useState(false);
  const [canName, setCanName] = useState(false);
  const token = useRef('');
  const busy = useRef(false);
  const practiceQueue = useRef<Question[]>([]);
  const questionHeading = useRef<HTMLParagraphElement>(null);

  const acceptRecord = useCallback((latest: HouseRecord) => setRecord((previous) => {
    // A delayed read must not erase a newer score or an already-saved name.
    if (previous && (previous.score > latest.score || (previous.score === latest.score &&
      (previous.at > latest.at || (previous.at === latest.at && previous.name && !latest.name))))) return previous;
    return latest;
  }), []);
  useEffect(() => { fetchHighScore().then(acceptRecord).catch(() => {}); }, [acceptRecord]);
  useEffect(() => {
    if (stage === 'playing') questionHeading.current?.focus({ preventScroll: true });
  }, [stage, current?.id]);

  const start = useCallback(async (local = false) => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError('');
    setName('');
    setSigned(false);
    setCanName(false);
    setPractice(local);
    try {
      if (local) {
        const { questions } = await localQuizSlice(crypto.randomUUID(), 0, 10000);
        if (!questions.length) throw new Error('No practice questions');
        practiceQueue.current = questions;
        setCurrent(questions[0]);
        token.current = '';
      } else {
        const run = await startQuizRun();
        token.current = run.token;
        acceptRecord(run.record);
        setCurrent(run.question);
      }
      setScore(0);
      setPicked(null);
      setPendingPick(null);
      setAnswer(null);
      setOfferPractice(false);
      setStage('playing');
    } catch {
      setOfferPractice(true);
      setError('Board unavailable. Retry or play a practice round.');
    } finally { busy.current = false; setLoading(false); }
  }, [acceptRecord]);

  async function choose(pick: number) {
    if (!current || picked !== null || busy.current) return;
    busy.current = true;
    setLoading(true);
    setPendingPick(pick);
    setError('');
    try {
      let result: QuizAnswer;
      if (practice) {
        const question = practiceQueue.current.shift()!;
        const correct = pick === question.a;
        const done = !correct || !practiceQueue.current.length;
        result = {
          questionId: question.id, pick, answer: question.a, explanation: question.r,
          correct, question: done ? null : practiceQueue.current[0], score: score + Number(correct), done,
          swept: done && correct, beaten: false, canName: false, record: record || { score: 0, at: 0, name: null },
        };
      } else result = await answerQuizRun(token.current, current.id, pick);
      setPicked(pick);
      setAnswer(result);
      setScore(result.score);
      setCanName(result.canName);
      if (!practice) acceptRecord(result.record);
      setPendingPick(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Answer not sent. Retry.');
    } finally { busy.current = false; setLoading(false); }
  }

  async function sign(event: FormEvent) {
    event.preventDefault();
    if (busy.current || !name.trim()) return;
    busy.current = true;
    setLoading(true);
    setError('');
    try {
      acceptRecord(await claimHouseRecord(token.current, name.trim()));
      setSigned(true);
      setCanName(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Board unavailable. Retry.');
      fetchHighScore().then((latest) => {
        acceptRecord(latest);
        if (latest.score > score || latest.name) setCanName(false);
      }).catch(() => {});
    } finally { busy.current = false; setLoading(false); }
  }

  function next() {
    if (!answer) return;
    setError('');
    if (answer.done) { setStage('over'); return; }
    setCurrent(answer.question);
    setPicked(null);
    setAnswer(null);
  }

  const holder = record?.name || (record?.score ? 'Name not recorded' : 'The board is open');
  const recordView = (
    <span className="quiz-high" data-tour="quiz-score" aria-label={`Shared house record: ${record?.score ?? 'unavailable'}. ${record ? holder : ''}`}>
      <span className="k-label dim">House record · All players</span>
      <b>{record?.score ?? '—'}</b>
      <span className="quiz-record-holder">{record ? holder : 'Checking the board…'}</span>
    </span>
  );

  if (stage === 'intro' || stage === 'over') {
    const over = stage === 'over';
    const v = verdict(score);
    return (
      <div className="quiz" data-tour="quiz-round">
        <div className="quiz-intro">
          <p className="k-label quiz-eyebrow">{over ? practice ? 'Practice round' : 'That is your round' : 'Pub Quiz'}</p>
          <h3 className="quiz-title">{over ? answer?.swept ? 'You drank the bar dry.' : v.title : 'Think you know your drinks?'}</h3>
          {over ? (
            <>
              <p className="quiz-score-big">{score}</p>
              <p className="quiz-copy">{answer?.swept ? 'Every answer right.' : v.line}</p>
              {practice ? <p className="quiz-record">Practice stays off the shared board.</p> : answer?.beaten && (
                <p className="quiz-record">New house record.</p>
              )}
            </>
          ) : (
            <p className="quiz-copy">One point per correct answer. One miss ends the round. Beat the record to add your name.</p>
          )}
          {canName && !signed && (
            <form className="hall-sign" onSubmit={sign}>
              <label className="k-label dim" htmlFor="record-name">A name for the record</label>
              <div className="hall-sign-row">
                <input id="record-name" className="hall-input" value={name} onChange={(event) => setName(event.target.value)}
                  placeholder="Your bar name" maxLength={24} autoComplete="nickname" aria-describedby="record-name-note" disabled={loading} />
                <button className="btn btn-solid" type="submit" disabled={loading || !name.trim()}>
                  {loading ? 'Saving…' : 'Sign the board'} <ArrowRight size={14} />
                </button>
              </div>
              <p className="quiz-name-note" id="record-name-note">Public name. Nicknames welcome.</p>
            </form>
          )}
          {signed && <p className="quiz-record" role="status"><Check size={14} /> Your name is on the board.</p>}
          <div className="quiz-start-row" data-tour="quiz-start">
            <button className="btn btn-solid" onClick={() => start()} disabled={loading}>
              {loading ? 'Pouring…' : over ? 'Go again' : 'Start the round'} <ArrowRight size={14} />
            </button>
            {recordView}
          </div>
          {error && <p className="err" role="alert">{error}</p>}
          {offerPractice && <button className="btn btn-ghost" onClick={() => start(true)} disabled={loading}>Play offline practice <ArrowRight size={14} /></button>}
        </div>
      </div>
    );
  }

  if (!current) return null;
  const answered = picked !== null;
  return (
    <div className="quiz" data-tour="quiz-round">
      <div className="quiz-meta" data-tour="quiz-score">
        <span className="quiz-playing-record"><span className="k-label dim">{practice ? 'Practice · No shared score' : `House record ${record?.score ?? '—'}`}</span>
          {!practice && <span className="quiz-record-holder">{holder}</span>}</span>
        <span className="quiz-score"><span className="k-label dim">Score</span> <b aria-live="polite">{score}</b></span>
      </div>
      <motion.div className="quiz-card" key={current.id} initial={LOADED_HIDDEN ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }}>
        <p className="quiz-q" ref={questionHeading} tabIndex={-1}>{current.q}</p>
        <div className="quiz-grid" aria-busy={loading}>
          {current.o.map((option, index) => {
            const right = index === answer?.answer;
            const state = !answered ? '' : right ? 'right' : index === picked ? 'wrong' : 'muted';
            return (
              <button key={index} className={`quiz-opt ${state}`} onClick={() => choose(index)} disabled={answered || loading || pendingPick !== null}
                onPointerDown={(event) => { if (event.pointerType === 'touch' || event.pointerType === 'pen') event.currentTarget.blur(); }}>
                <span className="quiz-opt-letter k-label">{'ABCD'[index]}</span><span className="quiz-opt-text">{option}</span>
                {answered && right && <Check size={14} />}{answered && !right && index === picked && <X size={14} />}
              </button>
            );
          })}
        </div>
        {loading && <p className="quiz-name-note" role="status">Checking with the quizmaster…</p>}
        {error && <div role="alert"><p className="err">{error}</p>
          {pendingPick !== null && <button className="btn btn-solid" onClick={() => choose(pendingPick)} disabled={loading}>Retry this answer <ArrowRight size={14} /></button>}
          <button className="btn btn-ghost" onClick={() => { setStage('intro'); setError(''); }}>Leave round</button>
        </div>}
        <AnimatePresence>{answered && answer && (
          <motion.div className="quiz-why" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.32, ease: EASE }}>
            <p>{answer.explanation}</p>
            <button className="btn btn-solid quiz-next" onClick={next}>
              {answer.done ? answer.swept ? 'That is the whole bank' : 'And that is that' : 'Keep going'} <ArrowRight size={14} />
            </button>
          </motion.div>
        )}</AnimatePresence>
        <span className="quiz-diff k-label">{tierLabel(current.d)}</span>
      </motion.div>
    </div>
  );
}

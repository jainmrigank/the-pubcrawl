import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { fetchDailyQuestion } from '../api';
import { localQuestionOfDay } from '../localData';
import type { Question } from '../types';
import { ArrowRight, Check, X } from '../icons';
import { EASE } from '../motion';
import { OVERLAY_PRIORITY, overlayGate, setBackgroundInert } from '../overlayGate';

const SEEN_KEY = 'pubcrawl.dailySeen';
const DAILY_GATE_ID = 'daily-question';

function readSeenDay(): string | null {
  try { return localStorage.getItem(SEEN_KEY); } catch { return null; }
}

function writeSeenDay(day: number | undefined) {
  if (day === undefined) return;
  try { localStorage.setItem(SEEN_KEY, String(day)); } catch {}
}

/**
 * One question a day, no points, no pressure: a card over the app on the first
 * open of a new day, with the bar blurred behind it. Skippable, and it won't
 * ask twice in a day. `force` bypasses the gate so a tapped notification
 * always opens it.
 */
export function DailyQuestion({ force = false }: { force?: boolean }) {
  const [question, setQuestion] = useState<Question | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  function openQuestion(next: Question) {
    const seenToday = String(next.day) === readSeenDay();
    if (seenToday && !force) return;
    if (!overlayGate.acquire(DAILY_GATE_ID, OVERLAY_PRIORITY.daily)) return;
    setQuestion(next);
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPicked(null);
    setOpen(true);
  }

  useEffect(() => {
    localQuestionOfDay()
      .then((q) => {
        if (!q) throw new Error('question bank unavailable');
        openQuestion(q);
      })
      .catch(() => fetchDailyQuestion().then((q) => {
        openQuestion(q);
      }).catch(() => {}));
  }, [force]);

  useEffect(() => overlayGate.subscribe(() => {
    if (open && overlayGate.active !== DAILY_GATE_ID) setOpen(false);
  }), [open]);

  // hold the page still while the card is up
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const restoreInert = setBackgroundInert(true, '.daily-backdrop');
    return () => {
      document.body.style.overflow = prev;
      restoreInert();
      overlayGate.release(DAILY_GATE_ID);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button, a, input, [tabindex]:not([tabindex="-1"])') || []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function close() {
    if (question) writeSeenDay(question.day);
    setOpen(false);
    overlayGate.release(DAILY_GATE_ID);
    openerRef.current?.focus();
  }

  function choose(i: number) {
    if (picked !== null || !question) return;
    setPicked(i);
    writeSeenDay(question.day);
  }

  const answered = picked !== null;

  return (
    <AnimatePresence>
      {open && question && (
        <motion.div
          className="daily-backdrop"
          onClick={close}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: EASE }}
        >
          <motion.div
            className="daily"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="daily-question-title"
            aria-describedby="daily-answer-feedback"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 22, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.99 }}
            transition={{ duration: 0.36, ease: EASE }}
          >
            <div className="daily-head">
              <span className="k-label">ONE FOR THE ROAD · TODAY'S QUESTION</span>
              <button className="chip-x" onClick={close} aria-label="Close">
                <X size={12} />
              </button>
            </div>

            <p className="daily-q" id="daily-question-title">{question.q}</p>

            <div className="quiz-grid">
              {question.o.map((opt, i) => {
                const isRight = i === question.a;
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

            {answered ? (
              <div className="daily-why">
                <span id="daily-answer-feedback" className="sr-only" role="status" aria-live="polite">
                  {picked === question.a ? 'Correct answer.' : 'That answer is not correct.'}
                </span>
                <p>{question.r}</p>
                <div className="daily-actions">
                  <a className="btn btn-solid" href="#/quiz" onClick={close}>
                    PLAY THE FULL ROUND <ArrowRight size={13} />
                  </a>
                  <button className="text-btn" onClick={close}>
                    BACK TO THE BAR
                  </button>
                </div>
              </div>
            ) : (
              <div className="daily-skip">
                <button className="text-btn" onClick={close}>
                  SKIP FOR TODAY
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

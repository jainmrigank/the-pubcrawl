import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { fetchDailyQuestion } from '../api';
import type { Question } from '../types';
import { ArrowRight, Check, X } from '../icons';
import { EASE } from '../motion';

const SEEN_KEY = 'pubcrawl.dailySeen';

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

  useEffect(() => {
    fetchDailyQuestion()
      .then((q) => {
        const seenToday = String(q.day) === localStorage.getItem(SEEN_KEY);
        if (seenToday && !force) return;
        setQuestion(q);
        setOpen(true);
      })
      .catch(() => {});
  }, [force]);

  // hold the page still while the card is up
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function close() {
    if (question) localStorage.setItem(SEEN_KEY, String(question.day));
    setOpen(false);
  }

  function choose(i: number) {
    if (picked !== null || !question) return;
    setPicked(i);
    localStorage.setItem(SEEN_KEY, String(question.day));
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
            role="dialog"
            aria-modal="true"
            aria-label="Today's question"
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

            <p className="daily-q">{question.q}</p>

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

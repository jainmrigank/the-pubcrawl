import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { fetchDailyQuestion } from '../api';
import type { Question } from '../types';
import { ArrowRight, Check, X } from '../icons';
import { EASE, LOADED_HIDDEN } from '../motion';

const SEEN_KEY = 'pubcrawl.dailySeen';

/**
 * One question a day, no points, no pressure. Shows on the first open of a new
 * day and then gets out of the way. `force` bypasses the once-a-day gate so a
 * tapped notification always opens it.
 */
export function DailyQuestion({ force = false, onClose }: { force?: boolean; onClose?: () => void }) {
  const [question, setQuestion] = useState<Question | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    fetchDailyQuestion()
      .then((q) => {
        const alreadySeen = String(q.day) === localStorage.getItem(SEEN_KEY);
        if (alreadySeen && !force) return;
        setQuestion(q);
      })
      .catch(() => {});
  }, [force]);

  if (!question || closed) return null;

  function choose(i: number) {
    if (picked !== null) return;
    setPicked(i);
    localStorage.setItem(SEEN_KEY, String(question!.day));
  }

  function dismiss() {
    localStorage.setItem(SEEN_KEY, String(question!.day));
    setClosed(true);
    onClose?.();
  }

  const answered = picked !== null;

  return (
    <motion.aside
      className="daily"
      initial={LOADED_HIDDEN ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      <div className="daily-head">
        <span className="k-label">ONE FOR THE ROAD · TODAY'S QUESTION</span>
        <button className="chip-x" onClick={dismiss} aria-label="Close today's question">
          <X size={12} />
        </button>
      </div>
      <p className="daily-q">{question.q}</p>
      <div className="quiz-grid daily-grid">
        {question.o.map((opt, i) => {
          const isRight = i === question.a;
          const state = !answered ? '' : isRight ? 'right' : i === picked ? 'wrong' : 'muted';
          return (
            <button key={i} className={`quiz-opt ${state}`} onClick={() => choose(i)} disabled={answered}>
              <span className="quiz-opt-letter k-label">{'ABCD'[i]}</span>
              <span className="quiz-opt-text">{opt}</span>
              {answered && isRight && <Check size={14} />}
              {answered && !isRight && i === picked && <X size={14} />}
            </button>
          );
        })}
      </div>
      {answered && (
        <div className="daily-why">
          <p>{question.r}</p>
          <a className="text-btn" href="#/quiz">
            PLAY THE FULL ROUND <ArrowRight size={12} />
          </a>
        </div>
      )}
    </motion.aside>
  );
}

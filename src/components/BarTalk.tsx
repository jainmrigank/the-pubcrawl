import { useState } from 'react';
import { motion } from 'framer-motion';
import { FACTS } from '../data/facts';
import { Shuffle } from '../icons';
import { EASE, LOADED_HIDDEN } from '../motion';

/** A coaster of bar trivia: one story at a time, another on request. */
export function BarTalk({ variant = 'ink' }: { variant?: 'ink' | 'accent' }) {
  const [i, setI] = useState(() => Math.floor(Math.random() * FACTS.length));
  const another = () => setI((v) => (v + 1 + Math.floor(Math.random() * (FACTS.length - 1))) % FACTS.length);
  return (
    <motion.aside
      className={`bartalk bartalk--${variant}`}
      initial={LOADED_HIDDEN ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, ease: EASE }}
    >
      <span className="bartalk-mark" aria-hidden>“</span>
      <div className="bartalk-body">
        <div className="bartalk-head">
          <span className="k-label">BAR TALK · Nº {String(i + 1).padStart(2, '0')}</span>
          <button className="text-btn" onClick={another}>
            ANOTHER ONE <Shuffle size={12} />
          </button>
        </div>
        <p>{FACTS[i]}</p>
      </div>
    </motion.aside>
  );
}

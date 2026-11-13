import { useState } from 'react';
import { motion } from 'framer-motion';
import { FACTS, FACT_SOURCES } from '../data/facts';
import { Shuffle } from '../icons';
import { EASE, LOADED_HIDDEN } from '../motion';

/** A coaster of bar trivia: one story at a time, another on request. */
export function BarTalk() {
  const [i, setI] = useState(() => Math.floor(Math.random() * FACTS.length));
  const another = () => setI((v) => (v + 1 + Math.floor(Math.random() * (FACTS.length - 1))) % FACTS.length);
  const sourceNotes = FACT_SOURCES[FACTS[i]];
  return (
    <motion.aside
      className="bartalk"
      initial={LOADED_HIDDEN ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, ease: EASE }}
    >
      <span className="bartalk-mark" aria-hidden>“</span>
      <div className="bartalk-body">
        <div className="bartalk-head">
          <span className="k-label">Bar Talk · Nº {String(i + 1).padStart(2, '0')}</span>
          <button className="text-btn" onClick={another}>
            Another one <Shuffle size={12} />
          </button>
        </div>
        <p>{FACTS[i]}</p>
        {sourceNotes && <div className="bartalk-sources">{sourceNotes.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" title={source.title}>Source · {source.publisher} <span aria-hidden="true">↗</span></a>)}</div>}
      </div>
    </motion.aside>
  );
}

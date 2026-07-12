import { useState } from 'react';
import { FACTS } from '../data/facts';
import { Shuffle } from '../icons';

/** A coaster of bar trivia: one story at a time, another on request. */
export function BarTalk() {
  const [i, setI] = useState(() => Math.floor(Math.random() * FACTS.length));
  const another = () => setI((v) => (v + 1 + Math.floor(Math.random() * (FACTS.length - 1))) % FACTS.length);
  return (
    <aside className="bartalk">
      <div className="bartalk-head">
        <span className="k-label">BAR TALK · Nº {String(i + 1).padStart(2, '0')}</span>
        <button className="text-btn" onClick={another}>
          ANOTHER ONE <Shuffle size={12} />
        </button>
      </div>
      <p>{FACTS[i]}</p>
    </aside>
  );
}

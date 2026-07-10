import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { KNOWLEDGE } from '../data/knowledge';
import { ToolIcon } from '../icons';
import { EASE } from '../motion';

/** Field manual — grouped glossary with accordion definitions. */
export function Knowledge() {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="manual">
      {KNOWLEDGE.map((group) => (
        <div className="manual-group" key={group.id}>
          <div className="manual-group-head">
            <span className="manual-index">{group.index}</span>
            <div>
              <h3 className="manual-title">{group.title}</h3>
              <p className="k-label dim">{group.note.toUpperCase()}</p>
            </div>
            <span className="k-label dim manual-count">{String(group.terms.length).padStart(2, '0')} ENTRIES</span>
          </div>
          <ul className="manual-list">
            {group.terms.map((t, i) => {
              const id = `${group.id}-${t.id}`;
              const open = openId === id;
              return (
                <li key={id} className={open ? 'open' : ''}>
                  <button
                    className="manual-row"
                    aria-expanded={open}
                    onClick={() => setOpenId(open ? null : id)}
                  >
                    <span className="k-label manual-no">
                      {group.index}·{String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="manual-term">{t.term}</span>
                    <span className="manual-plus" aria-hidden>
                      {open ? '−' : '+'}
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        className="manual-body-wrap"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.38, ease: EASE }}
                      >
                        <div className="manual-body">
                          <p>{t.def}</p>
                          <span className="manual-icon">
                            <ToolIcon id={t.icon} size={56} />
                          </span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

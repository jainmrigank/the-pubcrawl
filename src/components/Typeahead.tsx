import { useEffect, useRef, useState } from 'react';
import { searchIngredients } from '../api';
import type { Ingredient } from '../types';
import { IngredientIcon } from './IngredientIcon';
import { Plus } from '../icons';

interface Props {
  onAdd: (ing: Ingredient) => void;
}

/** Debounced ingredient typeahead backed by /api/ingredients/search. */
export function Typeahead({ onAdd }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Ingredient[]>([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    const t = setTimeout(() => {
      searchIngredients(q)
        .then((r) => {
          setResults(r);
          setOpen(true);
          setHi(0);
        })
        .catch(() => {});
    }, 160);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const freeTextRow = q.trim() && !results.some((r) => r.name.toLowerCase() === q.trim().toLowerCase());
  const optionCount = results.length + (freeTextRow ? 1 : 0);

  const choose = (idx: number) => {
    if (idx < results.length) onAdd(results[idx]);
    else if (freeTextRow) onAdd({ name: q.trim(), category: 'Other', image: '' });
    setQ('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open || !optionCount) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHi((h) => (h + 1) % optionCount);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi((h) => (h - 1 + optionCount) % optionCount);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(hi);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="typeahead" ref={boxRef}>
      <div className="field">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => q.trim() && setOpen(true)}
          placeholder="GIN, MINT, WHATEVER YOU'VE GOT…"
          aria-label="Search ingredients"
        />
      </div>
      {open && optionCount > 0 && (
        <ul className="ta-drop" role="listbox">
          {results.map((r, i) => (
            <li
              key={r.name}
              role="option"
              aria-selected={i === hi}
              className={i === hi ? 'hi' : ''}
              onMouseEnter={() => setHi(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(i);
              }}
            >
              <IngredientIcon category={r.category} size={22} />
              <span className="ta-name">{r.name}</span>
              <span className="ta-cat">{r.category}</span>
            </li>
          ))}
          {freeTextRow && (
            <li
              role="option"
              aria-selected={hi === results.length}
              className={`ta-free ${hi === results.length ? 'hi' : ''}`}
              onMouseEnter={() => setHi(results.length)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(results.length);
              }}
            >
              <Plus size={14} />
              <span className="ta-name">ADD “{q.trim().toUpperCase()}” ANYWAY</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

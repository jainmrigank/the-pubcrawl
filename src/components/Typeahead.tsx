import { ingredientGuide, ingredientLabel } from '../../shared/ingredient-guide';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { searchIngredients } from '../api';
import { searchLocalIngredients } from '../localData';
import type { Ingredient } from '../types';
import { IngredientIcon } from './IngredientIcon';
import { Plus } from '../icons';

interface Props {
  onAdd: (ing: Ingredient) => void;
  label?: string;
  placeholder?: string;
}

// A small starter list is available immediately, without loading the full catalogue.
const COMMON_INGREDIENTS: Ingredient[] = [
  { name: 'Vodka', category: 'Spirit' },
  { name: 'Gin', category: 'Spirit' },
  { name: 'White Rum', category: 'Spirit' },
  { name: 'Whiskey', category: 'Spirit' },
  { name: 'Tequila', category: 'Spirit' },
  { name: 'Lemon juice', category: 'Juice' },
  { name: 'Lime juice', category: 'Juice' },
  { name: 'Orange juice', category: 'Juice' },
  { name: 'Soda Water', category: 'Soda & Mixer' },
  { name: 'Sugar', category: 'Syrup & Sweetener' },
  { name: 'Mint', category: 'Herb & Spice' },
  { name: 'Ice', category: 'Other' },
].map(ingredient => ({ ...ingredient, image: `https://www.thecocktaildb.com/images/ingredients/${encodeURIComponent(ingredient.name)}-small.png` }));

/** Common choices on focus, then debounced catalogue/alias search as the user types. */
export function Typeahead({ onAdd, label = 'Search ingredients', placeholder = 'Gin, mint, whatever you’ve got…' }: Props) {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState<{ query: string; items: Ingredient[] }>({ query: '', items: [] });
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [placement, setPlacement] = useState({ above: false, height: 330 });
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const query = q.trim();
  const loading = Boolean(query && search.query !== query);
  const results = query ? loading ? [] : search.items : COMMON_INGREDIENTS;

  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const field = boxRef.current?.getBoundingClientRect();
      if (!field) return;
      const viewport = window.visualViewport;
      const top = Math.max(viewport?.offsetTop ?? 0, document.querySelector('.house-nav')?.getBoundingClientRect().bottom ?? 0);
      const phoneNav = document.querySelector('.house-mobile-links')?.getBoundingClientRect();
      const bottom = Math.min((viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight), phoneNav?.height ? phoneNav.top : innerHeight);
      const below = bottom - field.bottom - 12, above = field.top - top - 12;
      const next = { above: below < 220 && above > below, height: 0 };
      next.height = Math.max(44, Math.min(330, next.above ? above : below));
      setPlacement(current => current.above === next.above && current.height === next.height ? current : next);
    };
    position();
    window.addEventListener('scroll', position, true);
    window.addEventListener('resize', position);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    return () => {
      window.removeEventListener('scroll', position, true);
      window.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
    };
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    if (!query) return;
    const accept = (items: Ingredient[]) => { if (!cancelled) setSearch({ query, items }); };
    const t = setTimeout(() => {
      searchLocalIngredients(query)
        .then(accept)
        .catch(() => { if (!cancelled) return searchIngredients(query).then(accept).catch(() => accept([])); });
    }, 160);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const freeTextRow = Boolean(query && !loading && !results.some((r) => r.name.toLowerCase() === query.toLowerCase()));
  const optionCount = results.length + (freeTextRow ? 1 : 0);

  useEffect(() => {
    if (open) boxRef.current?.querySelector('.ta-drop [aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, hi, results]);

  const choose = (idx: number) => {
    if (idx < results.length) onAdd(results[idx]);
    else if (freeTextRow) onAdd({ name: q.trim(), category: 'Other', image: '' });
    setQ('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi(0); setOpen(true); }
      return;
    }
    if (!optionCount) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHi((h) => (h + 1) % optionCount);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi((h) => (h - 1 + optionCount) % optionCount);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(hi);
    }
  };

  return (
    <div className="typeahead" ref={boxRef} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <div className="field">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setHi(0); setOpen(true); }}
          onKeyDown={onKey}
          onFocus={() => { setHi(0); setOpen(true); }}
          onClick={() => setOpen(true)}
          placeholder={placeholder}
          aria-label={label}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && optionCount ? `${listId}-${hi}` : undefined}
          autoComplete="off"
        />
      </div>
      {open && (optionCount > 0 || loading) && (
        <ul className={`ta-drop${placement.above ? ' is-above' : ''}`} style={{ maxHeight: placement.height }} id={listId} role="listbox" tabIndex={-1} aria-label={query ? 'Matching ingredients' : 'Common ingredients'} aria-busy={loading}>
          <li className="ta-caption" role="presentation">{loading ? 'Searching…' : query ? 'Matching ingredients' : 'Common ingredients'}</li>
          {results.map((r, i) => (
            <li
              key={r.name}
              id={`${listId}-${i}`}
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
              <span className="ta-name">{r.name}{ingredientGuide(r.name) && ingredientLabel(r.name) !== r.name && <span className="ingredient-description">{ingredientGuide(r.name)?.description}</span>}{r.category === 'Prepared ingredient' && <span className="ingredient-description">Add only when already made</span>}</span>
              <span className="ta-cat">{r.category}</span>
            </li>
          ))}
          {freeTextRow && (
            <li
              id={`${listId}-${results.length}`}
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
              <span className="ta-name">Add “{q.trim()}” anyway</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

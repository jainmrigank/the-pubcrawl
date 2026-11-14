import { useEffect, useMemo, useRef, useState } from 'react';
import { pantryAnalysis } from '../../atlasMath';
import { catalogue } from '../atlas/data';
import { menuLink } from '../../landingStories';
import { ArrowLeft, ArrowRight, Check, Plus, X } from '../../icons';

const initial = ['gin', 'lemon juice', 'sugar', 'ice'];
const groups = ['Ready now', 'Need 1 ingredient', 'Need 2 ingredients', 'Need 3+ ingredients'];
const PAGE_SIZE = 4;
const nameOf = (id: string) => catalogue.ingredients.find(item => item.id === id)?.name || id;

export function PantryStudy() {
  const [pantry, setPantry] = useState(initial);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState(1);
  const [page, setPage] = useState(0);
  const [unlocked, setUnlocked] = useState<string[]>([]);
  const picker = useRef<HTMLDetailsElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const analysis = useMemo(() => pantryAnalysis(catalogue.recipes, pantry), [pantry]);
  const next = analysis.next[0];
  const ingredients = (query.trim()
    ? catalogue.ingredients.filter(item => item.name.toLowerCase().includes(query.trim().toLowerCase()))
    : catalogue.ingredients.slice(0, 24)).slice(0, 24);
  const recipes = [...analysis.groups[group]].sort((a, b) => Number(unlocked.includes(b.id)) - Number(unlocked.includes(a.id)) || Number(b.classic) - Number(a.classic) || a.name.localeCompare(b.name));
  const pages = Math.max(1, Math.ceil(recipes.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);

  const closePicker = (focus = false) => {
    if (picker.current) picker.current.open = false;
    if (focus) picker.current?.querySelector('summary')?.focus();
  };
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!picker.current?.contains(event.target as Node)) closePicker(); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && picker.current?.open) { event.preventDefault(); closePicker(true); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, []);

  const toggle = (id: string) => {
    setPantry(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
    setPage(0);
    setUnlocked([]);
  };
  const addNext = () => {
    if (!next) return;
    setUnlocked(analysis.groups[1].filter(recipe => analysis.missing.get(recipe.id)?.[0] === next[0]).map(recipe => recipe.id));
    setPantry(current => [...current, next[0]]);
    setGroup(0);
    setPage(0);
  };

  return <div className="pantry-study">
    <section className="pantry-step" aria-labelledby="pantry-pick-heading">
      <div className="study-step-heading"><h4 id="pantry-pick-heading"><span>1</span>Your test shelf</h4><a href="#/bar">Open Shelf <ArrowRight size={16} /></a></div>
      <div className="pantry-shelf-line" role="group" aria-label="Test shelf ingredients">
        {pantry.map(id => <button type="button" className="pantry-shelf-item" key={id} aria-label={`Remove ${nameOf(id)}`} onClick={() => toggle(id)}>{nameOf(id)}<X size={13} /></button>)}
        {!pantry.length && <span className="pantry-shelf-empty">Start with an ingredient.</span>}
        <details className="pantry-picker" ref={picker} onToggle={event => { if (event.currentTarget.open) search.current?.focus(); else setQuery(''); }}>
          <summary><Plus size={16} />Add ingredient</summary>
          <div className="pantry-picker-panel">
            <div className="pantry-picker-head"><label htmlFor="pantry-study-search" className="sr-only">Find an ingredient</label><input id="pantry-study-search" ref={search} value={query} onChange={event => setQuery(event.target.value)} placeholder="Find an ingredient…" autoComplete="off" /><button type="button" className="house-icon-button" aria-label="Close ingredient picker" onClick={() => closePicker(true)}><X size={18} /></button></div>
            <div className="pantry-picker-options" role="group" aria-label="Ingredient choices">{ingredients.map(item => <button type="button" key={item.id} aria-label={`${pantry.includes(item.id) ? 'Remove' : 'Add'} ${item.name}`} aria-pressed={pantry.includes(item.id)} onClick={() => toggle(item.id)}>{item.name}{pantry.includes(item.id) ? <Check size={15} /> : <Plus size={15} />}</button>)}{!ingredients.length && <p>No matching ingredients.</p>}</div>
          </div>
        </details>
        <button type="button" className="pantry-clear" disabled={!pantry.length} onClick={() => { setPantry([]); setUnlocked([]); setPage(0); }}>Clear</button>
      </div>
    </section>
    <section className="pantry-step" aria-labelledby="pantry-next-heading">
      <div className="study-step-heading"><h4 id="pantry-next-heading"><span>2</span>Your best next addition</h4></div>
      {next ? <div className="pantry-next" aria-live="polite"><div><span className="pantry-next-gain">+{next[1]} <small>recipes</small></span><h5>{nameOf(next[0])}</h5></div><button type="button" className="btn" onClick={addNext}><Plus size={17} />Add to test shelf</button></div> : <p className="study-note">Add more ingredients to find your next addition.</p>}
    </section>
    <section className="pantry-step" aria-labelledby="pantry-recipes-heading">
      <div className="study-step-heading"><h4 id="pantry-recipes-heading"><span>3</span>Choose a drink</h4></div>
      <div className="pantry-readiness" role="group" aria-label="Recipe readiness">{analysis.groups.map((rows, index) => <button type="button" key={index} aria-pressed={group === index} onClick={() => { setGroup(index); setPage(0); }}><span className="pantry-readiness-top"><strong>{rows.length}</strong>{group === index && <Check size={15} />}</span><span>{groups[index]}</span><i aria-hidden="true"><b style={{ width: `${rows.length / catalogue.recipes.length * 100}%` }} /></i></button>)}</div>
      <div className="pantry-recipe-list">{recipes.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map(recipe => {
        const missing = analysis.missing.get(recipe.id)!;
        return <a href={menuLink(recipe.name)} key={recipe.id}><span><strong>{recipe.name}{unlocked.includes(recipe.id) && <small className="pantry-new">New</small>}</strong><small>{missing.length ? `Needs ${missing.slice(0, 2).map(nameOf).join(', ')}${missing.length > 2 ? ` +${missing.length - 2}` : ''}` : 'All ingredients on this shelf'}</small></span><ArrowRight size={18} /></a>;
      })}{!recipes.length && <p className="study-note">No recipes in this group.</p>}</div>
      <nav className="study-pagination" aria-label="Shelf study recipes"><span aria-live="polite">{recipes.length ? `${current * PAGE_SIZE + 1}–${Math.min((current + 1) * PAGE_SIZE, recipes.length)} of ${recipes.length}` : '0 recipes'}</span><div><button type="button" aria-label="Previous shelf recipes" disabled={!current} onClick={() => setPage(current - 1)}><ArrowLeft size={18} /></button><button type="button" aria-label="Next shelf recipes" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}><ArrowRight size={18} /></button></div></nav>
      <p className="study-note">Ingredient matches only. Ice & garnish count. Your Shelf stays unchanged.</p>
    </section>
  </div>;
}

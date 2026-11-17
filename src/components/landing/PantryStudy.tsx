import { useEffect, useMemo, useRef, useState } from 'react';
import { GUIDE_INGREDIENTS, ingredientLabel, searchIngredientIndex } from '../../../shared/ingredient-guide';
import { norm } from '../../../shared/catalog-engine';
import { pantryAnalysis } from '../../atlasMath';
import { catalogue } from '../atlas/data';
import { ArrowRight, Check, Plus, Search, X } from '../../icons';
import { StudyRecipes, type StudyActions } from './StudyRecipes';

const optionsByName = new Map<string, { id: string; name: string }>();
for (const item of [...catalogue.ingredients, ...GUIDE_INGREDIENTS]) {
  const id = norm(item.name);
  if (!optionsByName.has(id)) optionsByName.set(id, { id, name: item.name });
}
const ingredientOptions = [...optionsByName.values()];
const nameOf = (id: string) => ingredientOptions.find(item => item.id === norm(id))?.name || id;
const labels = ['Can make', 'Need 1', 'Need 2'];

/** Editing is local until the explicit Add & open Shelf action. */
export function PantryStudy({ actions }: { actions: StudyActions }) {
  const [pantry, setPantry] = useState(() => actions.shelf.map(item => norm(item.name)));
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const editorRoot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pickerOpen) return;
    const outside = (event: PointerEvent) => {
      if (!editorRoot.current?.contains(event.target as Node)) { setPickerOpen(false); setQuery(''); }
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [pickerOpen]);
  const analysis = useMemo(() => pantryAnalysis(catalogue.recipes, pantry, { suggestions: false }), [pantry]);
  const recipes = useMemo(() => pantry.length ? [...analysis.groups[group]].sort((a, b) => Number(b.classic) - Number(a.classic) || a.name.localeCompare(b.name)) : [], [analysis, group, pantry.length]);
  const ingredients = (query.trim() ? searchIngredientIndex(ingredientOptions, query, 30) : ingredientOptions).filter(item => !pantry.includes(item.id)).slice(0, 18);
  const add = (id: string) => { setPantry(current => current.includes(id) ? current : [...current, id]); setQuery(''); search.current?.focus(); };
  const closePicker = (restoreFocus = false) => { if (restoreFocus) search.current?.focus({ preventScroll: true }); setPickerOpen(false); setQuery(''); };
  const editor = <div className="finder-editor" ref={editorRoot} onKeyDown={event => { if (event.key === 'Escape' && pickerOpen) { event.preventDefault(); closePicker(true); } }}>
    <div className="finder-search"><Search size={17} /><input id="pantry-study-search" ref={search} aria-label="Add an ingredient" placeholder="Add an ingredient…" autoComplete="off" value={query} aria-controls="finder-ingredient-options" onFocus={() => setPickerOpen(true)} onChange={event => { setQuery(event.target.value); setPickerOpen(true); }} onKeyDown={event => { if (event.key === 'Enter' && ingredients.length) { event.preventDefault(); add(ingredients[0].id); } }} />{pickerOpen && <button type="button" aria-label="Close ingredient choices" onClick={() => closePicker(true)}><X size={17} /></button>}</div>
    {pickerOpen && <div className="finder-ingredient-picker" id="finder-ingredient-options"><div className="finder-picker-caption"><span>{query.trim() ? 'Matching ingredients' : 'Common ingredients'}</span><button type="button" onClick={() => closePicker(true)}>Done <Check size={14} /></button></div><div className="finder-ingredient-options">{ingredients.map(item => <button type="button" key={item.id} onClick={() => add(item.id)}>{ingredientLabel(item.name)}<Plus size={14} /></button>)}{!ingredients.length && <p>No matching ingredients.</p>}</div></div>}
    <div className="finder-selected" role="group" aria-label="Your ingredients">{pantry.map(id => <button type="button" className="pantry-shelf-item" key={id} aria-label={'Remove ' + nameOf(id)} onClick={() => setPantry(current => current.filter(item => item !== id))}>{nameOf(id)}<X size={13} /></button>)}</div>
    {pantry.length > 0 && <div className="finder-shelf-action"><a className="study-button is-primary" href="#/bar" onClick={() => actions.onAddToShelf(pantry.map(id => ({ name: nameOf(id), category: '', image: '' })))}>Add & open Shelf<ArrowRight size={17} /></a><span>Adds these ingredients. Keeps your Shelf.</span></div>}
  </div>;
  return <div className="pantry-study focus-return-finder">
    <StudyRecipes actions={actions} recipes={recipes} contextKey={pantry.join('|') + ':' + group} missing={analysis.missing} availability={analysis.availability} ingredientName={nameOf} available={pantry} onEdit={() => { search.current?.focus(); search.current?.scrollIntoView({ block: 'center', behavior: 'instant' }); }} empty={pantry.length ? group === 0 ? 'No complete matches yet. Try Need 1 or Need 2.' : 'No matches. Add another ingredient.' : 'Add ingredients to find drinks.'} toolbar={<>{editor}<div className="finder-result-tabs" role="group" aria-label="Ingredients needed">{labels.map((label, index) => <button type="button" key={label} aria-pressed={group === index} onClick={() => { setGroup(index); closePicker(); }}>{label}<span>{pantry.length ? analysis.groups[index].length : 0}</span></button>)}</div></>} />
  </div>;
}

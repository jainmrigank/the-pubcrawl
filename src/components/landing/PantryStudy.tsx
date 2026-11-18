import { useMemo, useRef, useState } from 'react';
import { GUIDE_INGREDIENTS } from '../../../shared/ingredient-guide';
import { norm } from '../../../shared/catalog-engine';
import { pantryAnalysis } from '../../atlasMath';
import { catalogue } from '../atlas/data';
import { ArrowRight, X } from '../../icons';
import { Typeahead } from '../Typeahead';
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
  const [group, setGroup] = useState(0);
  const editorRoot = useRef<HTMLDivElement>(null);
  const analysis = useMemo(() => pantryAnalysis(catalogue.recipes, pantry, { suggestions: false }), [pantry]);
  const recipes = useMemo(() => pantry.length ? [...analysis.groups[group]].sort((a, b) => Number(b.classic) - Number(a.classic) || a.name.localeCompare(b.name)) : [], [analysis, group, pantry.length]);
  const add = (id: string) => setPantry(current => current.includes(id) ? current : [...current, id]);
  const editor = <div className="finder-editor" ref={editorRoot}>
    <Typeahead label="Add an ingredient" onAdd={ingredient => add(norm(ingredient.name))} />
    <div className="finder-selected" role="group" aria-label="Your ingredients">{pantry.map(id => <button type="button" className="pantry-shelf-item" key={id} aria-label={'Remove ' + nameOf(id)} onClick={() => setPantry(current => current.filter(item => item !== id))}>{nameOf(id)}<X size={13} /></button>)}</div>
    {pantry.length > 0 && <div className="finder-shelf-action"><a className="study-button is-primary" href="#/bar" onClick={() => actions.onAddToShelf(pantry.map(id => ({ name: nameOf(id), category: '', image: '' })))}>Add & open Shelf<ArrowRight size={17} /></a><span>Adds these ingredients. Keeps your Shelf.</span></div>}
  </div>;
  return <div className="pantry-study focus-return-finder">
    <StudyRecipes actions={actions} recipes={recipes} contextKey={pantry.join('|') + ':' + group} missing={analysis.missing} availability={analysis.availability} ingredientName={nameOf} available={pantry} onEdit={() => { const input = editorRoot.current?.querySelector('input'); input?.focus({ preventScroll: true }); input?.scrollIntoView({ block: 'center', behavior: 'instant' }); }} empty={pantry.length ? group === 0 ? 'No complete matches yet. Try Need 1 or Need 2.' : 'No matches. Add another ingredient.' : 'Add ingredients to find drinks.'} toolbar={<>{editor}<div className="finder-result-tabs" role="group" aria-label="Ingredients needed">{labels.map((label, index) => <button type="button" key={label} aria-pressed={group === index} onClick={() => setGroup(index)}>{label}<span>{pantry.length ? analysis.groups[index].length : 0}</span></button>)}</div></>} />
  </div>;
}

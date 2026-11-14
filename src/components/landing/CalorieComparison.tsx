import { useId, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight } from '../../icons';
import { menuLink } from '../../landingStories';
import { calorieDrinks, drinkEnergy, energyIngredients, roundedKcal, type CalorieDrink } from '../../calorieData';
import { HomeStudy } from './HomeStudy';

const MAX_KCAL = Math.ceil(Math.max(...calorieDrinks.map(drink => drinkEnergy(drink).total)) / 100) * 100;
const PAGE_SIZE = 8;
const groups = [{ id: 'cocktail', label: 'Cocktails' }, { id: 'reference', label: 'Beer & wine' }, { id: 'shot', label: '30 ml shots' }] as const;
const references = calorieDrinks.filter(drink => drink.group === 'reference' || drink.id === 'shot-vodka');
const format = (value: number) => value.toLocaleString('en', { maximumFractionDigits: 2 });

function RecipeEstimate({ drink }: { drink: CalorieDrink }) {
  return <div className="calorie-recipe">
    <p className="calorie-detail-heading">Stated pour <span>{Math.round(drinkEnergy(drink).alcohol / drinkEnergy(drink).total * 100)}% of calories from alcohol</span></p>
    <dl>{drink.parts.map(([id, quantity]) => <div key={id}><dt>{energyIngredients[id].name}</dt><dd>{format(quantity)} {energyIngredients[id].unit}</dd></div>)}</dl>
    {drink.menuQuery && <div className="calorie-recipe-links"><a href={menuLink(drink.menuQuery)}>Find the drink <ArrowRight size={16} /></a></div>}
  </div>;
}

export function CalorieComparison() {
  const [filter, setFilter] = useState('cocktail');
  const [sort, setSort] = useState('list');
  const [page, setPage] = useState(0);
  const [referenceId, setReferenceId] = useState('shot-vodka');
  const [selected, setSelected] = useState<string | null>(null);
  const instance = useId();
  const ordered = useMemo(() => {
    const drinks = calorieDrinks.filter(drink => drink.group === filter);
    return sort === 'list' ? drinks : [...drinks].sort((a, b) => (sort === 'high' ? -1 : 1) * (drinkEnergy(a).total - drinkEnergy(b).total) || a.name.localeCompare(b.name));
  }, [filter, sort]);
  const pages = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = ordered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const reference = references.find(drink => drink.id === referenceId)!;
  const referenceKcal = drinkEnergy(reference).total;

  return <HomeStudy id="calories" number="02" label="A LITTLE POUR PERSPECTIVE" title="Calories, by the glass." intro="Choose a serving. See how it compares." meta={`${calorieDrinks.length} servings · Estimated kcal`} className="calorie-comparison" tour="landing-discovery">
    <div className="calorie-filters" role="group" aria-label="Drinks in calorie comparison">{groups.map(option => <button type="button" key={option.id} aria-pressed={filter === option.id} onClick={() => { setFilter(option.id); setPage(0); setSelected(null); }}>{option.label}<small aria-hidden="true">{calorieDrinks.filter(drink => drink.group === option.id).length}</small></button>)}</div>
    <div className="calorie-toolbar">
      <label className="calorie-sort"><span>Order</span><select aria-label="Calorie order" value={sort} onChange={event => { setSort(event.target.value); setPage(0); }}><option value="list">Bar order</option><option value="kcal">Lower kcal first</option><option value="high">Higher kcal first</option></select></label>
      <label className="calorie-sort"><span>Compare</span><select aria-label="Reference serving" value={referenceId} onChange={event => setReferenceId(event.target.value)}>{references.map(drink => <option key={drink.id} value={drink.id}>{drink.name} · {drink.serving}</option>)}</select></label>
    </div>
    <div className="calorie-legend"><span><i className="calorie-alcohol" />Alcohol</span><span><i className="calorie-other" />Mixers & more</span><span className="calorie-reference-key"><i />Reference: {roundedKcal(referenceKcal)} kcal</span></div>
    <section className="calorie-group" aria-label={groups.find(group => group.id === filter)!.label}>
      <div className="calorie-axis" aria-hidden="true"><div><span>0</span><span>{MAX_KCAL / 2}</span><span>{MAX_KCAL} kcal</span></div></div>
      <ol className="calorie-rows" start={current * PAGE_SIZE + 1}>{visible.map(drink => {
        const energy = drinkEnergy(drink), expanded = selected === drink.id;
        const detailId = `${instance}-${drink.id}-detail`;
        return <li className={expanded ? 'is-selected' : undefined} key={drink.id} data-calorie-drink={drink.id}>
          <button type="button" className="calorie-row" aria-expanded={expanded} aria-controls={expanded ? detailId : undefined} aria-label={`${drink.name}, approximately ${roundedKcal(energy.total)} kcal per ${drink.serving.toLowerCase()}. ${expanded ? 'Hide' : 'Show'} measures.`} onClick={() => setSelected(expanded ? null : drink.id)}>
            <span className="calorie-name">{drink.name}{drink.group !== 'cocktail' && <small>{drink.serving}</small>}</span>
            <span className="calorie-track" aria-hidden="true"><i className="calorie-alcohol" style={{ width: `${energy.alcohol / MAX_KCAL * 100}%` }} /><i className="calorie-other" style={{ width: `${energy.other / MAX_KCAL * 100}%` }} /><b className="calorie-reference-line" style={{ left: `${referenceKcal / MAX_KCAL * 100}%` }} /></span>
            <span className="calorie-value">{roundedKcal(energy.total)}<span className="calorie-row-sign" aria-hidden="true">{expanded ? '−' : '+'}</span></span>
          </button>
          {expanded && <div id={detailId}><RecipeEstimate drink={drink} /></div>}
        </li>;
      })}</ol>
    </section>
    <nav className="study-pagination" aria-label="Calorie servings"><span aria-live="polite">{current * PAGE_SIZE + 1}–{Math.min((current + 1) * PAGE_SIZE, ordered.length)} of {ordered.length}</span><div><button type="button" aria-label="Previous calorie servings" disabled={!current} onClick={() => setPage(current - 1)}><ArrowLeft size={18} /></button><button type="button" aria-label="Next calorie servings" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}><ArrowRight size={18} /></button></div></nav>
    <p className="study-note">Estimates per stated serving, rounded to 5 kcal. Bar pours vary.</p>
  </HomeStudy>;
}

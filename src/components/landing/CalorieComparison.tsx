import { useId, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight } from '../../icons';
import { menuLink } from '../../landingStories';
import { calorieDrinks, drinkEnergy, energyIngredients, roundedKcal, type CalorieDrink } from '../../calorieData';
import { HomeStudy } from './HomeStudy';
import { PagedCarousel } from '../PagedCarousel';

const PAGE_SIZE = 4;
const groups = [{ id: 'cocktail', label: 'Cocktails' }, { id: 'beer', label: 'Beer' }, { id: 'wine', label: 'Wine' }, { id: 'shot', label: 'Shots' }] as const;
const format = (value: number) => value.toLocaleString('en', { maximumFractionDigits: 2 });

function RecipeEstimate({ drink }: { drink: CalorieDrink }) {
  const profile = drink.group === 'beer' || drink.group === 'wine' ? energyIngredients[drink.parts[0][0]] : undefined;
  if (profile) return <div className="calorie-recipe calorie-profile"><p>{drink.note}</p><a href={profile.source.url} target="_blank" rel="noreferrer">Nutrition <ArrowRight size={16} /></a></div>;
  return <div className="calorie-recipe">
    <p className="calorie-detail-heading">Stated pour <span>{Math.round(drinkEnergy(drink).alcohol / drinkEnergy(drink).total * 100)}% of calories from alcohol</span></p>
    <dl>{drink.parts.map(([id, quantity]) => <div key={id}><dt>{energyIngredients[id].name}</dt><dd>{format(quantity)} {energyIngredients[id].unit}</dd></div>)}</dl>
    {drink.menuQuery && <div className="calorie-recipe-links"><a href={menuLink(drink.menuQuery)}>Find the drink <ArrowRight size={16} /></a></div>}
  </div>;
}

export function CalorieComparison() {
  const [filter, setFilter] = useState('cocktail');
  const [sort, setSort] = useState('kcal');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const instance = useId();
  const ordered = useMemo(() => {
    const drinks = calorieDrinks.filter(drink => drink.group === filter);
    return [...drinks].sort((a, b) => (sort === 'high' ? -1 : 1) * (drinkEnergy(a).total - drinkEnergy(b).total) || a.name.localeCompare(b.name));
  }, [filter, sort]);
  const pages = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const turnPage = (delta: number) => {
    setPage(value => Math.max(0, Math.min(pages - 1, value + delta)));
    setSelected(null);
  };
  // A consistent scale across every page of this category, independent of sort.
  const maxKcal = Math.ceil(Math.max(...ordered.map(drink => drinkEnergy(drink).total)) / 100) * 100;
  const serving = filter === 'beer' ? '568 ml pint' : filter === 'wine' ? '150 ml glass' : filter === 'shot' ? '30 ml per shot' : 'One cocktail';

  return <HomeStudy id="calories" label="CALORIES" title="Calories, by the glass." intro="Compare cocktails, beer, wine and shots." meta="" className="calorie-comparison" tour="landing-discovery">
    <div className="study-controls calorie-controls">
    <div className="calorie-filters" role="group" aria-label="Drinks in calorie comparison">{groups.map(option => <button type="button" key={option.id} aria-pressed={filter === option.id} onClick={() => { setFilter(option.id); setPage(0); setSelected(null); }}>{option.label}</button>)}</div>
    <div className="calorie-toolbar">
      <p className="calorie-serving">{serving}</p><label className="calorie-sort"><span>Sort</span><select aria-label="Calorie sort" value={sort} onChange={event => { setSort(event.target.value); setPage(0); setSelected(null); }}><option value="kcal">Lowest first</option><option value="high">Highest first</option></select></label>
    </div>
    <div className="calorie-legend"><span><i className="calorie-alcohol" />Alcohol</span><span><i className="calorie-other" />Other calories</span></div>
    </div>
    <PagedCarousel key={`${filter}-${sort}`} page={current} count={pages} onPageChange={value => { setPage(value); setSelected(null); }} label="Calorie pages">
    {pageIndex => <section className="calorie-group" aria-label={groups.find(group => group.id === filter)!.label}>
      <div className="calorie-axis" aria-hidden="true"><div><span>0</span><span>{maxKcal / 2}</span><span>{maxKcal} kcal</span></div></div>
      <ol className="calorie-rows" start={pageIndex * PAGE_SIZE + 1}>{ordered.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE).map(drink => {
        const energy = drinkEnergy(drink), expanded = selected === drink.id;
        const detailId = `${instance}-${drink.id}-detail`;
        return <li className={expanded ? 'is-selected' : undefined} key={drink.id} data-calorie-drink={drink.id}>
          <button type="button" className="calorie-row" aria-expanded={expanded} aria-controls={expanded ? detailId : undefined} aria-label={`${drink.name}, approximately ${roundedKcal(energy.total)} kcal per ${drink.serving.toLowerCase()}. ${expanded ? 'Hide' : 'Show'} measures.`} onClick={() => setSelected(expanded ? null : drink.id)}>
            <span className="calorie-name">{drink.name}{drink.group !== 'cocktail' && <small>{drink.serving.split(' · ')[1]} ABV</small>}</span>
            <span className="calorie-track" aria-hidden="true"><i className="calorie-alcohol" style={{ width: `${energy.alcohol / maxKcal * 100}%` }} /><i className="calorie-other" style={{ width: `${energy.other / maxKcal * 100}%` }} /></span>
            <span className="calorie-value">{roundedKcal(energy.total)}<span className="calorie-row-sign" aria-hidden="true">{expanded ? '−' : '+'}</span></span>
          </button>
          {expanded && <div id={detailId}><RecipeEstimate drink={drink} /></div>}
        </li>;
      })}</ol>
    </section>}
    </PagedCarousel>
    <nav className="study-pagination" aria-label="Calorie servings"><span aria-live="polite">{current * PAGE_SIZE + 1}–{Math.min((current + 1) * PAGE_SIZE, ordered.length)} of {ordered.length}</span>{pages > 1 && <span className="pagination-swipe-hint" aria-hidden="true">Swipe left or right</span>}<div><button type="button" className="pagination-arrow" aria-label="Previous calorie servings" disabled={!current} onClick={() => turnPage(-1)}><ArrowLeft size={18} /></button><button type="button" className="pagination-arrow" aria-label="Next calorie servings" disabled={current + 1 >= pages} onClick={() => turnPage(1)}><ArrowRight size={18} /></button></div></nav>
    <p className="study-note">{filter === 'beer' ? 'Named beer examples · Estimated kcal' : filter === 'wine' ? 'Representative styles · Estimated kcal' : 'Estimated kcal · Pours and brands vary.'}</p>
  </HomeStudy>;
}

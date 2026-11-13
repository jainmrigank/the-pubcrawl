import { useId, useMemo, useState } from 'react';
import { ArrowRight } from '../../icons';
import { menuLink } from '../../landingStories';
import { CALORIE_SOURCES, calorieDrinks, drinkEnergy, energyIngredients, roundedKcal, type CalorieDrink } from '../../calorieData';
import { HomeStudy } from './HomeStudy';

const MAX_KCAL = Math.ceil(Math.max(...calorieDrinks.map(drink => drinkEnergy(drink).total)) / 100) * 100;
const groups = [
  { id: 'cocktail', title: 'The cocktail list', note: '20 bestselling classics · one stated recipe each' },
  { id: 'reference', title: 'The familiar pours', note: 'A pint, a glass. Different measures.' },
  { id: 'shot', title: 'The short measures', note: '16 spirits & liqueurs · 30 ml each' },
] as const;
const format = (value: number) => value.toLocaleString('en', { maximumFractionDigits: 2 });

function RecipeEstimate({ drink }: { drink: CalorieDrink }) {
  const energy = drinkEnergy(drink);
  return <div className="calorie-recipe">
    <p><strong>About {roundedKcal(energy.total)} kcal</strong> in {drink.serving.toLowerCase()}. About {Math.round(energy.alcohol / energy.total * 100)}% comes from alcohol.</p>
    <dl>{drink.parts.map(([id, quantity]) => <div key={id}><dt>{energyIngredients[id].name}</dt><dd>{format(quantity)} {energyIngredients[id].unit} <span>≈ {roundedKcal(quantity / 100 * energyIngredients[id].kcalPer100)} kcal</span></dd></div>)}</dl>
    {drink.note && <p>{drink.note}</p>}
    <details className="calorie-ingredient-notes"><summary>Ingredient assumptions</summary><ul>{drink.parts.map(([id]) => <li key={id}><strong>{energyIngredients[id].name}.</strong> {energyIngredients[id].basis} <a href={energyIngredients[id].source.url} target="_blank" rel="noreferrer">Source ↗</a></li>)}</ul></details>
    <div className="calorie-recipe-links">
      {drink.menuQuery && <a href={menuLink(drink.menuQuery)}>Find the drink <ArrowRight size={16} /></a>}
      {drink.recipeSource && <a href={drink.recipeSource.url} target="_blank" rel="noreferrer">Recipe source ↗</a>}
    </div>
  </div>;
}

export function CalorieComparison() {
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('list');
  const [selected, setSelected] = useState<string | null>(null);
  const instance = useId();
  const visible = useMemo(() => calorieDrinks.filter(drink => filter === 'all' || drink.group === filter), [filter]);
  const ordered = (rows: CalorieDrink[]) => sort === 'list' ? rows : [...rows].sort((a, b) => drinkEnergy(a).total - drinkEnergy(b).total || a.name.localeCompare(b.name));
  const renderGroup = (group: typeof groups[number]) => {
    const drinks = ordered(visible.filter(drink => drink.group === group.id));
    if (!drinks.length) return null;
    return <section className={`calorie-group calorie-group-${group.id}`} key={group.id} aria-labelledby={`${instance}-${group.id}`}>
      <header><h3 id={`${instance}-${group.id}`}>{group.title}</h3><p>{group.note}</p></header>
      <div className="calorie-axis" aria-hidden="true"><div><span>0</span><span>{MAX_KCAL / 2}</span><span>{MAX_KCAL} kcal</span></div></div>
      <ol className="calorie-rows">{drinks.map(drink => {
        const energy = drinkEnergy(drink), expanded = selected === drink.id;
        const detailId = `${instance}-${drink.id}-detail`;
        return <li className={expanded ? 'is-selected' : undefined} key={drink.id} data-calorie-drink={drink.id}>
          <button type="button" className="calorie-row" aria-expanded={expanded} aria-controls={expanded ? detailId : undefined} aria-label={`${drink.name}, approximately ${roundedKcal(energy.total)} kcal per ${drink.serving.toLowerCase()}. ${expanded ? 'Hide' : 'Show'} recipe and assumptions.`} onClick={() => setSelected(expanded ? null : drink.id)}>
            <span className="calorie-name">{drink.name}<small>{drink.serving}</small></span>
            <span className="calorie-track" aria-hidden="true"><i className="calorie-alcohol" style={{ width: `${energy.alcohol / MAX_KCAL * 100}%` }} /><i className="calorie-other" style={{ width: `${energy.other / MAX_KCAL * 100}%` }} /></span>
            <span className="calorie-value">{roundedKcal(energy.total)}<span className="calorie-row-sign" aria-hidden="true">{expanded ? '−' : '+'}</span></span>
          </button>
          {expanded && <div id={detailId}><RecipeEstimate drink={drink} /></div>}
        </li>;
      })}</ol>
    </section>;
  };

  return <HomeStudy id="calories" number="02" label="A LITTLE POUR PERSPECTIVE" title="Calories, by the glass." intro="Compare calories per serving. Tap a drink for ingredients." meta={`${calorieDrinks.length} servings · One common calorie scale`} className="calorie-comparison" tour="landing-discovery">
    <aside className="calorie-insight"><span><strong>65</strong> <span>kcal, approximately</span></span><p>A 30 ml shot at 40% ABV. More alcohol or added sugar means more calories.</p></aside>
    <div className="calorie-toolbar">
      <div className="calorie-filters" role="group" aria-label="Drinks in calorie comparison">{[{ value: 'all', label: 'All drinks' }, { value: 'cocktail', label: 'Cocktails' }, { value: 'reference', label: 'Beer & wine' }, { value: 'shot', label: '30 ml shots' }].map(option => <button type="button" key={option.value} aria-pressed={filter === option.value} onClick={() => { setFilter(option.value); setSelected(null); }}>{option.label}</button>)}</div>
      <label className="calorie-sort"><span>Order</span><select aria-label="Calorie order" value={sort} onChange={event => setSort(event.target.value)}><option value="list">List order</option><option value="kcal">Lower kcal first</option></select></label>
    </div>
    <div className="calorie-legend"><span><i className="calorie-alcohol" />From alcohol</span><span><i className="calorie-other" />Other calories</span><span>Same 0–{MAX_KCAL} kcal scale throughout</span></div>
    <div className={`calorie-columns ${filter === 'all' ? '' : 'is-filtered'}`}>
      {renderGroup(groups[0])}
      <div className="calorie-comparators">{renderGroup(groups[1])}{renderGroup(groups[2])}</div>
    </div>
    <p className="calorie-footnote">Estimates per serving, rounded to 5 kcal. Other calories: sugars, mixers and remaining ingredient energy. Ice adds none; garnish excluded.</p>
    <details className="calorie-method"><summary>Sources & method</summary>
      <p>The cocktail selection is the top 20 in <a href={CALORIE_SOURCES.ranking.url} target="_blank" rel="noreferrer">Drinks International’s 2026 survey of award-winning bars</a>, not worldwide sales. List order follows that survey; the calorie sort works within each group.</p>
      <p>Most recipe quantities follow IBA. The Gimlet uses Plymouth’s recipe, Amaretto Sour uses Disaronno’s, and Bamboo follows Liquor.com. Each drink opens its recipe source and every ingredient assumption. These estimates describe the stated specification, which may differ from the recipe in our catalogue or a bar’s version.</p>
      <p>Energy is the sum of the stated ingredient quantities. Published producer / Alko nutrition is used where available. USDA food values use stated approximate densities to convert grams to millilitres. Simple syrup, honey syrup, Prosecco, fino, falernum and several mixers use explicit models. They are estimates rather than lab measurements.</p>
      <p>Alcohol energy = ml × ABV ÷ 100 × 0.789 g/ml × 7 kcal/g. The remainder is other calories. Component values are rounded independently; they can differ slightly from the rounded total. Beer is a 568 ml UK pint; wine is 150 ml; all shots are 30 ml. Shot strengths are representative, not universal for that spirit. Common spirit families and selected liqueurs are included; the list is not exhaustive.</p>
      <ul>{Object.values(CALORIE_SOURCES).map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a></li>)}</ul>
      <p>Checked 13 November 2026. Strength, syrup and serving size affect estimates.</p>
    </details>
    <details className="calorie-data"><summary>Read all {calorieDrinks.length} servings as a table</summary><div tabIndex={0} role="region" aria-label="Calorie estimates table" className="calorie-table-scroll"><table><caption>Estimated kcal per stated serving, rounded to the nearest 5</caption><thead><tr><th scope="col">Drink</th><th scope="col">Serving</th><th scope="col">Kcal</th><th scope="col">From alcohol</th></tr></thead><tbody>{calorieDrinks.map(drink => <tr key={drink.id}><th scope="row">{drink.name}</th><td>{drink.serving}</td><td>{roundedKcal(drinkEnergy(drink).total)}</td><td>{roundedKcal(drinkEnergy(drink).alcohol)}</td></tr>)}</tbody></table></div></details>
  </HomeStudy>;
}

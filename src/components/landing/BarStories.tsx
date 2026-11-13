import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from '../../icons';
import { cocktailRankings, filmDrinks, menuLink, rankingSources, rankingYears, recipeProportions } from '../../landingStories';
import ingredientData from '../../generated/landing_ingredients.json';
import { GlassDrawing } from './GlassDrawing';

function RankingStory() {
  const [selected, setSelected] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(700);
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const x = (i: number) => 28 + i * (width - 56) / 2;
  const y = (rank: number) => 30 + (rank - 1) * 33;
  const drink = cocktailRankings[selected];
  return <>
    <div className="story-title-row"><h3>Still ordering<br /><em>the usual?</em></h3><p>Five familiar names.<br />A changing order.</p></div>
    <div className="rank-layout">
      <div ref={host} className="rank-chart">
        <svg viewBox={'0 0 ' + width + ' 278'} role="img" aria-label={'Cocktail rankings, 2024 to 2026. ' + drink.name + ': ' + drink.ranks.join(', ')}>
          {[1, 3, 5, 7].map((rank) => <g key={rank}>
            <line x1={28} x2={width - 28} y1={y(rank)} y2={y(rank)} stroke="var(--line)" strokeDasharray="2 5" />
            <text x={0} y={y(rank) + 4} fill="var(--ink-60)" fontSize="11">{rank}</text>
          </g>)}
          {rankingYears.map((year, i) => <text key={year} x={x(i)} y={269} textAnchor="middle" fill="var(--ink-60)" fontSize="12">{year}</text>)}
          {[...cocktailRankings.map((entry, i) => ({ ...entry, i }))].sort((a, b) => Number(a.i === selected) - Number(b.i === selected)).map((entry) => {
            const isSelected = selected === entry.i;
            return <g key={entry.name} opacity={isSelected ? 1 : .25}>
              <path d={entry.ranks.map((rank, i) => (i ? 'L' : 'M') + x(i) + ' ' + y(rank)).join(' ')}
                fill="none" stroke={isSelected ? 'var(--accent)' : 'var(--ink)'} strokeWidth={isSelected ? 2.5 : 1.5} />
              {entry.ranks.map((rank, i) => <circle key={i} cx={x(i)} cy={y(rank)} r={isSelected ? 6 : 3}
                fill={isSelected ? 'var(--accent)' : 'var(--ink)'} stroke="var(--paper)" strokeWidth="2" />)}
            </g>;
          })}
        </svg>
      </div>
      <div className="rank-selectors" aria-label="Highlight a cocktail">
        {cocktailRankings.map((entry, i) => <button key={entry.name} type="button" onClick={() => setSelected(i)} onFocus={() => setSelected(i)} aria-pressed={selected === i}>
          <span>{entry.name}</span><span className="rank-value">{entry.ranks[2].toString().padStart(2, '0')}</span>
        </button>)}
        <a className="story-recipe-link" href={menuLink(drink.name)}>Find {drink.name} <ArrowRight size={16} /></a>
      </div>
    </div>
    <p className="story-source">Rank among surveyed award-winning bars · a changing panel of 100 bars, not worldwide sales.
      {' '}Drinks International: {rankingSources.map((source) => <a key={source.label} href={source.url} target="_blank" rel="noreferrer">{source.label}</a>)}
      <a href="https://drinksint.com/category/our-brands/the-cocktail-report/" target="_blank" rel="noreferrer">Methodology ↗</a>
    </p>
    <details className="story-data"><summary>Read the numbers</summary>
      <table><caption>Selected cocktail ranks in the Drinks International survey</caption>
        <thead><tr><th scope="col">Cocktail</th>{rankingYears.map((year) => <th key={year} scope="col">{year}</th>)}</tr></thead>
        <tbody>{cocktailRankings.map((entry) => <tr key={entry.name}><th scope="row">{entry.name}</th>{entry.ranks.map((rank, i) => <td key={i}>{rank}</td>)}</tr>)}</tbody>
      </table>
    </details>
  </>;
}

function RecipeStory() {
  return <>
    <div className="story-title-row"><h3>Same ingredients.<br /><em>Different intentions.</em></h3><p>It’s all in<br />the proportions.</p></div>
    <div className="proportion-grid">
      {recipeProportions.map((recipe) => {
        const total = recipe.ingredients.reduce((sum, [, ml]) => sum + ml, 0);
        let offset = 0;
        return <article className="proportion-recipe" key={recipe.name}>
          <div className="proportion-top"><GlassDrawing kind={recipe.glass} garnish={recipe.garnish} /><span className="proportion-total">{total}<small>ml</small></span></div>
          <a className="proportion-name" href={menuLink(recipe.name)}>{recipe.name} <ArrowRight size={17} /></a>
          <svg viewBox="0 0 300 18" preserveAspectRatio="none" role="img" aria-label={recipe.name + ' liquid proportions'} className="proportion-bar">
            {recipe.ingredients.map(([name, ml], i) => {
              const start = offset;
              offset += ml / total * 300;
              return <rect key={name} x={start} y="0" width={ml / total * 300} height="18" fill="var(--accent)" opacity={1 - i * .2} stroke="var(--paper)" strokeWidth="1">
                <title>{name + ': ' + ml + ' ml'}</title>
              </rect>;
            })}
          </svg>
          <dl>{recipe.ingredients.map(([name, ml], i) => <div key={name}>
            <dt><i style={{ opacity: 1 - i * .2 }} />{name}</dt><dd>{ml} ml</dd>
          </div>)}</dl>
          <p className="proportion-finish">{recipe.finish}</p>
          <a className="story-source" href={'https://iba-world.com/iba-cocktail/' + recipe.source + '/'} target="_blank" rel="noreferrer">IBA specification ↗</a>
        </article>;
      })}
    </div>
    <p className="story-source">Bars show ingredient shares within each recipe · liquid measures before ice and dilution. Glass drawings are illustrative.</p>
  </>;
}

function IngredientStory() {
  const [selected, setSelected] = useState(0);
  const ingredient = ingredientData.ingredients[selected];
  return <>
    <div className="story-title-row"><h3>The bottle<br /><em>knows people.</em></h3><p>One ingredient.<br />Plenty of company.</p></div>
    <div className="ingredient-choices" aria-label="Choose an ingredient">
      {ingredientData.ingredients.map((item, i) => <button type="button" key={item.name} onClick={() => setSelected(i)} aria-pressed={selected === i}>{item.name}</button>)}
    </div>
    <div className="ingredient-network">
      <svg viewBox="0 0 1000 420" preserveAspectRatio="none" fill="none" aria-hidden="true" className="ingredient-edges">
        {Array.from({ length: 8 }, (_, i) => {
          const left = i % 2 === 0;
          const endY = [48, 150, 270, 372][Math.floor(i / 2)];
          return <path key={i} d={'M500 210C' + (left ? '310' : '690') + ' 210 ' + (left ? '380' : '620') + ' ' + endY + ' ' + (left ? '170' : '830') + ' ' + endY} stroke="var(--accent)" strokeOpacity=".32" vectorEffect="non-scaling-stroke" />;
        })}
      </svg>
      <div className="ingredient-hub"><span className="k-label">{ingredient.name}</span><strong>{ingredient.count}</strong><span>recipes</span></div>
      {ingredient.recipes.map((recipe, i) => <a className={'ingredient-node node-' + i} href={menuLink(recipe.name)} key={recipe.id}>
        <span>{recipe.name}</span><ArrowRight size={13} />
      </a>)}
    </div>
    <p className="story-source">{ingredient.recipes.length} connections shown · {ingredient.count} recipes contain {ingredient.name.toLowerCase()} in our {ingredientData.catalogueCount}-drink catalogue.
      Counts use exact ingredient names; other ingredients are still required.
    </p>
    <details className="story-data"><summary>Read the ingredient counts</summary><table>
      <caption>Recipes mentioning each ingredient in the PubCrawl catalogue</caption>
      <thead><tr><th scope="col">Ingredient</th><th scope="col">Recipes</th></tr></thead>
      <tbody>{ingredientData.ingredients.map((item) => <tr key={item.name}><th scope="row">{item.name}</th><td>{item.count}</td></tr>)}</tbody>
    </table></details>
  </>;
}

function CultureStory() {
  return <>
    <div className="story-title-row"><h3>Seen this<br /><em>somewhere?</em></h3><p>A few drinks<br />with screen time.</p></div>
    <ol className="culture-timeline">
      {filmDrinks.map((entry) => <li key={entry.film}>
        <span className="culture-year">{entry.year}</span>
        <GlassDrawing kind={entry.glass} garnish={entry.garnish} cream={entry.drink === 'White Russian'} />
        <h4>{entry.film}</h4>
        <a className="story-recipe-link" href={menuLink(entry.drink)}>{entry.drink} <ArrowRight size={15} /></a>
        <a className="story-source" href={entry.source} target="_blank" rel="noreferrer">{entry.sourceLabel} ↗</a>
      </li>)}
    </ol>
    <p className="story-source">Dates mark film releases. A curated timeline of documented appearances, not a measure of popularity.</p>
  </>;
}

const tabs = ['Rankings', 'Recipes', 'Ingredients', 'Culture'] as const;

export function BarStories() {
  const [selected, setSelected] = useState(0);
  const reduced = useReducedMotion();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (event: KeyboardEvent<HTMLButtonElement>, i: number) => {
    let next: number;
    if (event.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (i + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    setSelected(next);
    tabRefs.current[next]?.focus();
  };
  return <section className="bar-stories landing-discovery-section" aria-labelledby="bar-stories-title">
    <div className="stories-heading"><div><p className="k-label">For the conversation</p><h2 id="bar-stories-title">Small talk, supplied.</h2></div><span className="k-label">A little bar intelligence</span></div>
    <div className="story-tabs" role="tablist" aria-label="Cocktail data stories">
      {tabs.map((tab, i) => <button type="button" key={tab} id={'story-tab-' + i} role="tab" aria-selected={selected === i}
        aria-controls={'story-panel-' + i} tabIndex={selected === i ? 0 : -1} ref={(el) => { tabRefs.current[i] = el; }}
        onClick={() => setSelected(i)} onKeyDown={(event) => onKey(event, i)}>
        <span className="k-label">0{i + 1}</span>{tab}
      </button>)}
    </div>
    <motion.div key={selected} id={'story-panel-' + selected} role="tabpanel" aria-labelledby={'story-tab-' + selected} className="story-panel"
      initial={reduced ? false : { opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
      transition={{ duration: .3 }}>
      {selected === 0 ? <RankingStory /> : selected === 1 ? <RecipeStory /> : selected === 2 ? <IngredientStory /> : <CultureStory />}
    </motion.div>
  </section>;
}

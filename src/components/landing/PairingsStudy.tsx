import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { catalogue } from '../atlas/data';
import { Select } from '../atlas/shared';
import { ArrowDown, ArrowUp, Expand } from '../../icons';
import { StudyRecipes, type StudyActions } from './StudyRecipes';

const ingredients = catalogue.ingredients.slice(0, 12);
const options = ingredients.map(item => ({ value: item.id, label: item.name }));
const maximum = Math.max(...ingredients.map(item => item.count));
function pairCount(a: string, b: string) {
  const first = ingredients.find(item => item.id === a)!;
  return a === b ? first.count : catalogue.pairs.find(pair => (pair.a === a && pair.b === b) || (pair.a === b && pair.b === a))?.count || 0;
}

/** A complete 12×12 overview. Expand for larger cells; selectors are a touch alternative. */
export function PairingsStudy({ actions }: { actions: StudyActions }) {
  const [a, setA] = useState('lemon juice');
  const [b, setB] = useState('vodka');
  const [expanded, setExpanded] = useState(false);
  const [showRecipes, setShowRecipes] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const recipePanel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const controls = toolbar.current;
    if (!controls) return;
    const measure = () => root.current?.style.setProperty('--pairing-controls-height', `${controls.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(controls);
    return () => observer.disconnect();
  }, []);
  const first = ingredients.find(item => item.id === a)!;
  const second = ingredients.find(item => item.id === b)!;
  const count = pairCount(a, b);
  const recipes = catalogue.recipes.filter(recipe => recipe.ingredients.includes(a) && recipe.ingredients.includes(b)).sort((x, y) => Number(y.classic) - Number(x.classic) || x.name.localeCompare(y.name));
  const step = 38, left = 126, top = 98;
  const width = left + 12 * step + 2, height = top + 12 * step + 2;
  const moveCell = (event: KeyboardEvent<SVGGElement>) => {
    const directions: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const ri = Math.max(0, Math.min(11, ingredients.indexOf(first) + direction[0]));
    const ci = Math.max(0, Math.min(11, ingredients.indexOf(second) + direction[1]));
    setA(ingredients[ri].id); setB(ingredients[ci].id);
    requestAnimationFrame(() => svg.current?.querySelector<SVGGElement>(`[data-row="${ri}"][data-column="${ci}"]`)?.focus({ preventScroll: !expanded }));
  };
  const revealRecipes = () => {
    setShowRecipes(value => !value);
    if (!showRecipes) requestAnimationFrame(() => { recipePanel.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); recipePanel.current?.focus({ preventScroll: true }); });
  };
  return <div ref={root} className={`pairings-study focus-return-pairings${showRecipes ? ' is-browsing' : ''}`}>
      <div ref={toolbar} className="pairing-toolbar study-controls">
        <div className="pairing-selects"><Select label="First ingredient" value={a} onChange={setA} options={options} /><Select label="Second ingredient" value={b} onChange={setB} options={options} /></div>
        <div className="study-pairing-summary" aria-live="polite">
          <div className="pairing-selected-pair"><h4>{first.name} <span>+</span> {second.name}</h4><p><strong>{count}</strong> shared recipes</p></div>
        </div>
        <button type="button" className="study-button is-primary pairing-view-recipes" aria-expanded={showRecipes} aria-controls="pairing-all-recipes" disabled={!recipes.length} onClick={revealRecipes}>{showRecipes ? 'Hide recipes' : `View all ${recipes.length} recipes`}{showRecipes ? <ArrowUp size={18} /> : <ArrowDown size={18} />}</button>
      </div>
    <div className="pairing-overview">
      <div className="pairing-matrix-caption"><p>Tap a square to see matching drinks.</p><button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}><Expand size={16} />{expanded ? 'Fit grid' : 'Expand grid'}</button></div>
      <div className="pairing-scale"><span>Fewer</span><i /><span>More recipes</span></div>
      <div className={`pairing-matrix${expanded ? ' is-expanded' : ''}`}>
        <div className="pairing-grid-scroll" tabIndex={expanded ? 0 : undefined} aria-label={expanded ? 'Expanded heatmap. Scroll to explore all ingredients.' : undefined}>
          <svg ref={svg} viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Ingredient pairing heatmap" className="pairing-matrix-svg" aria-describedby="pairing-grid-description">
            <desc id="pairing-grid-description">12 ingredients, 144 squares. Stronger colour means more shared recipes. The diagonal shows recipes containing one ingredient. Use arrow keys to compare, or the two ingredient selectors above.</desc>
            {ingredients.map((item, i) => <text key={item.id} transform={`translate(${left + i * step + step / 2 + 4},${top - 10}) rotate(-90)`} className={item.id === b ? 'is-axis-selected' : undefined} fontSize="15">{item.name}</text>)}
            {ingredients.map((row, i) => <g key={row.id}>
              <text x={left - 10} y={top + i * step + step / 2 + 5} textAnchor="end" className={row.id === a ? 'is-axis-selected' : undefined} fontSize="15">{row.name}</text>
              {ingredients.map((column, j) => {
                const value = pairCount(row.id, column.id), selected = row.id === a && column.id === b;
                const intensity = value / maximum;
                return <g key={column.id} className={`pairing-matrix-cell${selected ? ' is-selected' : ''}`} role="button" tabIndex={selected ? 0 : -1} aria-pressed={selected} aria-label={`${row.name} and ${column.name}: ${value} shared recipes`} data-row={i} data-column={j} onClick={() => { setA(row.id); setB(column.id); }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setA(row.id); setB(column.id); } else moveCell(event); }}>
                  <title>{row.name} + {column.name}: {value} shared recipes</title>
                  <rect x={left + j * step} y={top + i * step} width={step} height={step} fill="var(--paper-2)" />
                  <rect className="pairing-cell-color" x={left + j * step + .6} y={top + i * step + .6} width={step - 1.2} height={step - 1.2} fill="var(--accent)" fillOpacity={.04 + .87 * Math.sqrt(intensity)} />
                  {expanded && <text x={left + j * step + step / 2} y={top + i * step + step / 2 + 4} textAnchor="middle" fontSize="10" className="pairing-cell-label">{value}</text>}
                  <rect className="pairing-cell-outline" x={left + j * step + 1.6} y={top + i * step + 1.6} width={step - 3.2} height={step - 3.2} fill="none" stroke={selected ? 'var(--ink)' : 'transparent'} strokeWidth="2" />
                </g>;
              })}
            </g>)}
          </svg>
        </div>
      </div>
    </div>
    <div id="pairing-all-recipes" ref={recipePanel} tabIndex={-1} hidden={!showRecipes} className="pairing-all-recipes"><StudyRecipes singlePanel recipes={recipes} contextKey={a + ':' + b} actions={actions} empty="No matching recipes." /></div>
  </div>;
}

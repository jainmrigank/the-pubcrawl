import { useMemo, useState } from 'react';
import { pantryAnalysis } from '../../atlasMath';
import { menuLink } from '../../landingStories';
import {
  catalogue,
  dna,
  hasCatalogueDrink,
  ingredientFamilies,
  palette,
} from './data';
import {
  Choices,
  DataTable,
  fmt,
  Insight,
  Legend,
  Plot,
  Select,
  useNarrowPlot,
} from './shared';
const all = catalogue.recipes;
const ingredientName = (id: string) =>
  catalogue.ingredients.find((i) => i.id === id)?.name || id;
const classicFirst = (a: (typeof all)[number], b: (typeof all)[number]) =>
  Number(b.classic) - Number(a.classic) || a.name.localeCompare(b.name);
function RecipeLinks({ recipes }: { recipes: typeof all }) {
  return (
    <div className="atlas-recipe-links">
      {recipes.map((r) => (
        <a href={menuLink(r.name)} key={r.id}>
          {r.name} <span>↗</span>
        </a>
      ))}
    </div>
  );
}

export function DnaChart() {
  const [mode, setMode] = useState('share');
  const [selected, setSelected] = useState(0);
  const row = dna[selected];
  const total = row.parts.reduce((s, p) => s + p[1], 0);
  return (
    <>
      <Choices
        label="Recipe scale"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'share', label: 'Proportions · %' },
          { value: 'ml', label: 'Actual measures · ml' },
        ]}
      />
      <Legend
        items={ingredientFamilies.map((label, i) => ({
          label,
          color: palette[i],
        }))}
      />
      <div className="atlas-figure-grid">
        <div className="atlas-dna-list">
          {dna.map((r, i) => {
            const sum = r.parts.reduce((s, p) => s + p[1], 0);
            return (
              <button
                key={r.name}
                type="button"
                aria-pressed={i === selected}
                onClick={() => setSelected(i)}
              >
                <span>
                  {r.name}
                  <small>{sum} ml</small>
                </span>
                <span
                  className="atlas-dna-bar"
                  style={{
                    width: `${mode === 'share' ? 100 : (sum / 180) * 100}%`,
                  }}
                >
                  {r.parts.map(([n, v, c]) => (
                    <i
                      key={n}
                      style={{
                        width: `${(v / sum) * 100}%`,
                        background: palette[c],
                      }}
                    >
                      <span>
                        {mode === 'share' ? `${fmt((v / sum) * 100, 0)}%` : v}
                      </span>
                    </i>
                  ))}
                </span>
              </button>
            );
          })}
          <div className="atlas-axis-note">
            {mode === 'share'
              ? 'Each bar = 100% of that recipe'
              : 'Longest bar = 180 ml · every segment uses the same ml scale'}
          </div>
        </div>
        <Insight number={total} unit="ml before dilution">
          <h3>{row.name}</h3>
          <dl className="atlas-measures">
            {row.parts.map(([n, v, c]) => (
              <div key={n}>
                <dt>
                  <i style={{ background: palette[c] }} />
                  {n}
                </dt>
                <dd>{v} ml</dd>
              </div>
            ))}
          </dl>
          <p>{row.finish}</p>
          {hasCatalogueDrink(row.name) ? (
            <a href={menuLink(row.name)}>Find the recipe ↗</a>
          ) : (
            <a
              href={'https://iba-world.com/iba-cocktail/' + row.source + '/'}
              target="_blank"
              rel="noreferrer"
            >
              Read the IBA method ↗
            </a>
          )}
        </Insight>
      </div>
      <DataTable
        headers={['Recipe', 'Ingredient', 'ml', 'Share %']}
        rows={dna.flatMap((r) =>
          r.parts.map(([n, v]) => [
            r.name,
            n,
            v,
            fmt((v / r.parts.reduce((s, p) => s + p[1], 0)) * 100, 1),
          ])
        )}
      />
    </>
  );
}
export function ConstellationChart() {
  const [selected, setSelected] = useState('gin');
  const [partner, setPartner] = useState('');
  const recipes = all.filter((r) => r.ingredients.includes(selected));
  const related = catalogue.ingredients
    .filter((i) => i.id !== selected)
    .map((i) => ({
      ...i,
      shared: recipes.filter((r) => r.ingredients.includes(i.id)).length,
    }))
    .filter((i) => i.shared > 0)
    .sort((a, b) => b.shared - a.shared || a.name.localeCompare(b.name))
    .slice(0, 16);
  return (
    <>
      <Select
        label="The ingredient at the centre"
        value={selected}
        onChange={(value) => {
          setSelected(value);
          setPartner('');
        }}
        options={catalogue.ingredients.slice(0, 24).map((i) => ({
          value: i.id,
          label: `${i.name} · ${i.count} recipes`,
        }))}
      />
      <div className="atlas-figure-grid">
        <div className="atlas-constellation">
          <Plot
            label={`Ingredients co-occurring with ${ingredientName(selected)} in the catalogue`}
            width={680}
            height={470}
            minWidth={570}
            mobileFit
          >
            {[95, 168].map((r) => (
              <circle
                key={r}
                cx="340"
                cy="230"
                r={r}
                fill="none"
                stroke="var(--line)"
                strokeDasharray="2 6"
              />
            ))}
            {related.map((r, i) => {
              const a = (i / related.length) * Math.PI * 2 - Math.PI / 2;
              const x = 340 + Math.cos(a) * 168,
                y = 230 + Math.sin(a) * 168;
              return (
                <g
                  key={r.id}
                  onClick={() => setPartner(r.id)}
                  className="atlas-network-node"
                  opacity={!partner || partner === r.id ? 1 : 0.25}
                >
                  <path
                    d={`M340 230Q${340 + Math.cos(a + 0.4) * 95} ${230 + Math.sin(a + 0.4) * 95} ${x} ${y}`}
                    stroke={palette[i % palette.length]}
                    strokeWidth={0.5 + (5 * r.shared) / recipes.length}
                    fill="none"
                    opacity=".55"
                  />
                  <circle
                    cx={x}
                    cy={y}
                    r={5 + Math.sqrt(r.shared) * 1.8}
                    fill={palette[i % palette.length]}
                    fillOpacity=".2"
                    stroke={palette[i % palette.length]}
                  />
                  <text
                    className="atlas-node-count"
                    x={x}
                    y={y + 4}
                    fontSize="11"
                    textAnchor="middle"
                    fontWeight="600"
                  >
                    {r.shared}
                  </text>
                  <text
                    className="atlas-node-label"
                    x={x + Math.cos(a) * 28}
                    y={y + Math.sin(a) * 28 + 4}
                    textAnchor={
                      Math.cos(a) > 0.2
                        ? 'start'
                        : Math.cos(a) < -0.2
                          ? 'end'
                          : 'middle'
                    }
                    fontSize="12"
                  >
                    {r.name}
                  </text>
                </g>
              );
            })}
            <circle
              cx="340"
              cy="230"
              r="62"
              fill="var(--paper)"
              stroke="var(--atlas-orange)"
            />
            <text
              className="atlas-node-centre"
              x="340"
              y="222"
              fontSize="15"
              textAnchor="middle"
            >
              {ingredientName(selected)}
            </text>
            <text
              className="atlas-node-total"
              x="340"
              y="247"
              fontSize="23"
              fill="var(--atlas-orange)"
              textAnchor="middle"
            >
              {recipes.length}
            </text>
            <text
              className="atlas-node-unit"
              x="340"
              y="265"
              fontSize="10"
              textAnchor="middle"
            >
              recipes
            </text>
          </Plot>
          <div
            className="atlas-network-key"
            role="group"
            aria-label="Inspect an ingredient connection"
          >
            {related.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={partner === r.id}
                onClick={() => setPartner(partner === r.id ? '' : r.id)}
              >
                <span>{r.name}</span>
                <strong>{r.shared}</strong>
              </button>
            ))}
          </div>
        </div>
        <div className="atlas-network-notes">
          <p className="atlas-overline">
            {partner
              ? ingredientName(selected) + ' + ' + ingredientName(partner)
              : 'Some familiar connections'}
          </p>
          <RecipeLinks
            recipes={recipes
              .filter((r) => !partner || r.ingredients.includes(partner))
              .sort(classicFirst)
              .slice(0, 8)}
          />
          {partner && (
            <button
              className="atlas-text-action"
              type="button"
              onClick={() => setPartner('')}
            >
              All {ingredientName(selected)} connections ↗
            </button>
          )}
          <p className="atlas-footnote">
            Rim numbers count shared recipes. Thicker lines mean more. Maximum: 16 ingredients.
          </p>
        </div>
      </div>
      <DataTable
        headers={[
          'Ingredient alongside ' + ingredientName(selected),
          'Recipes containing both',
        ]}
        rows={related.map((i) => [i.name, i.shared])}
      />
    </>
  );
}
export function PairingsChart() {
  const top = catalogue.ingredients.slice(0, 12);
  const [a, setA] = useState(top[0].id),
    [b, setB] = useState(top[1].id),
    [metric, setMetric] = useState('count');
  const get = (x: string, y: string) => {
    const first = top.find((i) => i.id === x)!;
    const second = top.find((i) => i.id === y)!;
    const count =
      x === y
        ? first.count
        : catalogue.pairs.find(
            (p) => (p.a === x && p.b === y) || (p.a === y && p.b === x)
          )?.count || 0;
    return { count, similarity: count / (first.count + second.count - count) };
  };
  const value = get(a, b),
    rows = all
      .filter((r) => r.ingredients.includes(a) && r.ingredients.includes(b))
      .sort(classicFirst);
  const max = Math.max(...catalogue.pairs.map((p) => p.count));
  const options = top.map((i) => ({ value: i.id, label: i.name }));
  return (
    <>
      <Choices
        label="Pairing measure"
        value={metric}
        onChange={setMetric}
        options={[
          { value: 'count', label: 'Shared recipes' },
          { value: 'similarity', label: 'Shared / union · %' },
        ]}
      />
      <div className="atlas-control-row">
        <Select
          label="First ingredient"
          value={a}
          onChange={setA}
          options={options}
        />
        <Select
          label="Second ingredient"
          value={b}
          onChange={setB}
          options={options}
        />
      </div>
      <div className="atlas-figure-grid">
        <Plot
          label="Tap a cell, or choose two ingredients."
          width={670}
          height={595}
          minWidth={570}
        >
          {top.map((r, i) => (
            <g key={r.id}>
              <text
                x="165"
                y={130 + i * 37 + 24}
                textAnchor="end"
                fontSize="12"
              >
                {r.name}
              </text>
              <text
                transform={`translate(${182 + i * 37 + 20},115) rotate(-52)`}
                fontSize="12"
              >
                {r.name}
              </text>
              {top.map((c, j) => {
                const v = get(r.id, c.id);
                const opacity =
                  metric === 'count'
                    ? v.count / (i === j ? top[0].count : max)
                    : v.similarity;
                return (
                  <g
                    key={c.id}
                    onClick={() => {
                      setA(r.id);
                      setB(c.id);
                    }}
                    className="atlas-heat-cell"
                  >
                    <rect
                      x={182 + j * 37}
                      y={130 + i * 37}
                      width="34"
                      height="34"
                      rx="2"
                      fill={i === j ? 'var(--atlas-teal)' : 'var(--atlas-plum)'}
                      fillOpacity={0.035 + 0.9 * opacity}
                    />
                    {r.id === a && c.id === b && (
                      <rect
                        x={180 + j * 37}
                        y={128 + i * 37}
                        width="38"
                        height="38"
                        rx="3"
                        fill="none"
                        stroke="var(--ink)"
                        strokeWidth="2"
                      />
                    )}
                    <title>
                      {r.name} + {c.name}: {v.count} recipes,{' '}
                      {fmt(v.similarity * 100, 1)}% similarity
                    </title>
                  </g>
                );
              })}
            </g>
          ))}
        </Plot>
        <div className="atlas-network-notes" aria-live="polite">
          <div className="atlas-pair-number">
            {metric === 'count' ? value.count : fmt(value.similarity * 100, 1)}
            <small>
              {metric === 'count' ? 'shared recipes' : '% similarity'}
            </small>
          </div>
          <h3>
            {ingredientName(a)}
            <em> & </em>
            {ingredientName(b)}
          </h3>
          <RecipeLinks recipes={rows.slice(0, 5)} />
          <p className="atlas-footnote">
            {a === b
              ? 'Diagonal cells show an ingredient on its own.'
              : `${value.count} recipes in common; ${top.find((i) => i.id === a)!.count + top.find((i) => i.id === b)!.count - value.count} in the union.`}{' '}
            Teal diagonal uses ingredient totals; purple cells show pairs.
          </p>
        </div>
      </div>
      <DataTable
        headers={[
          'Ingredient A',
          'Ingredient B',
          'Shared recipes',
          'Jaccard %',
        ]}
        rows={top.flatMap((r, i) =>
          top.slice(i + 1).map((c) => {
            const v = get(r.id, c.id);
            return [r.name, c.name, v.count, fmt(v.similarity * 100, 1)];
          })
        )}
      />
    </>
  );
}
export function PantryChart() {
  const [pantry, setPantry] = useState<string[]>([
    'gin',
    'lemon juice',
    'sugar',
    'ice',
  ]);
  const [group, setGroup] = useState('1');
  const analysis = useMemo(() => pantryAnalysis(all, pantry), [pantry]);
  const top = catalogue.ingredients.slice(0, 24);
  const extra = pantry
    .filter((id) => !top.some((i) => i.id === id))
    .map((id) => catalogue.ingredients.find((i) => i.id === id)!)
    .filter(Boolean);
  const next = analysis.next[0];
  const names = [
    'All ingredients',
    'One away',
    'Two away',
    'Three or more away',
  ];
  return (
    <>
      <div
        className="atlas-pantry-shelf"
        role="group"
        aria-label="Imaginary shelf ingredients"
      >
        {[...top, ...extra].map((i) => (
          <button
            key={i.id}
            type="button"
            aria-pressed={pantry.includes(i.id)}
            onClick={() =>
              setPantry((p) =>
                p.includes(i.id) ? p.filter((x) => x !== i.id) : [...p, i.id]
              )
            }
          >
            <span>{pantry.includes(i.id) ? '−' : '+'}</span>
            {i.name}
          </button>
        ))}
        <button
          type="button"
          className="atlas-reset"
          onClick={() => setPantry([])}
        >
          Clear shelf
        </button>
      </div>
      <div className="atlas-figure-grid">
        <div>
          <div
            className="atlas-universe"
            role="img"
            aria-label={analysis.groups
              .map((g, i) => `${g.length} ${names[i]}`)
              .join(', ')}
          >
            {analysis.groups.map((g, i) => (
              <div key={i} className={'atlas-universe-group group-' + i}>
                <strong>
                  {g.length}
                  <small>{names[i]}</small>
                </strong>
                <div>
                  {g.map((r) => (
                    <i key={r.id} title={r.name} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="atlas-footnote">
            One dot = one recipe. Ice & garnish count.
          </p>
        </div>
        <div className="atlas-network-notes" aria-live="polite">
          <div className="atlas-pair-number">
            {analysis.groups[0].length}
            <small>ingredient lists complete</small>
          </div>
          {next ? (
            <>
              <h3>Add {ingredientName(next[0])}.</h3>
              <p>
                It completes <strong>{next[1]} more</strong> ingredient lists.
              </p>
              <button
                className="atlas-text-action"
                type="button"
                onClick={() => setPantry((p) => [...p, next[0]])}
              >
                Put it on this shelf ↗
              </button>
            </>
          ) : (
            <p>
              Nothing one ingredient away. Add more to your shelf.
            </p>
          )}
          <p className="atlas-footnote">
            Sandbox; Shelf unchanged. Measures, equipment and substitutions aren’t checked.
          </p>
        </div>
      </div>
      <Choices
        label="Inspect recipe group"
        value={group}
        onChange={setGroup}
        options={names.map((label, i) => ({
          value: String(i),
          label: `${label} · ${analysis.groups[i].length}`,
        }))}
      />
      <RecipeLinks recipes={analysis.groups[Number(group)].slice(0, 8)} />
      <DataTable
        caption="Read every recipe in this group"
        headers={['Recipe', 'Missing ingredients']}
        rows={analysis.groups[Number(group)].map((r) => [
          r.name,
          analysis.missing.get(r.id)!.map(ingredientName).join(', ') || 'None',
        ])}
      />
    </>
  );
}
const vibeNames: Record<string, string> = {
  refreshing: 'Fresh & citrus',
  boozy: 'Spirit-forward',
  party: 'Party',
  zeroproof: 'Zero proof',
  tropical: 'Tropical',
  sweet: 'Sweet',
  cozy: 'Cozy',
};
export function FlowsChart() {
  const [selected, setSelected] = useState('refreshing');
  const narrow = useNarrowPlot();
  const data = useMemo(() => {
    const glassCounts = new Map<string, number>();
    for (const r of all)
      glassCounts.set(r.glass, (glassCounts.get(r.glass) || 0) + 1);
    const glasses = [...glassCounts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name]) => name);
    glasses.push('Other vessels');
    const vibes = Object.keys(vibeNames);
    const flows = vibes
      .flatMap((vibe) =>
        glasses.map((glass) => ({
          vibe,
          glass,
          count: all.filter(
            (r) =>
              r.vibe === vibe &&
              (glass === 'Other vessels'
                ? !glasses.includes(r.glass)
                : r.glass === glass)
          ).length,
        }))
      )
      .filter((r) => r.count);
    const scale = 330 / all.length,
      gap = narrow ? 55 : 15;
    const left = new Map<string, number>(),
      right = new Map<string, number>();
    let y = 55;
    for (const v of vibes) {
      left.set(v, y);
      y += all.filter((r) => r.vibe === v).length * scale + gap;
    }
    y = 55;
    for (const g of glasses) {
      right.set(g, y);
      y +=
        flows.filter((f) => f.glass === g).reduce((s, r) => s + r.count, 0) *
          scale +
        gap;
    }
    const lp = new Map(left),
      rp = new Map(right);
    const ribbons = flows.map((f) => {
      const sy = lp.get(f.vibe)!,
        ty = rp.get(f.glass)!,
        h = f.count * scale;
      lp.set(f.vibe, sy + h);
      rp.set(f.glass, ty + h);
      return { ...f, sy, ty, h };
    });
    return { vibes, glasses, flows, left, right, scale, ribbons };
  }, [narrow]);
  return (
    <>
      <Select
        label="Follow a mood"
        value={selected}
        onChange={setSelected}
        options={data.vibes.map((v) => ({ value: v, label: vibeNames[v] }))}
      />
      <Plot
        label="691 catalogue recipes flow from mood labels to glass types. Ribbon width equals recipe count."
        width={780}
        height={narrow ? 800 : 520}
        minWidth={650}
        mobileFit
      >
        <text x="12" y="24" fontSize={narrow ? 22 : 10}>
          CATALOGUE MOOD
        </text>
        <text x="570" y="24" fontSize={narrow ? 22 : 10}>
          GLASS
        </text>
        {data.ribbons.map((r) => (
          <path
            key={r.vibe + r.glass}
            d={`M190 ${r.sy}C360 ${r.sy} 400 ${r.ty} 565 ${r.ty}L565 ${r.ty + r.h}C400 ${r.ty + r.h} 360 ${r.sy + r.h} 190 ${r.sy + r.h}Z`}
            fill={palette[data.vibes.indexOf(r.vibe)]}
            opacity={r.vibe === selected ? 0.8 : 0.08}
          />
        ))}
        {data.vibes.map((v, i) => {
          const count = all.filter((r) => r.vibe === v).length;
          return (
            <g key={v}>
              <rect
                x="182"
                y={data.left.get(v)}
                width="8"
                height={count * data.scale}
                fill={palette[i]}
              />
              <text
                x="170"
                y={data.left.get(v)! + (count * data.scale) / 2 + 4}
                textAnchor="end"
                fontSize={narrow ? 24 : 13}
              >
                {narrow ? (
                  <>
                    <tspan x="170" dy="-10">
                      {vibeNames[v]}
                    </tspan>
                    <tspan x="170" dy="27" fontSize="21">
                      {count}
                    </tspan>
                  </>
                ) : (
                  <>
                    {vibeNames[v]} · {count}
                  </>
                )}
              </text>
            </g>
          );
        })}
        {data.glasses.map((g) => {
          const count = data.flows
            .filter((f) => f.glass === g)
            .reduce((s, f) => s + f.count, 0);
          return (
            <g key={g}>
              <rect
                x="565"
                y={data.right.get(g)}
                width="8"
                height={count * data.scale}
                fill="var(--ink)"
                fillOpacity=".25"
              />
              <text
                x="585"
                y={data.right.get(g)! + (count * data.scale) / 2 + 4}
                fontSize={narrow ? 24 : 12}
              >
                {narrow ? (
                  <>
                    <tspan x="585" dy="-10">
                      {g.replace(' glass', '')}
                    </tspan>
                    <tspan x="585" dy="27" fontSize="21">
                      {count} recipes
                    </tspan>
                  </>
                ) : (
                  <>
                    {g} · {count}
                  </>
                )}
              </text>
            </g>
          );
        })}
      </Plot>
      <div className="atlas-flow-breakdown" aria-live="polite">
        {data.flows
          .filter((r) => r.vibe === selected)
          .sort((a, b) => b.count - a.count)
          .map((r) => (
            <div key={r.glass}>
              <strong>{r.count}</strong>
              <span>{r.glass}</span>
            </div>
          ))}
      </div>
      <DataTable
        headers={['Mood', 'Glass', 'Recipe count']}
        rows={data.flows.map((r) => [vibeNames[r.vibe], r.glass, r.count])}
      />
    </>
  );
}

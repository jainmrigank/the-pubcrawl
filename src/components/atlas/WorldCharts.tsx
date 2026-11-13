import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cocktailRankings, menuLink, rankingYears } from '../../landingStories';
import {
  beerPerson,
  beerTotal,
  palette,
  scotchValue,
  scotchVolume,
} from './data';
import { Choices, DataTable, fmt, Insight, Plot, Select } from './shared';

export function BeerChart() {
  const [metric, setMetric] = useState('total');
  const [selected, setSelected] = useState('China');
  const reduced = useReducedMotion();
  const rows = metric === 'total' ? beerTotal : beerPerson;
  const chosen = rows.find(([name]) => name === selected) || rows[0];
  return (
    <>
      <Choices
        label="Beer comparison"
        value={metric}
        onChange={(v) => {
          setMetric(v);
          setSelected(v === 'total' ? 'China' : 'Czech Republic');
        }}
        options={[
          { value: 'total', label: 'Total volume' },
          { value: 'person', label: 'Per person' },
        ]}
      />
      <div className="atlas-figure-grid">
        <div className="atlas-bars">
          <div className="atlas-axis-note">
            2024 ·{' '}
            {metric === 'total' ? 'billion litres' : 'litres per resident'} ·
            top ten
          </div>
          {rows.map(([name, value], i) => (
            <motion.button
              layout={!reduced}
              transition={{ duration: 0.35 }}
              key={name}
              type="button"
              aria-pressed={chosen[0] === name}
              onClick={() => setSelected(name)}
              className="atlas-bar-row"
            >
              <span className="atlas-bar-label">
                <small>{String(i + 1).padStart(2, '0')}</small>
                {name}
              </span>
              <span className="atlas-bar-track">
                <motion.i
                  initial={false}
                  animate={{ width: `${(value / rows[0][1]) * 100}%` }}
                  transition={{ duration: reduced ? 0 : 0.45 }}
                />
              </span>
              <strong>{fmt(value, metric === 'total' ? 3 : 1)}</strong>
            </motion.button>
          ))}
        </div>
        <Insight
          number={fmt(chosen[1], metric === 'total' ? 3 : 1)}
          unit={metric === 'total' ? 'bn L' : 'L / person'}
        >
          <h3>{chosen[0]}</h3>
          <p>
            {metric === 'total'
              ? 'The size of a market includes the size of its population. Switch the frame to see a different leaderboard.'
              : 'Per resident includes people who do not drink. It is not the average beer drinker’s intake.'}
          </p>
          <span className="atlas-margin-note">
            Different denominator.
            <br />
            Different company.
          </span>
        </Insight>
      </div>
      <DataTable
        headers={[
          'Rank',
          'Country',
          metric === 'total' ? 'Billion litres' : 'L / resident',
        ]}
        rows={rows.map(([n, v], i) => [i + 1, n, v])}
      />
    </>
  );
}
export function ScotchChart() {
  const [selected, setSelected] = useState('India');
  const common = scotchVolume.filter(([n]) =>
    scotchValue.some(([v]) => n === v)
  );
  const selectedValue = scotchValue.find(([n]) => n === selected)?.[1];
  const selectedVolume = scotchVolume.find(([n]) => n === selected)?.[1];
  const names = [...new Set([...scotchValue, ...scotchVolume].map(([n]) => n))];
  return (
    <>
      <Select
        label="Follow a market"
        value={selected}
        onChange={setSelected}
        options={names.map((n) => ({ value: n, label: n }))}
      />
      <Plot
        label="2025 Scotch export rankings by volume and value"
        width={760}
        height={465}
        minWidth={620}
      >
        <text x="20" y="22" className="atlas-svg-label">
          VOLUME · million 70 cl bottles
        </text>
        <text x="515" y="22" className="atlas-svg-label">
          VALUE · £ million
        </text>
        {common.map(([n]) => {
          const a = scotchVolume.findIndex(([v]) => v === n),
            b = scotchValue.findIndex(([v]) => v === n);
          return (
            <path
              key={n}
              d={`M255 ${65 + a * 39} C350 ${65 + a * 39} 410 ${65 + b * 39} 505 ${65 + b * 39}`}
              fill="none"
              stroke={n === selected ? 'var(--atlas-orange)' : 'var(--ink)'}
              opacity={n === selected ? 1 : 0.13}
              strokeWidth={n === selected ? 3 : 1.5}
            />
          );
        })}
        {[scotchVolume, scotchValue].map((rows, side) =>
          rows.map(([n, v], i) => (
            <g
              className="atlas-svg-choice"
              key={side + n}
              role="button"
              tabIndex={0}
              aria-label={`${n}, ${side ? '£ ' + v + ' million' : v + ' million bottle equivalents'}, rank ${i + 1}`}
              onClick={() => setSelected(n)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelected(n);
                }
              }}
              opacity={selected === n ? 1 : 0.58}
            >
              <circle
                cx={side ? 505 : 255}
                cy={65 + i * 39}
                r={selected === n ? 6 : 3}
                fill={selected === n ? 'var(--atlas-orange)' : 'currentColor'}
              />
              <text
                x={side ? 520 : 20}
                y={70 + i * 39}
                fontSize="14"
                fill={selected === n ? 'var(--atlas-orange)' : 'currentColor'}
              >
                {i + 1}. {n}
              </text>
              <text
                x={side ? 740 : 235}
                y={70 + i * 39}
                textAnchor="end"
                fontSize="14"
                fontWeight="600"
              >
                {v}
              </text>
            </g>
          ))
        )}
      </Plot>
      <div className="atlas-inline-insight" aria-live="polite">
        <strong>{selected}</strong>
        <span>
          {selectedVolume === undefined
            ? 'Outside volume top ten'
            : `${selectedVolume}m bottle equivalents`}
        </span>
        <span>
          {selectedValue === undefined
            ? 'Outside value top ten'
            : `£${selectedValue}m export value`}
        </span>
      </div>
      <p className="atlas-footnote">
        Lines connect markets present in both top tens. Ties use the publisher’s
        table order; 54m bottle figures are rounded.
      </p>
      <DataTable
        headers={['Market', 'Million 70 cl equivalents', '£ million']}
        rows={names.map((n) => [
          n,
          scotchVolume.find(([v]) => v === n)?.[1] ?? 'Not in volume top ten',
          scotchValue.find(([v]) => v === n)?.[1] ?? 'Not in value top ten',
        ])}
      />
    </>
  );
}
const wine = [
  {
    name: 'Production',
    change: 0.6,
    amount: '227 million hl',
    note: 'A modest rebound.',
    color: palette[1],
  },
  {
    name: 'Consumption',
    change: -2.7,
    amount: '208 million hl',
    note: 'Consumption continued to contract.',
    color: palette[0],
  },
  {
    name: 'Export volume',
    change: -4.7,
    amount: '94.8 million hl',
    note: 'Less wine crossing borders.',
    color: palette[2],
  },
  {
    name: 'Export value',
    change: -6.7,
    amount: '€33.8 billion',
    note: 'Value fell faster than volume.',
    color: palette[4],
  },
];
export function WineChart() {
  const [selected, setSelected] = useState(1);
  const row = wine[selected];
  return (
    <>
      <div className="atlas-figure-grid">
        <div>
          <div className="atlas-axis-note">
            2025 vs 2024 · percentage change
          </div>
          <Plot
            label="Percentage change in four global wine measures"
            width={540}
            height={330}
            minWidth={400}
          >
            {[-8, -6, -4, -2, 0, 2].map((v) => (
              <g key={v}>
                <line
                  x1={320 + v * 23}
                  x2={320 + v * 23}
                  y1={22}
                  y2={287}
                  stroke="var(--line)"
                />
                <text
                  x={320 + v * 23}
                  y={315}
                  textAnchor="middle"
                  fontSize="12"
                >
                  {v > 0 ? '+' : ''}
                  {v}%
                </text>
              </g>
            ))}
            {wine.map((r, i) => (
              <g key={r.name}>
                <text x="0" y={61 + i * 65} fontSize="14">
                  {r.name}
                </text>
                <line
                  x1={320}
                  x2={320 + r.change * 23}
                  y1={56 + i * 65}
                  y2={56 + i * 65}
                  stroke={r.color}
                  strokeWidth={i === selected ? 13 : 7}
                  opacity={selected === i ? 1 : 0.45}
                />
                <circle
                  cx={320 + r.change * 23}
                  cy={56 + i * 65}
                  r="5"
                  fill={r.color}
                />
                <text
                  x={r.change > 0 ? 365 : 530}
                  y={61 + i * 65}
                  textAnchor="end"
                  fontSize="14"
                  fill={r.color}
                >
                  {r.change > 0 ? '+' : ''}
                  {r.change}%
                </text>
              </g>
            ))}
          </Plot>
          <div className="atlas-small-choices">
            {wine.map((r, i) => (
              <button
                type="button"
                aria-pressed={selected === i}
                key={r.name}
                onClick={() => setSelected(i)}
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>
        <Insight
          number={`${row.change > 0 ? '+' : ''}${row.change}%`}
          unit="year on year"
        >
          <h3>{row.name}</h3>
          <p>
            <strong>{row.amount}</strong>
            <br />
            {row.note}
          </p>
          <span className="atlas-margin-note">
            One year.
            <br />
            Four moving parts.
          </span>
        </Insight>
      </div>
      <DataTable
        headers={['Measure', '2025 estimate', 'Change vs 2024']}
        rows={wine.map((r) => [r.name, r.amount, `${r.change}%`])}
      />
    </>
  );
}
export function DrinkersChart() {
  const [year, setYear] = useState('2025');
  const value = year === '2023' ? 62 : year === '2024' ? 58 : 54;
  return (
    <>
      <Choices
        label="Survey year"
        value={year}
        onChange={setYear}
        options={['2023', '2024', '2025'].map((v) => ({ value: v, label: v }))}
      />
      <div className="atlas-figure-grid">
        <div>
          <div
            className="atlas-dot-room"
            role="img"
            aria-label={`${value}% of U.S. adults say they drink in ${year}. Each dot is one percentage point.`}
          >
            {Array.from({ length: 100 }, (_, i) => (
              <i key={i} className={i < value ? 'is-filled' : ''}>
                <svg viewBox="0 0 16 30" aria-hidden="true">
                  <circle cx="8" cy="4" r="3" />
                  <path d="M4 10H12L14 21H10V29H6V21H2Z" />
                </svg>
              </i>
            ))}
          </div>
          <p className="atlas-footnote">
            100 symbols = 100 percentage points · U.S. adults
          </p>
        </div>
        <Insight number={value} unit="% say they drink">
          <h3>{year} · Gallup</h3>
          <p>
            {year === '2025'
              ? 'Eight percentage points below 2023. These surveys describe adults in the United States, not a global generational trend.'
              : 'Compare the years. The sample changes; the dots do not represent individual people tracked over time.'}
          </p>
          <span className="atlas-margin-note">
            The empty space
            <br />
            has a story, too.
          </span>
        </Insight>
      </div>
      <DataTable
        headers={['Survey year', 'U.S. adults who say they drink']}
        rows={[
          [2023, '62%'],
          [2024, '58%'],
          [2025, '54%'],
        ]}
      />
    </>
  );
}
export function RankingsChart() {
  const [selected, setSelected] = useState(0);
  const row = cocktailRankings[selected];
  const y = (n: number) => 32 + (n - 1) * 42;
  return (
    <>
      <div className="atlas-small-choices">
        {cocktailRankings.map((r, i) => (
          <button
            type="button"
            key={r.name}
            aria-pressed={i === selected}
            onClick={() => setSelected(i)}
            style={{ '--choice-color': palette[i] } as React.CSSProperties}
          >
            {r.name}
          </button>
        ))}
      </div>
      <Plot
        label="Five cocktail ranks across the 2024, 2025 and 2026 Drinks International surveys"
        width={700}
        height={365}
        minWidth={450}
      >
        {[1, 2, 3, 4, 5, 6, 7].map((rank) => (
          <g key={rank}>
            <line
              x1="45"
              x2="650"
              y1={y(rank)}
              y2={y(rank)}
              stroke="var(--line)"
              strokeDasharray="2 5"
            />
            <text x="15" y={y(rank) + 5} fontSize="12">
              {rank}
            </text>
          </g>
        ))}
        {rankingYears.map((year, i) => (
          <text
            key={year}
            x={80 + i * 265}
            y="345"
            textAnchor="middle"
            fontSize="14"
          >
            {year}
          </text>
        ))}
        {cocktailRankings.map((r, i) => (
          <g key={r.name} opacity={i === selected ? 1 : 0.2}>
            <path
              d={r.ranks
                .map((rank, j) => `${j ? 'L' : 'M'}${80 + j * 265} ${y(rank)}`)
                .join(' ')}
              stroke={palette[i]}
              strokeWidth={i === selected ? 4 : 2}
              fill="none"
            />
            {r.ranks.map((rank, j) => (
              <g key={j}>
                <circle
                  cx={80 + j * 265}
                  cy={y(rank)}
                  r={i === selected ? 13 : 5}
                  fill={palette[i]}
                />
                {i === selected && (
                  <text
                    x={80 + j * 265}
                    y={y(rank) + 4}
                    fill="var(--paper)"
                    fontSize="12"
                    textAnchor="middle"
                    fontWeight="700"
                  >
                    {rank}
                  </text>
                )}
              </g>
            ))}
          </g>
        ))}
      </Plot>
      <div className="atlas-inline-insight" aria-live="polite">
        <strong>{row.name}</strong>
        <span>{row.ranks.join(' → ')}</span>
        <a href={menuLink(row.name)}>Meet the drink ↗</a>
      </div>
      <p className="atlas-footnote">
        A changing panel of 100 award-winning bars · selected ranks, not
        worldwide sales volumes.
      </p>
      <DataTable
        headers={['Drink', ...rankingYears.map(String)]}
        rows={cocktailRankings.map((r) => [r.name, ...r.ranks])}
      />
    </>
  );
}

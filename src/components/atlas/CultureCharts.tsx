import { useState } from 'react';
import { bottlePours } from '../../atlasMath';
import { menuLink } from '../../landingStories';
import { GlassDrawing } from '../landing/GlassDrawing';
import {
  chemistry,
  facts,
  hasCatalogueDrink,
  history,
  palette,
  screen,
  sources,
} from './data';
import {
  Choices,
  DataTable,
  FactNote,
  fmt,
  Insight,
  Plot,
  Select,
  Slider,
} from './shared';
export function HistoryChart() {
  const [mode, setMode] = useState('modern'),
    [selected, setSelected] = useState('F051');
  const rows =
    mode === 'modern' ? history.filter((r) => r.date >= 1500) : history;
  const event = history.find((r) => r.id === selected)!;
  const min = mode === 'modern' ? 1500 : -11500,
    max = 2026;
  const x = (n: number) => 45 + ((n - min) / (max - min)) * 620;
  const ticks =
    mode === 'modern'
      ? [1500, 1600, 1700, 1800, 1900, 2026]
      : [-11000, -8000, -5000, -2000, 2026];
  return (
    <>
      <Choices
        label="Timeline scale"
        value={mode}
        onChange={(v) => {
          setMode(v);
          if (v === 'modern' && event.date < 1500) setSelected('F051');
        }}
        options={[
          { value: 'modern', label: 'The recent centuries' },
          { value: 'deep', label: 'The longer story' },
        ]}
      />
      <Plot
        label="Selected events on a linear historical timeline. Select an event below for details."
        width={710}
        height={325}
        minWidth={520}
      >
        {ticks.map((n) => (
          <g key={n}>
            <line x1={x(n)} x2={x(n)} y1="20" y2="275" stroke="var(--line)" />
            <text x={x(n)} y="307" textAnchor="middle" fontSize="12">
              {n < 0 ? `${fmt(-n)} BCE` : n}
            </text>
          </g>
        ))}
        <line x1="45" x2="665" y1="275" y2="275" stroke="var(--ink)" />
        {rows.map((r, i) => {
          const y = 48 + (i % 5) * 43,
            active = r.id === selected;
          return (
            <g
              key={r.id}
              onClick={() => setSelected(r.id)}
              className="atlas-history-dot"
            >
              <line
                x1={x(r.date)}
                x2={x(r.date)}
                y1={y}
                y2="275"
                stroke={active ? 'var(--atlas-orange)' : 'var(--line)'}
              />
              <circle
                cx={x(r.date)}
                cy={y}
                r={active ? 10 : 5}
                fill={r.date < 0 ? 'var(--atlas-plum)' : palette[i % 7]}
                opacity={active ? 1 : 0.55}
              />
              {active && (
                <text
                  x={Math.min(Math.max(130, x(r.date)), 580)}
                  y={y - 17}
                  fontSize="14"
                  textAnchor="middle"
                  fill="var(--atlas-orange)"
                >
                  {r.label}
                </text>
              )}
            </g>
          );
        })}
      </Plot>
      <div className="atlas-history-selection">
        <div>
          <span className="atlas-overline">{event.label}</span>
          <h3>{event.name}</h3>
        </div>
        <FactNote id={event.id} />
      </div>
      <div
        className="atlas-event-list"
        role="group"
        aria-label="Explore a historical event"
      >
        {rows.map((r) => (
          <button
            key={r.id}
            type="button"
            aria-pressed={r.id === selected}
            onClick={() => setSelected(r.id)}
          >
            <span>{r.label}</span>
            {r.name}
          </button>
        ))}
      </div>
      <DataTable
        headers={['Date / range', 'Event', 'Research note']}
        rows={rows.map((r) => [r.label, r.name, r.id])}
      />
    </>
  );
}
export function ScreenChart() {
  const [kind, setKind] = useState('All'),
    [selected, setSelected] = useState(7);
  const rows = screen
    .map((r, i) => ({ ...r, index: i }))
    .filter((r) => kind === 'All' || r.kind === kind);
  const chosen = rows.find((r) => r.index === selected) || rows[0];
  const drinks = [...new Set(rows.map((r) => r.drink))];
  return (
    <>
      <Choices
        label="Cultural medium"
        value={kind}
        onChange={setKind}
        options={['All', 'Film', 'Novel', 'Song'].map((v) => ({
          value: v,
          label: v,
        }))}
      />
      <div className="atlas-figure-grid">
        <Plot
          label="Works and their documented drink associations, arranged in release order rather than proportional time"
          width={680}
          height={Math.max(310, rows.length * 44 + 65)}
          minWidth={530}
        >
          <text x="5" y="19" className="atlas-svg-label">
            RELEASE ORDER · WORK
          </text>
          <text x="515" y="19" className="atlas-svg-label">
            DRINK
          </text>
          {rows.map((r, i) => {
            const target = drinks.indexOf(r.drink);
            const sy = 50 + i * 44,
              ty =
                55 +
                (target * (rows.length * 44 - 20)) /
                  Math.max(drinks.length - 1, 1);
            return (
              <g key={r.index} onClick={() => setSelected(r.index)}>
                <text
                  x="5"
                  y={sy + 4}
                  fontSize="12"
                  fill={
                    r.index === chosen.index
                      ? 'var(--atlas-orange)'
                      : 'currentColor'
                  }
                >
                  {r.year} · {r.work}
                </text>
                <path
                  d={`M270 ${sy}C385 ${sy} 375 ${ty} 490 ${ty}`}
                  stroke={
                    palette[screen.findIndex((s) => s.drink === r.drink) % 7]
                  }
                  strokeWidth={r.index === chosen.index ? 3 : 1.5}
                  opacity={r.index === chosen.index ? 1 : 0.2}
                  fill="none"
                />
                <circle
                  cx="270"
                  cy={sy}
                  r={r.index === chosen.index ? 5 : 3}
                  fill="var(--atlas-orange)"
                />
              </g>
            );
          })}
          {drinks.map((d, i) => {
            const ty =
              55 +
              (i * (rows.length * 44 - 20)) / Math.max(drinks.length - 1, 1);
            return (
              <g key={d}>
                <circle
                  cx="490"
                  cy={ty}
                  r="4"
                  fill={palette[screen.findIndex((s) => s.drink === d) % 7]}
                />
                <text x="505" y={ty + 4} fontSize="12">
                  {d}
                </text>
              </g>
            );
          })}
        </Plot>
        <div className="atlas-screen-note">
          <Select
            label="Look closer at a work"
            value={String(chosen.index)}
            onChange={(v) => setSelected(Number(v))}
            options={rows.map((r) => ({
              value: String(r.index),
              label: `${r.year} · ${r.work}`,
            }))}
          />
          <GlassDrawing
            kind={
              chosen.drink === 'White Russian'
                ? 'rocks'
                : chosen.drink === 'Pinot Noir'
                  ? 'wine'
                  : chosen.drink === 'French 75'
                    ? 'flute'
                    : 'coupe'
            }
            cream={chosen.drink === 'White Russian'}
            garnish="peel"
          />
          <h3>{chosen.drink}</h3>
          <p>
            {chosen.work} · {chosen.year}
            <br />
            <small>{chosen.kind} release</small>
          </p>
          {hasCatalogueDrink(chosen.drink) ? (
            <a href={menuLink(chosen.drink)}>Follow the drink ↗</a>
          ) : (
            <a
              href={
                sources[facts.find((fact) => fact.id === chosen.id)!.sources[0]]
                  .url
              }
              target="_blank"
              rel="noreferrer"
            >
              Read the drink’s story ↗
            </a>
          )}
        </div>
      </div>
      <FactNote id={chosen.id} />
      <DataTable
        headers={['Release', 'Work', 'Medium', 'Drink association']}
        rows={rows.map((r) => [r.year, r.work, r.kind, r.drink])}
      />
    </>
  );
}
function Agave({ bloom }: { bloom: boolean }) {
  return (
    <svg viewBox="0 0 30 50" aria-hidden="true">
      <path
        d="M15 45Q0 36 2 25Q8 29 15 45Q8 22 10 16L15 45Q17 15 20 17L15 45Q23 26 29 25Q30 40 15 45Z"
        fill="currentColor"
        fillOpacity={bloom ? 0.65 : 0.28}
      />
      {bloom && (
        <>
          <path
            d="M15 44V4M15 9 8 5M15 15 23 10M15 22 7 17"
            stroke="var(--atlas-gold)"
            strokeWidth="1.5"
          />
          <circle cx="15" cy="4" r="2" fill="var(--atlas-gold)" />
          <circle cx="8" cy="5" r="2" fill="var(--atlas-gold)" />
          <circle cx="23" cy="10" r="2" fill="var(--atlas-gold)" />
          <circle cx="7" cy="17" r="2" fill="var(--atlas-gold)" />
        </>
      )}
    </svg>
  );
}
export function AgaveChart() {
  const [percent, setPercent] = useState(5);
  return (
    <>
      <Slider
        label="Agaves allowed to flower · scenario"
        min={5}
        max={25}
        value={percent}
        unit="%"
        onChange={setPercent}
      />
      <div className="atlas-figure-grid">
        <div
          className="atlas-agave-field"
          role="img"
          aria-label={`${percent} of 100 agave symbols flowering. A model, not field observations.`}
        >
          <svg className="atlas-bat" viewBox="0 0 180 65" aria-hidden="true">
            <path
              d="M90 33Q55 0 5 18Q22 24 25 45Q44 33 56 54Q67 37 90 49Q113 37 124 54Q136 33 155 45Q158 24 175 18Q125 0 90 33Z"
              fill="currentColor"
              fillOpacity=".7"
            />
            <path
              d="m83 34 2-12 6 7 6-7 2 13"
              stroke="currentColor"
              fill="currentColor"
            />
          </svg>
          <div>
            {Array.from({ length: 100 }, (_, i) => (
              <Agave key={i} bloom={i < percent} />
            ))}
          </div>
        </div>
        <Insight number={percent * 10} unit="flowering plants / 1,000">
          <h3>A little left standing.</h3>
          <p>
            {percent === 5
              ? 'The Bat Friendly project’s minimum: five per cent of agaves allowed to flower.'
              : 'A hypothetical higher flowering share. The project asks for at least five per cent.'}
          </p>
          <p>
            Flowers provide nectar for bats and opportunities for pollination.
            The model counts plants; it does not predict ecological outcomes.
          </p>
          <span className="atlas-margin-note">
            The night shift
            <br />
            has an appetite.
          </span>
        </Insight>
      </div>
      <DataTable
        headers={[
          'Model field',
          'Flowering share',
          'Flowering plants',
          'Other plants',
        ]}
        rows={[[1000, percent + '%', percent * 10, 1000 - percent * 10]]}
      />
    </>
  );
}
export function ChemistryChart() {
  const [selected, setSelected] = useState(0);
  const chosen = chemistry[selected];
  const angle = (i: number) =>
    -Math.PI / 2 + (i / chemistry.length) * Math.PI * 2;
  return (
    <>
      <Select
        label="Explore a compound or process"
        value={String(selected)}
        onChange={(v) => setSelected(Number(v))}
        options={chemistry.map((r, i) => ({
          value: String(i),
          label: `${r.name} → ${r.sense}`,
        }))}
      />
      <div className="atlas-figure-grid">
        <Plot
          label="Qualitative network of compounds, processes and sensory effects. Positions do not encode intensity."
          width={640}
          height={500}
          minWidth={530}
        >
          {[90, 172].map((r) => (
            <circle
              key={r}
              cx="320"
              cy="250"
              r={r}
              stroke="var(--line)"
              strokeDasharray="2 6"
              fill="none"
            />
          ))}
          {chemistry.map((r, i) => {
            const a = angle(i),
              x = 320 + Math.cos(a) * 172,
              y = 250 + Math.sin(a) * 172;
            return (
              <g key={r.name} onClick={() => setSelected(i)}>
                <path
                  d={`M320 250Q${320 + Math.cos(a + 0.7) * 100} ${250 + Math.sin(a + 0.7) * 100} ${x} ${y}`}
                  fill="none"
                  stroke={palette[i % 7]}
                  strokeWidth={i === selected ? 2.5 : 1}
                  opacity={i === selected ? 1 : 0.22}
                />
                <circle
                  cx={x}
                  cy={y}
                  r={i === selected ? 13 : 6}
                  fill={palette[i % 7]}
                  fillOpacity={i === selected ? 1 : 0.45}
                />
                <text
                  x={x + Math.cos(a) * 24}
                  y={y + Math.sin(a) * 24 + 4}
                  textAnchor={
                    Math.cos(a) > 0.2
                      ? 'start'
                      : Math.cos(a) < -0.2
                        ? 'end'
                        : 'middle'
                  }
                  fontSize="12"
                >
                  {r.sense}
                </text>
              </g>
            );
          })}
          <circle
            cx="320"
            cy="250"
            r="76"
            fill="var(--paper)"
            stroke={palette[selected % 7]}
            strokeWidth="1.5"
          />
          <text x="320" y="240" textAnchor="middle" fontSize="15">
            {chosen.name}
          </text>
          <text
            x="320"
            y="264"
            textAnchor="middle"
            fontSize="12"
            fill="var(--grey)"
          >
            {chosen.where}
          </text>
        </Plot>
        <div className="atlas-chemistry-note">
          <span className="atlas-overline">The observable part</span>
          <h3>{chosen.sense}</h3>
          <FactNote id={chosen.id} />
        </div>
      </div>
      <DataTable
        headers={['Compound / process', 'Associated effect', 'Context']}
        rows={chemistry.map((r) => [r.name, r.sense, r.where])}
      />
    </>
  );
}
const formats = [
  { name: 'Standard', litres: 0.75, units: 1 },
  { name: 'Magnum', litres: 1.5, units: 2 },
  { name: 'Jeroboam', litres: 3, units: 4 },
  { name: 'Mathusalem', litres: 6, units: 8 },
];
export function BottlesChart() {
  const [serving, setServing] = useState(125);
  return (
    <>
      <Slider
        label="Size of each pour"
        value={serving}
        min={75}
        max={175}
        step={5}
        unit=" ml"
        onChange={setServing}
      />
      <div className="atlas-bottle-formats">
        {formats.map((f) => {
          const result = bottlePours(f.litres, serving);
          return (
            <article key={f.name}>
              <div className="atlas-bottle-title">
                <span>{f.name}</span>
                <strong>
                  {f.litres}
                  <small>L</small>
                </strong>
              </div>
              <div
                className="atlas-bottle-units"
                role="img"
                aria-label={`${f.units} standard 750 ml bottle equivalents`}
              >
                {Array.from({ length: f.units }, (_, i) => (
                  <svg key={i} viewBox="0 0 28 100" aria-hidden="true">
                    <path
                      d="M10 3H18V26Q18 31 23 37V92Q14 97 5 92V37Q10 31 10 26Z"
                      stroke="currentColor"
                      fill="var(--atlas-gold)"
                      fillOpacity=".15"
                    />
                    <path d="M10 15H18M7 55H21V78H7Z" stroke="currentColor" />
                    <path d="M10 3H18V12H10Z" fill="var(--atlas-gold)" />
                  </svg>
                ))}
              </div>
              <div className="atlas-bottle-pours" aria-live="polite">
                <strong>{result.pours}</strong>
                <span>
                  full pours
                  <br />
                  <small>{result.remainder} ml left</small>
                </span>
              </div>
              <p>{f.units} × standard bottle</p>
            </article>
          );
        })}
      </div>
      <p className="atlas-footnote">
        Each drawn bottle = 750 ml of volume, not a scaled physical bottle. Full
        pours exclude spills and foam.
      </p>
      <DataTable
        headers={[
          'Champagne format',
          'Litres',
          '750 ml equivalents',
          'Full pours at ' + serving + ' ml',
          'Remainder ml',
        ]}
        rows={formats.map((f) => {
          const p = bottlePours(f.litres, serving);
          return [f.name, f.litres, f.units, p.pours, p.remainder];
        })}
      />
    </>
  );
}

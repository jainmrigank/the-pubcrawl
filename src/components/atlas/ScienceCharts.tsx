import { useState } from 'react';
import { alcoholUnits, blendAge, dilutedNegroni } from '../../atlasMath';
import { GlassDrawing } from '../landing/GlassDrawing';
import { palette } from './data';
import { Choices, DataTable, fmt, Insight, Plot, Slider } from './shared';
export function DilutionChart() {
  const [water, setWater] = useState(30);
  const drink = dilutedNegroni(water);
  const x = (n: number) => 55 + (n / 90) * 555,
    y = (v: number) => 290 - ((v - 10) / 20) * 245;
  const points = Array.from(
    { length: 91 },
    (_, n) => `${n ? 'L' : 'M'}${x(n)} ${y(dilutedNegroni(n).abv)}`
  ).join(' ');
  return (
    <>
      <Slider
        label="Meltwater added"
        value={water}
        min={0}
        max={90}
        unit=" ml"
        onChange={setWater}
      />
      <div className="atlas-figure-grid">
        <Plot
          label="Model Negroni alcohol concentration falls as meltwater is added"
          width={650}
          height={350}
          minWidth={440}
        >
          {[15, 20, 25, 30].map((n) => (
            <g key={n}>
              <line x1="55" x2="610" y1={y(n)} y2={y(n)} stroke="var(--line)" />
              <text x="5" y={y(n) + 5} fontSize="12">
                {n}%
              </text>
            </g>
          ))}
          {[0, 30, 60, 90].map((n) => (
            <text key={n} x={x(n)} y="328" textAnchor="middle" fontSize="12">
              {n} ml
            </text>
          ))}
          <path
            d={`${points}L610 290L55 290Z`}
            fill="var(--atlas-orange)"
            opacity=".07"
          />
          <path
            d={points}
            fill="none"
            stroke="var(--atlas-orange)"
            strokeWidth="3"
          />
          <line
            x1={x(water)}
            x2={x(water)}
            y1={y(drink.abv)}
            y2="290"
            stroke="var(--atlas-orange)"
            strokeDasharray="4 4"
          />
          <circle
            cx={x(water)}
            cy={y(drink.abv)}
            r="7"
            fill="var(--paper)"
            stroke="var(--atlas-orange)"
            strokeWidth="3"
          />
          <text
            x={Math.min(x(water) + 14, 550)}
            y={y(drink.abv) - 15}
            fontSize="18"
            fill="var(--atlas-orange)"
          >
            {fmt(drink.abv, 1)}%
          </text>
          <text x="55" y="20" className="atlas-svg-label">
            MODEL ABV
          </text>
          <text x="610" y="348" textAnchor="end" className="atlas-svg-label">
            WATER ADDED →
          </text>
        </Plot>
        <Insight number={fmt(drink.abv, 1)} unit="% ABV · model">
          <GlassDrawing kind="rocks" garnish="peel" />
          <dl className="atlas-measures">
            <div>
              <dt>Pure ethanol</dt>
              <dd>24.3 ml</dd>
            </div>
            <div>
              <dt>Total liquid</dt>
              <dd>{drink.volume} ml</dd>
            </div>
            <div>
              <dt>Added water</dt>
              <dd>{water} ml</dd>
            </div>
          </dl>
          <p>Same alcohol. More liquid around it.</p>
        </Insight>
      </div>
      <DataTable
        headers={['Added water, ml', 'Total liquid, ml', 'Model ABV, %']}
        rows={[0, 15, 30, 45, 60, 75, 90].map((n) => [
          n,
          90 + n,
          fmt(dilutedNegroni(n).abv, 2),
        ])}
      />
    </>
  );
}
export function UnitsChart() {
  const [ml, setMl] = useState(150),
    [abv, setAbv] = useState(12);
  const value = alcoholUnits(ml, abv);
  const presets = [
    { name: 'Beer', ml: 355, abv: 5 },
    { name: 'Wine', ml: 150, abv: 12 },
    { name: 'Spirit', ml: 45, abv: 40 },
    { name: 'Wine bottle', ml: 750, abv: 13.5 },
  ];
  return (
    <>
      <div className="atlas-small-choices">
        {presets.map((p) => (
          <button
            key={p.name}
            type="button"
            aria-pressed={p.ml === ml && p.abv === abv}
            onClick={() => {
              setMl(p.ml);
              setAbv(p.abv);
            }}
          >
            {p.name}
            <small>
              {p.ml} ml · {p.abv}%
            </small>
          </button>
        ))}
      </div>
      <div className="atlas-control-row atlas-sliders">
        <Slider
          label="Serving volume"
          min={30}
          max={1000}
          step={5}
          value={ml}
          unit=" ml"
          onChange={setMl}
        />
        <Slider
          label="Alcohol by volume"
          min={0}
          max={60}
          step={0.5}
          value={abv}
          unit="%"
          onChange={setAbv}
        />
      </div>
      <div className="atlas-unit-comparison">
        <div className="atlas-ethanol">
          <span>PURE ALCOHOL</span>
          <strong>
            {fmt(value.ethanol, 1)}
            <small>ml</small>
          </strong>
          <div className="atlas-liquid-meter">
            <i style={{ width: `${abv}%` }} />
          </div>
          <p>{fmt(value.grams, 1)} g, approximately</p>
        </div>
        <div className="atlas-unit-country">
          <span>UNITED KINGDOM</span>
          <strong>{fmt(value.uk, 2)}</strong>
          <p>units · 10 ml pure alcohol each</p>
          <div className="atlas-count-meter" aria-hidden="true">
            <i
              style={{
                width: `${(value.uk / 60) * 100}%`,
                background: 'var(--atlas-teal)',
              }}
            />
          </div>
        </div>
        <div className="atlas-unit-country">
          <span>UNITED STATES</span>
          <strong>≈ {fmt(value.us, 2)}</strong>
          <p>standard drinks · 14 g each</p>
          <div className="atlas-count-meter" aria-hidden="true">
            <i
              style={{
                width: `${(value.us / 60) * 100}%`,
                background: 'var(--atlas-plum)',
              }}
            />
          </div>
        </div>
      </div>
      <p className="atlas-footnote">
        Comparison bars use the same numeric scale, 0–60; units differ. U.S.
        values use the NHS approximation 10 ml ≈ 8 g. Serving presets are
        illustrative metric sizes.
      </p>
      <DataTable
        headers={[
          'Chosen volume ml',
          'ABV %',
          'Ethanol ml',
          'UK units',
          'Approx. U.S. drinks',
        ]}
        rows={[
          [ml, abv, fmt(value.ethanol, 2), fmt(value.uk, 2), fmt(value.us, 2)],
        ]}
      />
    </>
  );
}
const sugar = [
  { name: 'Brut Nature', min: 0, max: 3, range: '< 3 · no added sugar' },
  { name: 'Extra Brut', min: 0, max: 6, range: '0–6' },
  { name: 'Brut', min: 0, max: 12, range: '< 12' },
  { name: 'Extra Dry', min: 12, max: 17, range: '12–17' },
  { name: 'Sec', min: 17, max: 32, range: '17–32' },
  { name: 'Demi-Sec', min: 32, max: 50, range: '32–50' },
  { name: 'Doux', min: 50, max: 60, range: '> 50' },
];
export function SugarChart() {
  const [grams, setGrams] = useState(15),
    [noAdded, setNoAdded] = useState(false);
  const allowed = (i: number) =>
    i === 0
      ? grams < 3 && noAdded
      : i === 1
        ? grams <= 6
        : i === 2
          ? grams < 12
          : i === 6
            ? grams > 50
            : grams >= sugar[i].min && grams <= sugar[i].max;
  const x = (n: number) => 170 + n * 7;
  return (
    <>
      <div className="atlas-control-row atlas-sliders">
        <Slider
          label="Sugar in the wine"
          min={0}
          max={60}
          step={0.5}
          value={grams}
          unit=" g/L"
          onChange={setGrams}
        />
        <label className="atlas-check">
          <input
            type="checkbox"
            checked={noAdded}
            onChange={(e) => setNoAdded(e.target.checked)}
          />
          No sugar added
        </label>
      </div>
      <Plot
        label="Champagne sugar categories overlap along a grams-per-litre scale"
        width={710}
        height={400}
        minWidth={560}
      >
        {[0, 10, 20, 30, 40, 50, 60].map((n) => (
          <g key={n}>
            <line x1={x(n)} x2={x(n)} y1="30" y2="350" stroke="var(--line)" />
            <text x={x(n)} y="380" textAnchor="middle" fontSize="12">
              {n}
            </text>
          </g>
        ))}
        {sugar.map((r, i) => (
          <g key={r.name}>
            <text x="0" y={55 + i * 45} fontSize="14">
              {r.name}
            </text>
            <line
              x1={x(r.min)}
              x2={x(r.max)}
              y1={50 + i * 45}
              y2={50 + i * 45}
              stroke={palette[i]}
              opacity={allowed(i) ? 1 : 0.22}
              strokeWidth={allowed(i) ? 14 : 8}
            />
            <text x="700" y={55 + i * 45} textAnchor="end" fontSize="11">
              {r.range}
            </text>
            {i === 6 && (
              <path
                d={`M${x(60) - 6} ${44 + i * 45}l6 6-6 6`}
                stroke={palette[i]}
                fill="none"
              />
            )}
          </g>
        ))}
        <line
          x1={x(grams)}
          x2={x(grams)}
          y1="20"
          y2="355"
          stroke="var(--ink)"
          strokeWidth="1.5"
          strokeDasharray="3 4"
        />
        <circle cx={x(grams)} cy="20" r="5" fill="var(--ink)" />
        <text x="170" y="400" className="atlas-svg-label">
          SUGAR · grams per litre →
        </text>
      </Plot>
      <div className="atlas-inline-insight" aria-live="polite">
        <strong>{grams} g/L</strong>
        <span>
          Numerically within:{' '}
          {sugar
            .filter((_, i) => allowed(i))
            .map((r) => r.name)
            .join(' · ') || 'none'}
        </span>
      </div>
      <p className="atlas-footnote">
        Brut Nature also requires no added sugar. Overlap is intentional; the
        chart does not assign a bottle’s legal label.
      </p>
      <DataTable
        headers={['Champagne label', 'Sugar g/L']}
        rows={sugar.map((r) => [r.name, r.range])}
      />
    </>
  );
}
const ages = [
  { family: 'Whisky', name: 'Scotch whisky', months: 36 },
  { family: 'Whisky', name: 'Straight bourbon', months: 24 },
  { family: 'Whisky', name: 'Japanese whisky · JSLMA code', months: 36 },
  { family: 'Tequila', name: 'Reposado', months: 2 },
  { family: 'Tequila', name: 'Añejo', months: 12 },
  { family: 'Tequila', name: 'Extra añejo', months: 36 },
  { family: 'Cognac', name: 'VS', months: 24 },
  { family: 'Cognac', name: 'VSOP', months: 48 },
  { family: 'Cognac', name: 'XO', months: 120 },
  { family: 'Cognac', name: 'XXO', months: 168 },
];
export function AgesChart() {
  const [family, setFamily] = useState('All');
  const rows = ages.filter((r) => family === 'All' || r.family === family);
  const x = (m: number) => 270 + (m / 180) * 340;
  return (
    <>
      <Choices
        label="Spirit family"
        value={family}
        onChange={setFamily}
        options={['All', 'Whisky', 'Tequila', 'Cognac'].map((v) => ({
          value: v,
          label: v,
        }))}
      />
      <Plot
        label="Selected minimum maturation periods, in years"
        width={730}
        height={rows.length * 43 + 80}
        minWidth={600}
      >
        {[0, 2, 4, 6, 8, 10, 12, 14].map((year) => (
          <g key={year}>
            <line
              x1={x(year * 12)}
              x2={x(year * 12)}
              y1="12"
              y2={rows.length * 43 + 30}
              stroke="var(--line)"
            />
            <text
              x={x(year * 12)}
              y={rows.length * 43 + 55}
              textAnchor="middle"
              fontSize="12"
            >
              {year}
            </text>
          </g>
        ))}
        {rows.map((r, i) => (
          <g key={r.name}>
            <text x="0" y={i * 43 + 35} fontSize="13">
              {r.name}
            </text>
            <line
              x1={x(0)}
              x2={x(r.months)}
              y1={i * 43 + 30}
              y2={i * 43 + 30}
              stroke={
                palette[['Whisky', 'Tequila', 'Cognac'].indexOf(r.family)]
              }
              strokeWidth="3"
            />
            <circle
              cx={x(r.months)}
              cy={i * 43 + 30}
              r="6"
              fill={palette[['Whisky', 'Tequila', 'Cognac'].indexOf(r.family)]}
            />
            <text x="720" y={i * 43 + 35} textAnchor="end" fontSize="12">
              {r.months < 12 ? `${r.months} months` : `${r.months / 12} years`}
            </text>
          </g>
        ))}
        <text
          x="610"
          y={rows.length * 43 + 78}
          textAnchor="end"
          className="atlas-svg-label"
        >
          MINIMUM YEARS →
        </text>
      </Plot>
      <p className="atlas-footnote">
        These are selected maturation floors, with different production rules.
        Age does not rank quality. JSLMA is an industry code.
      </p>
      <DataTable
        headers={['Family', 'Designation', 'Minimum months']}
        rows={rows.map((r) => [r.family, r.name, r.months])}
      />
    </>
  );
}
export function BlendChart() {
  const [weights, setWeights] = useState([50, 30, 20]);
  const ages = [8, 12, 20];
  const result = blendAge(ages, weights);
  return (
    <>
      <div className="atlas-blend-controls">
        {ages.map((age, i) => (
          <Slider
            key={age}
            label={`${age}-year cask · relative parts`}
            min={0}
            max={100}
            value={weights[i]}
            onChange={(value) =>
              setWeights((p) => p.map((w, j) => (j === i ? value : w)))
            }
          />
        ))}
      </div>
      <div className="atlas-blend">
        <div
          className="atlas-blend-vat"
          role="img"
          aria-label={
            result.total
              ? weights
                  .map(
                    (w, i) =>
                      `${fmt((w / result.total) * 100, 1)}% ${ages[i]} year whisky`
                  )
                  .join(', ')
              : 'Empty blend'
          }
        >
          <div>
            {weights.map((w, i) => (
              <i
                key={i}
                style={{
                  height: `${result.total ? (w / result.total) * 100 : 0}%`,
                  background: palette[i],
                }}
              >
                {w > 0 && (
                  <span>
                    {ages[i]} years · {fmt((w / result.total) * 100, 1)}%
                  </span>
                )}
              </i>
            ))}
          </div>
          <svg viewBox="0 0 300 270" aria-hidden="true">
            <path
              d="M20 15 35 245Q150 280 265 245L280 15"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <ellipse
              cx="150"
              cy="15"
              rx="130"
              ry="12"
              stroke="currentColor"
              fill="none"
            />
          </svg>
        </div>
        <div className="atlas-blend-label" aria-live="polite">
          <span>AGE STATEMENT LIMITED TO</span>
          <strong>
            {result.youngest ?? '—'}
            <em>{result.youngest !== null ? 'years' : 'Empty blend'}</em>
          </strong>
          <p>
            Weighted average:{' '}
            <b>{result.mean === null ? '—' : fmt(result.mean, 1) + ' years'}</b>
          </p>
          <small>
            The average is a calculation.
            <br />
            The youngest is the naming rule.
          </small>
        </div>
      </div>
      <DataTable
        headers={['Cask age', 'Relative parts', 'Share of blend']}
        rows={ages.map((age, i) => [
          age + ' years',
          weights[i],
          result.total
            ? fmt((weights[i] / result.total) * 100, 1) + '%'
            : 'Empty blend',
        ])}
      />
    </>
  );
}

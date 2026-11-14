import { useEffect, useId, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { facts, sources, type Story } from './data';
import { ChartTooltip } from '../ChartTooltip';
export const fmt = (n: number, digits = 0) =>
  n.toLocaleString('en-US', { maximumFractionDigits: digits });
export function useNarrowPlot() {
  const [narrow, setNarrow] = useState(
    () => window.matchMedia('(max-width: 600px)').matches
  );
  useEffect(() => {
    const query = window.matchMedia('(max-width: 600px)');
    const change = () => setNarrow(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  return narrow;
}
export function Choices({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="atlas-choices" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="atlas-select">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option value={o.value} key={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div className="atlas-slider">
      <label htmlFor={id}>
        {label}
        <output htmlFor={id}>
          {fmt(value, 1)}
          {unit}
        </output>
      </label>
      <input
        id={id}
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
export function Plot({
  label,
  children,
  width = 700,
  height = 410,
  minWidth = 480,
  mobileFit = false,
  showHint = true,
}: {
  label: string;
  children: ReactNode;
  width?: number;
  height?: number;
  minWidth?: number;
  mobileFit?: boolean;
  showHint?: boolean;
}) {
  return (
    <div className={'atlas-plot-wrap' + (mobileFit ? ' atlas-mobile-fit' : '')}>
      {showHint && <span className="atlas-pan-hint">
        Scroll ↔ or read the table below.
      </span>}
      <div
        className="atlas-plot"
        tabIndex={0}
        role="region"
        aria-label={label + '. Scroll horizontally if needed.'}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ minWidth: Math.max(minWidth, width * 0.9) }}
          role="img"
          aria-label={label}
        >
          {children}
        </svg>
      </div>
    </div>
  );
}
export function DataTable({
  headers,
  rows,
  caption = 'Read the data',
}: {
  headers: string[];
  rows: (string | number)[][];
  caption?: string;
}) {
  return (
    <details className="atlas-data">
      <summary>{caption}</summary>
      <div
        className="atlas-table-scroll"
        tabIndex={0}
        role="region"
        aria-label={caption}
      >
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              {headers.map((h) => (
                <th scope="col" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) =>
                  j === 0 ? (
                    <th scope="row" key={j}>
                      {cell}
                    </th>
                  ) : (
                    <td key={j}>{cell}</td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
export function Insight({
  number,
  unit,
  children,
}: {
  number: string | number;
  unit?: string;
  children: ReactNode;
}) {
  return (
    <aside className="atlas-insight" aria-live="polite">
      <div className="atlas-insight-number">
        {number}
        <span>{unit}</span>
      </div>
      <div>{children}</div>
    </aside>
  );
}
export function SourceNotes({ story }: { story: Story }) {
  const notes = story.facts
    .map((id) => facts.find((f) => f.id === id))
    .filter((f) => f !== undefined);
  const ids = [...new Set(notes.flatMap((f) => f.sources))];
  return (
    <details className="atlas-sources">
      <summary>
        Sources & how to read this{' '}
        <span>
          {ids.length + (story.extraSources?.length || 0)
            ? `${ids.length + (story.extraSources?.length || 0)} source${ids.length + (story.extraSources?.length || 0) === 1 ? '' : 's'}`
            : 'Catalogue analysis'}
        </span>
      </summary>
      <p>{story.method}</p>
      {!notes.length && (
        <p>
          691 catalogue recipes; counts describe this collection.
        </p>
      )}
      <ul>
        {ids.map((id) => (
          <li key={id}>
            <a href={sources[id].url} target="_blank" rel="noreferrer">
              {sources[id].publisher} — {sources[id].title} ↗
            </a>
            {sources[id].period && <small>{sources[id].period}</small>}
          </li>
        ))}
        {story.extraSources?.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.title} ↗
            </a>
          </li>
        ))}
      </ul>
      {notes.length > 0 && (
        <details className="atlas-related">
          <summary>Related research notes ({notes.length})</summary>
          {notes.map((f) => (
            <div key={f.id}>
              <span>{f.id}</span>
              <p>{f.fact}</p>
              {f.context && <small>{f.context}</small>}
            </div>
          ))}
        </details>
      )}
    </details>
  );
}
export function Enter({ children, id }: { children: ReactNode; id: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      key={id}
      initial={reduced ? false : { opacity: 0, y: 9 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
    >
      {children}
    </motion.div>
  );
}
export function Legend({
  items,
  tooltips = false,
}: {
  items: { label: string; color: string }[];
  tooltips?: boolean;
}) {
  return (
    <ul className="atlas-legend">
      {items.map((i) => (
        <li key={i.label}>
          {tooltips ? <ChartTooltip label={i.label} focusable><i style={{ background: i.color }} />{i.label}</ChartTooltip> : <><i style={{ background: i.color }} />{i.label}</>}
        </li>
      ))}
    </ul>
  );
}
export function FactNote({ id }: { id: string }) {
  const f = facts.find((f) => f.id === id);
  if (!f) return null;
  return (
    <div className="atlas-fact-note">
      <p>{f.fact}</p>
      {f.context && <small>{f.context}</small>}
      <div>
        {f.sources.map((s) => (
          <a key={s} href={sources[s].url} target="_blank" rel="noreferrer">
            {sources[s].publisher} ↗
          </a>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight } from '../../icons';
import { chapters, catalogue, facts, palette, sources, stories } from './data';
import {
  BeerChart,
  DrinkersChart,
  RankingsChart,
  ScotchChart,
  WineChart,
} from './WorldCharts';
import {
  ConstellationChart,
  DnaChart,
  FlowsChart,
  PairingsChart,
  PantryChart,
} from './RecipeCharts';
import {
  AgesChart,
  BlendChart,
  DilutionChart,
  SugarChart,
  UnitsChart,
} from './ScienceCharts';
import {
  AgaveChart,
  BottlesChart,
  ChemistryChart,
  HistoryChart,
  ScreenChart,
} from './CultureCharts';
import { Enter, Select, SourceNotes } from './shared';
import './atlas.css';
const charts = [
  BeerChart,
  ScotchChart,
  WineChart,
  DrinkersChart,
  RankingsChart,
  DnaChart,
  ConstellationChart,
  PairingsChart,
  PantryChart,
  FlowsChart,
  DilutionChart,
  UnitsChart,
  SugarChart,
  AgesChart,
  BlendChart,
  HistoryChart,
  ScreenChart,
  AgaveChart,
  ChemistryChart,
  BottlesChart,
];
function fromUrl() {
  const query = window.location.hash.split('?')[1] || '';
  const id = new URLSearchParams(query).get('story');
  const index = stories.findIndex((s) => s.id === id);
  return Math.max(0, index);
}
function AtlasMark() {
  const nodes = catalogue.ingredients.slice(0, 12);
  return (
    <svg
      className="atlas-cover-art"
      viewBox="0 0 540 450"
      role="img"
      aria-label="Twelve frequent catalogue ingredients orbit the 691 recipe collection. Node area scales with ingredient count."
    >
      <circle cx="270" cy="220" r="165" fill="none" stroke="var(--line)" />
      <circle
        cx="270"
        cy="220"
        r="108"
        fill="none"
        stroke="var(--line)"
        strokeDasharray="2 7"
      />
      {nodes.map((n, i) => {
        const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2,
          x = 270 + Math.cos(a) * 165,
          y = 220 + Math.sin(a) * 165;
        return (
          <g key={n.id}>
            <path
              d={`M270 220Q${270 + Math.cos(a + 0.8) * 140} ${220 + Math.sin(a + 0.8) * 140} ${x} ${y}`}
              fill="none"
              stroke={palette[i % 7]}
              strokeWidth="1"
              opacity=".5"
            />
            <circle
              cx={x}
              cy={y}
              r={Math.sqrt(n.count) * 2}
              fill={palette[i % 7]}
              fillOpacity=".13"
              stroke={palette[i % 7]}
              strokeWidth=".8"
            />
            <circle cx={x} cy={y} r="2" fill={palette[i % 7]} />
            <text
              x={x + Math.cos(a) * 32}
              y={y + Math.sin(a) * 32 + 4}
              textAnchor={
                Math.cos(a) > 0.2
                  ? 'start'
                  : Math.cos(a) < -0.2
                    ? 'end'
                    : 'middle'
              }
              fontSize="11"
            >
              {n.name}
            </text>
          </g>
        );
      })}
      <circle
        cx="270"
        cy="220"
        r="64"
        fill="var(--paper)"
        stroke="var(--ink)"
        strokeWidth=".8"
      />
      <text
        x="270"
        y="222"
        textAnchor="middle"
        fontSize="40"
        fontFamily="Georgia,serif"
      >
        691
      </text>
      <text x="270" y="242" textAnchor="middle" fontSize="10" letterSpacing="2">
        RECIPES
      </text>
      <path
        d="M266 142Q305 145 316 164"
        fill="none"
        stroke="var(--atlas-orange)"
        strokeWidth="2"
      />
      <text
        x="270"
        y="440"
        textAnchor="middle"
        fontSize="10"
        letterSpacing="1.5"
      >
        A FEW INGREDIENTS. AN ENTIRE WORLD.
      </text>
    </svg>
  );
}
function ResearchLibrary() {
  const [query, setQuery] = useState('');
  const visible = useMemo(
    () =>
      facts.filter((f) =>
        (f.hook + ' ' + f.fact + ' ' + f.category + ' ' + f.id)
          .toLowerCase()
          .includes(query.toLowerCase().trim())
      ),
    [query]
  );
  return (
    <details className="atlas-library">
      <summary>
        <span>Keep going.</span>
        <strong>
          The 170 research notes <span>+</span>
        </strong>
      </summary>
      <div className="atlas-library-body">
        <label className="atlas-search">
          <span>Find a fact, drink, place or topic</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Try agave, Bond, yeast…"
          />
        </label>
        <p className="atlas-footnote" role="status">
          {visible.length} of 170 notes · collected 12 November 2026 · sources
          retain their original dates
        </p>
        <div className="atlas-note-list">
          {visible.length === 0 ? (
            <p>No matching notes. Try another ingredient or topic.</p>
          ) : (
            visible.map((f) => (
              <article key={f.id}>
                <div className="atlas-overline">
                  {f.id} · {f.category}
                </div>
                <h3>{f.hook}</h3>
                <p>{f.fact}</p>
                {f.context && <small>{f.context}</small>}
                <div>
                  {f.sources.map((s) => (
                    <a
                      key={s}
                      href={sources[s].url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {sources[s].publisher} ↗
                    </a>
                  ))}
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </details>
  );
}
export default function BarAtlas() {
  const [selected, setSelected] = useState(fromUrl);
  const reader = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const chapter = Math.floor(selected / 5);
  const story = stories[selected];
  const Chart = charts[selected];
  useEffect(() => {
    const sync = () => {
      if (window.location.hash.startsWith('#/atlas')) setSelected(fromUrl());
    };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  function choose(index: number, scroll = false) {
    setSelected(index);
    const state = window.history.state;
    window.history.replaceState(
      state,
      '',
      `#/atlas?story=${stories[index].id}`
    );
    if (scroll) {
      reader.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
      heading.current?.focus({ preventScroll: true });
    }
  }
  return (
    <div className="bar-atlas">
      <header className="atlas-cover">
        <div>
          <p className="atlas-overline">
            <span className="atlas-tiny-star">✳</span> PubCrawl field notes ·
            No. 01
          </p>
          <h1>
            Small talk.
            <br />
            <em>Big picture.</em>
          </h1>
          <p className="atlas-cover-intro">
            An atlas for the curious drinker.
            <br />
            Pull a thread. See what’s connected.
          </p>
          <a
            className="atlas-cover-link"
            href="#/atlas?story=beer"
            onClick={(e) => {
              e.preventDefault();
              choose(0, true);
            }}
          >
            Explore the Bar Atlas <ArrowRight size={20} />
          </a>
          <div className="atlas-cover-counts">
            <span>
              <strong>20</strong> visual stories
            </span>
            <span>
              <strong>170</strong> research notes
            </span>
            <span>
              <strong>691</strong> recipes connected
            </span>
          </div>
        </div>
        <AtlasMark />
      </header>
      <div className="atlas-edition-line">
        <span>THE BAR ATLAS</span>
        <span>Evidence, with a twist.</span>
        <a href="#/menu">Just here for a drink? ↗</a>
      </div>
      <nav className="atlas-chapters" aria-label="Atlas chapters">
        {chapters.map((c, i) => (
          <button
            key={c.short}
            type="button"
            aria-current={chapter === i ? 'true' : undefined}
            onClick={() => choose(i * 5)}
          >
            <span>{String(i + 1).padStart(2, '0')}</span>
            <strong>{c.short}</strong>
            <small>{c.note}</small>
          </button>
        ))}
      </nav>
      <section
        className="atlas-reader"
        id="atlas-reader"
        ref={reader}
        aria-label="Interactive visual story"
      >
        <div className="atlas-reader-toolbar">
          <span>
            {chapters[chapter].name} / {String(selected + 1).padStart(2, '0')}{' '}
            of 20
          </span>
          <div>
            <button
              type="button"
              onClick={() => choose((selected + 19) % 20)}
              aria-label="Previous visual story"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => choose((selected + 1) % 20)}
              aria-label="Next visual story"
            >
              →
            </button>
          </div>
        </div>
        <Select
          label="Choose a visual story"
          value={story.id}
          options={stories.map((s, i) => ({
            value: s.id,
            label: `${String(i + 1).padStart(2, '0')} · ${s.title}`,
          }))}
          onChange={(id) => choose(stories.findIndex((s) => s.id === id))}
        />
        <Enter id={story.id}>
          <div className="atlas-story-heading">
            <div>
              <p className="atlas-overline">{story.type}</p>
              <h2 ref={heading} tabIndex={-1}>
                {story.title}
              </h2>
            </div>
            <p>{story.dek}</p>
          </div>
          <div className="atlas-chart-stage" data-story={story.id}>
            <Chart />
          </div>
          <SourceNotes story={story} />
        </Enter>
        <div className="atlas-reader-bottom">
          <span>Curiosity doesn’t need a last call.</span>
          <button
            type="button"
            onClick={() => choose((selected + 1) % 20, true)}
          >
            Next story <ArrowRight size={18} />
          </button>
        </div>
      </section>
      <section className="atlas-index" aria-label="All twenty visual stories">
        <div className="atlas-index-heading">
          <span className="atlas-overline">The whole round</span>
          <h2>Follow your curiosity.</h2>
          <p>Four chapters. Twenty ways in.</p>
        </div>
        <div className="atlas-index-grid">
          {chapters.map((c, i) => (
            <div key={c.short}>
              <h3>
                <span>{String(i + 1).padStart(2, '0')}</span>
                {c.name}
              </h3>
              {stories.slice(i * 5, i * 5 + 5).map((s, j) => (
                <a
                  key={s.id}
                  href={`#/atlas?story=${s.id}`}
                  aria-current={s.id === story.id ? 'true' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    choose(i * 5 + j, true);
                  }}
                >
                  <small>{String(i * 5 + j + 1).padStart(2, '0')}</small>
                  <span>
                    {s.title}
                    <em>{s.type}</em>
                  </span>
                  <ArrowRight size={15} />
                </a>
              ))}
            </div>
          ))}
        </div>
      </section>
      <ResearchLibrary />
      <footer className="atlas-colophon">
        <p>Original diagrams. Real references. A little room for doubt.</p>
        <p>
          Research assembled 12 November 2026. Collection counts describe
          PubCrawl’s catalogue. Models are labelled; source dates and scope
          travel with every story.
        </p>
        <a href="#/menu">
          Enough theory. Find a drink. <ArrowRight size={16} />
        </a>
      </footer>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { fetchHealth, fetchRecipes, fetchVibes, generateRecipe, matchRecipes } from './api';
import type { Health, Ingredient, MatchResult, Recipe, Vibe } from './types';
import { Typeahead } from './components/Typeahead';
import { UploadZone } from './components/UploadZone';
import { RecipeCard } from './components/RecipeCard';
import { IngredientIcon } from './components/IngredientIcon';
import { Knowledge } from './components/Knowledge';
import { Counter, EASE, Lines, Reveal } from './motion';
import { ArrowDown, ArrowRight, X } from './icons';
import './App.css';

const FALLBACK_VIBE: Vibe = { id: 'boozy', label: 'Spirit-Forward', color: '#8A5A24' };
const NAV = [
  { href: '#shelf', label: 'SHELF' },
  { href: '#pour', label: 'POUR' },
  { href: '#index', label: 'INDEX' },
  { href: '#manual', label: 'MANUAL' },
];

export default function App() {
  const [vibes, setVibes] = useState<Vibe[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [pantry, setPantry] = useState<Ingredient[]>([]);
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [matching, setMatching] = useState(false);
  const [browse, setBrowse] = useState<Recipe[]>([]);
  const [browseQ, setBrowseQ] = useState('');
  const [browseLoading, setBrowseLoading] = useState(true);
  const [aiDrinks, setAiDrinks] = useState<Recipe[]>([]);
  const [vibeFilter, setVibeFilter] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [video, setVideo] = useState<Recipe | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const browseSeed = useRef(String(Math.random()));

  const vibeOf = useCallback(
    (id: string) => vibes.find((v) => v.id === id) ?? FALLBACK_VIBE,
    [vibes]
  );

  useEffect(() => {
    fetchVibes().then(setVibes).catch(() => {});
    fetchHealth().then(setHealth).catch(() => {});
  }, []);

  /* browse / cocktail search */
  useEffect(() => {
    setBrowseLoading(true);
    const t = setTimeout(() => {
      fetchRecipes({ q: browseQ, limit: 12, seed: browseSeed.current })
        .then(setBrowse)
        .catch(() => {})
        .finally(() => setBrowseLoading(false));
    }, browseQ ? 220 : 0);
    return () => clearTimeout(t);
  }, [browseQ]);

  /* pantry matching */
  useEffect(() => {
    if (!pantry.length) {
      setMatch(null);
      return;
    }
    setMatching(true);
    const t = setTimeout(() => {
      matchRecipes(pantry.map((p) => p.name))
        .then(setMatch)
        .catch(() => {})
        .finally(() => setMatching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [pantry]);

  const addIngredient = useCallback((ing: Ingredient) => {
    setPantry((prev) =>
      prev.some((p) => p.name.toLowerCase() === ing.name.toLowerCase()) ? prev : [...prev, ing]
    );
  }, []);
  const addAll = useCallback((ings: Ingredient[]) => ings.forEach(addIngredient), [addIngredient]);
  const removeIngredient = (name: string) => setPantry((prev) => prev.filter((p) => p.name !== name));

  async function invent() {
    if (!pantry.length || generating) return;
    setGenerating(true);
    setGenError('');
    try {
      const drink = await generateRecipe(
        pantry.map((p) => p.name),
        vibeFilter || undefined,
        aiDrinks.map((d) => d.name)
      );
      setAiDrinks((prev) => [drink, ...prev].slice(0, 6));
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  const reshuffle = () => {
    browseSeed.current = String(Math.random());
    setBrowseLoading(true);
    fetchRecipes({ q: browseQ, limit: 12, seed: browseSeed.current })
      .then(setBrowse)
      .catch(() => {})
      .finally(() => setBrowseLoading(false));
  };

  const byVibe = useCallback(
    (list: Recipe[]) => (vibeFilter ? list.filter((r) => r.vibe === vibeFilter) : list),
    [vibeFilter]
  );

  const canMake = useMemo(() => byVibe(match?.canMake ?? []), [match, byVibe]);
  const almost = useMemo(() => byVibe(match?.almost ?? []), [match, byVibe]);
  const featured = useMemo(() => byVibe(browse), [browse, byVibe]);
  const inventions = useMemo(() => byVibe(aiDrinks), [aiDrinks, byVibe]);
  const hasPantry = pantry.length > 0;

  return (
    <MotionConfig reducedMotion="user">
      <div className="site">
        {/* ================= nav ================= */}
        <header className="nav">
          <a className="wordmark" href="#top">
            MIXLAB<sup>®</sup>
          </a>
          <nav className="nav-links" aria-label="Sections">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="nav-link">
                {n.label}
              </a>
            ))}
          </nav>
          <span className="nav-status k-label dim">
            {health ? `INDEX ${health.cocktails} — ${health.llm ? 'LLM LIVE' : 'LLM OFF'}` : '…'}
          </span>
          <button className="nav-menu-btn k-label" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            MENU
          </button>
        </header>

        {/* ================= mobile drawer ================= */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              className="drawer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              <div className="drawer-head">
                <span className="wordmark">MIXLAB<sup>®</sup></span>
                <button className="text-btn" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                  CLOSE <X size={12} />
                </button>
              </div>
              <nav className="drawer-links" aria-label="Sections">
                {NAV.map((n, i) => (
                  <motion.a
                    key={n.href}
                    href={n.href}
                    onClick={() => setMenuOpen(false)}
                    initial={{ y: 44, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.45, delay: 0.06 * i, ease: EASE }}
                  >
                    <span className="k-label dim">0{i + 1}</span>
                    {n.label}
                  </motion.a>
                ))}
              </nav>
              <p className="k-label dim drawer-foot">A FIELD MANUAL FOR THE HOME BAR</p>
            </motion.div>
          )}
        </AnimatePresence>

        <main id="top">
          {/* ================= hero ================= */}
          <section className="hero">
            <div className="hero-kicker">
              <span className="k-label">A FIELD MANUAL FOR THE HOME BAR</span>
              <span className="k-label dim">EST. 2026 — EDITION 01</span>
            </div>
            <Lines className="hero-h1" lines={['YOUR SHELF,', 'DISTILLED.']} />
            <div className="hero-lower">
              <Reveal delay={0.35} className="hero-copy">
                <p>
                  Name what you have — or photograph it. MixLab cross-references a{' '}
                  {health?.cocktails ?? 441}-recipe index, flags what is pourable right now, and
                  drafts originals on demand.
                </p>
                <a className="btn" href="#shelf">
                  OPEN THE SHELF <ArrowDown size={14} />
                </a>
              </Reveal>
              <div className="hero-stats">
                <div className="stat">
                  <span className="stat-n"><Counter to={health?.cocktails ?? 441} /></span>
                  <span className="k-label dim">RECIPES INDEXED</span>
                </div>
                <div className="stat">
                  <span className="stat-n"><Counter to={health?.ingredients ?? 400} /></span>
                  <span className="k-label dim">INGREDIENTS KNOWN</span>
                </div>
                <div className="stat">
                  <span className="stat-n"><Counter to={6} duration={0.8} /></span>
                  <span className="k-label dim">MOODS, COLOUR-CODED</span>
                </div>
              </div>
            </div>
          </section>

          {/* ================= 01 shelf ================= */}
          <section className="sec" id="shelf">
            <SectionHead index="01" title="THE SHELF" note="TYPE IT — OR SHOOT IT" />
            <div className="shelf-grid">
              <div className="shelf-col">
                <span className="k-label field-label">SEARCH INGREDIENTS</span>
                <Typeahead onAdd={addIngredient} />
                <p className="k-label dim hint">EVERY SPIRIT, LIQUEUR, LEAF AND BITTER WE KNOW. FREE TEXT WORKS TOO.</p>
              </div>
              <div className="shelf-col">
                <span className="k-label field-label">READ MY SHELF</span>
                <UploadZone onAdd={addIngredient} onAddAll={addAll} pantry={pantry} />
              </div>
            </div>

            {hasPantry && (
              <div className="pantry">
                <div className="pantry-head">
                  <span className="k-label">ON HAND — {String(pantry.length).padStart(2, '0')}</span>
                  <button className="text-btn" onClick={() => setPantry([])}>
                    CLEAR ALL <X size={11} />
                  </button>
                </div>
                <div className="chip-row">
                  {pantry.map((p) => (
                    <span key={p.name} className="chip">
                      <IngredientIcon name={p.name} image={p.image} size={20} />
                      {p.name}
                      <button className="chip-x" onClick={() => removeIngredient(p.name)} aria-label={`Remove ${p.name}`}>
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="vibe-bar" role="group" aria-label="Filter by mood">
              <span className="k-label dim">MOOD</span>
              <button className={`vibe-chip ${vibeFilter === '' ? 'on' : ''}`} onClick={() => setVibeFilter('')}>
                ALL
              </button>
              {vibes.map((v) => (
                <button
                  key={v.id}
                  className={`vibe-chip ${vibeFilter === v.id ? 'on' : ''}`}
                  style={{ ['--vc' as string]: v.color }}
                  onClick={() => setVibeFilter(vibeFilter === v.id ? '' : v.id)}
                >
                  <i className="swatch" />
                  {v.label.toUpperCase()}
                </button>
              ))}
            </div>
          </section>

          {/* ================= 02 pour ================= */}
          <section className="sec" id="pour">
            <SectionHead
              index="02"
              title="POUR NOW"
              note={hasPantry ? `${canMake.length} READY — ZERO SHOPPING` : 'AWAITING YOUR SHELF'}
              loading={matching}
            />
            {!hasPantry ? (
              <div className="empty">
                <p className="empty-big">NOTHING ON THE SHELF YET.</p>
                <p className="k-label dim">ADD BOTTLES ABOVE — OR BROWSE THE INDEX BELOW.</p>
              </div>
            ) : (
              <>
                <div className="invent-row">
                  <div>
                    <span className="k-label">ORIGINALS</span>
                    <p className="invent-note">
                      The model drinks from your exact shelf{vibeFilter ? ' and honours the mood filter' : ''}. Every
                      press is a new draft.
                    </p>
                  </div>
                  <button className="btn btn-solid" onClick={invent} disabled={generating}>
                    {generating ? 'DRAFTING…' : 'DRAFT AN ORIGINAL'} <ArrowRight size={14} />
                  </button>
                </div>
                {genError && <p className="err" role="alert">{genError}</p>}

                {(inventions.length > 0 || canMake.length > 0) ? (
                  <div className="grid">
                    {inventions.map((r, i) => (
                      <RecipeCard key={r.id} recipe={r} vibe={vibeOf(r.vibe)} index={i} onVideo={setVideo} />
                    ))}
                    {canMake.map((r, i) => (
                      <RecipeCard key={r.id} recipe={r} vibe={vibeOf(r.vibe)} index={i} onVideo={setVideo} />
                    ))}
                  </div>
                ) : (
                  !matching && (
                    <div className="empty">
                      <p className="empty-big">NOTHING POURS CLEAN YET.</p>
                      <p className="k-label dim">ONE OR TWO MORE BOTTLES — SEE THE NEAR MISSES BELOW.</p>
                    </div>
                  )
                )}

                {almost.length > 0 && (
                  <>
                    <SectionHead index="03" title="NEAR MISSES" note="ONE BOTTLE SHORT" sub />
                    <div className="grid">
                      {almost.map((r, i) => (
                        <RecipeCard key={r.id} recipe={r} vibe={vibeOf(r.vibe)} index={i} onVideo={setVideo} />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </section>

          {/* ================= 04 index ================= */}
          <section className="sec" id="index">
            <SectionHead index="04" title="THE INDEX" note={`${health?.cocktails ?? 441} RECIPES, SEARCHABLE`} loading={browseLoading} />
            <div className="index-controls">
              <div className="field index-field">
                <input
                  value={browseQ}
                  onChange={(e) => setBrowseQ(e.target.value)}
                  placeholder="SEARCH BY NAME OR INGREDIENT — NEGRONI, RUM, ANYTHING"
                  aria-label="Search cocktails"
                />
              </div>
              <button className="text-btn" onClick={reshuffle}>
                RESHUFFLE <ArrowRight size={12} />
              </button>
            </div>
            {featured.length === 0 && !browseLoading ? (
              <div className="empty">
                <p className="empty-big">NO ENTRIES.</p>
                <p className="k-label dim">TRY “NEGRONI”, “RUM” OR CLEAR THE MOOD FILTER.</p>
              </div>
            ) : (
              <div className="grid">
                {featured.map((r, i) => (
                  <RecipeCard key={r.id} recipe={r} vibe={vibeOf(r.vibe)} index={i} onVideo={setVideo} />
                ))}
              </div>
            )}
          </section>

          {/* ================= 05 manual ================= */}
          <section className="sec" id="manual">
            <SectionHead index="05" title="FIELD MANUAL" note="THE WORKING LANGUAGE OF MIXING" />
            <Reveal>
              <Knowledge />
            </Reveal>
          </section>
        </main>

        {/* ================= footer ================= */}
        <footer className="foot">
          <Lines as="p" className="foot-big" lines={['POUR SOMETHING', 'PROPER.']} stagger={0.08} />
          <div className="foot-meta">
            <span className="k-label">SOURCE — THECOCKTAILDB, SCRAPED {health?.cocktails ?? 441} ENTRIES</span>
            <span className="k-label">ORIGINALS ARE MACHINE-DRAFTED. TASTE BEFORE SERVING.</span>
            <span className="k-label">MIXLAB © 2026</span>
          </div>
        </footer>

        {/* ================= video modal ================= */}
        <AnimatePresence>
          {video && <VideoModal recipe={video} onClose={() => setVideo(null)} />}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

/* ---------- section header ---------- */
function SectionHead({
  index,
  title,
  note,
  sub = false,
  loading = false,
}: {
  index: string;
  title: string;
  note: string;
  sub?: boolean;
  loading?: boolean;
}) {
  return (
    <div className={`sec-head ${sub ? 'sub' : ''} ${loading ? 'loading' : ''}`}>
      <motion.div
        className="rule"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.9, ease: EASE }}
        style={{ transformOrigin: 'left' }}
      />
      <div className="sec-head-row">
        <span className="k-label sec-index">/{index}</span>
        <Lines as="h2" className="sec-title" lines={[title]} stagger={0} />
        <span className="k-label dim sec-note">{note}</span>
      </div>
      {loading && <span className="loadline" aria-label="Loading" />}
    </div>
  );
}

/* ---------- video modal ---------- */
function VideoModal({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const id = recipe.video.match(/(?:v=|youtu\.be\/)([\w-]{11})/)?.[1];
  const src = id
    ? `https://www.youtube.com/embed/${id}?autoplay=1`
    : `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(`${recipe.name} cocktail recipe`)}`;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <motion.div
      className="modal-backdrop"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: EASE }}
    >
      <motion.div
        className="modal"
        role="dialog"
        aria-label={`${recipe.name} video`}
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 26, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 18, opacity: 0 }}
        transition={{ duration: 0.34, ease: EASE }}
      >
        <div className="modal-head">
          <span className="k-label">{id ? 'HOW IT IS MADE' : 'SEARCHING THE ARCHIVE'} — {recipe.name.toUpperCase()}</span>
          <button className="text-btn" onClick={onClose}>
            CLOSE <X size={12} />
          </button>
        </div>
        <iframe
          src={src}
          title={recipe.name}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </motion.div>
    </motion.div>
  );
}

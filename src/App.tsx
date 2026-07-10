import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { fetchHealth, fetchRecipes, fetchVibes, generateRecipe, matchRecipes } from './api';
import type { Health, Ingredient, MatchResult, Recipe, Vibe } from './types';
import { Typeahead } from './components/Typeahead';
import { UploadZone } from './components/UploadZone';
import { RecipeCard } from './components/RecipeCard';
import { IngredientIcon } from './components/IngredientIcon';
import { Knowledge } from './components/Knowledge';
import { Counter, EASE, Lines, LOADED_HIDDEN, Reveal } from './motion';
import { ArrowDown, ArrowRight, PubGlyph, SketchDefs, X } from './icons';
import './App.css';

const FALLBACK_VIBE: Vibe = { id: 'boozy', label: 'Spirit-Forward', color: '#8A5A24' };
const NAV = [
  { href: '#bar', label: 'THE BAR' },
  { href: '#shelf', label: 'YOUR SHELF' },
  { href: '#pour', label: 'POUR' },
  { href: '#basics', label: 'BASICS' },
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

  /* drink search / browse */
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

  /* shelf matching */
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
      setGenError(err instanceof Error ? err.message : 'That didn\'t work — try again.');
    } finally {
      setGenerating(false);
    }
  }

  const anotherRound = () => {
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

  const scrollToBar = () => {
    document.querySelector('#bar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="site">
        <SketchDefs />

        {/* ================= nav ================= */}
        <header className="nav">
          <a className="brand" href="#top">
            <PubGlyph size={30} />
            <span className="wordmark">The PubCrawl</span>
          </a>
          <nav className="nav-links" aria-label="Sections">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="nav-link">
                {n.label}
              </a>
            ))}
          </nav>
          <span className="nav-status k-label dim">
            {health ? `${health.cocktails} DRINKS ON TAP` : '…'}
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
                <span className="brand">
                  <PubGlyph size={30} />
                  <span className="wordmark">The PubCrawl</span>
                </span>
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
              <p className="k-label dim drawer-foot">EVERY BAR, ONE KITCHEN.</p>
            </motion.div>
          )}
        </AnimatePresence>

        <main id="top">
          {/* ================= hero ================= */}
          <section className="hero">
            <div className="hero-kicker">
              <span className="k-label">EVERY BAR, ONE KITCHEN</span>
              <span className="k-label dim">EST. 2026</span>
            </div>
            <Lines className="hero-h1" lines={['WHAT’S YOUR', 'POISON?']} />
            <div className="hero-lower">
              <Reveal delay={0.35} className="hero-copy">
                <p>
                  Hop from drink to drink without leaving the kitchen. Search any cocktail below,
                  or tell us what’s on your shelf and we’ll find the ones you can pour tonight —
                  plus a few nobody’s ever tasted.
                </p>
                <div className="field hero-search">
                  <input
                    value={browseQ}
                    onChange={(e) => setBrowseQ(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && scrollToBar()}
                    placeholder="SEARCH ANY DRINK — MOJITO, NEGRONI, RUM…"
                    aria-label="Search drinks"
                  />
                </div>
                <a className="btn" href="#shelf">
                  WHAT CAN I MAKE? <ArrowDown size={14} />
                </a>
              </Reveal>
              <div className="hero-stats">
                <div className="stat">
                  <span className="stat-n"><Counter to={health?.cocktails ?? 441} /></span>
                  <span className="k-label dim">DRINKS TO TRY</span>
                </div>
                <div className="stat">
                  <span className="stat-n"><Counter to={health?.ingredients ?? 400} /></span>
                  <span className="k-label dim">INGREDIENTS WE KNOW</span>
                </div>
                <div className="stat">
                  <span className="stat-n"><Counter to={6} duration={0.8} /></span>
                  <span className="k-label dim">MOODS TO MATCH</span>
                </div>
              </div>
            </div>
          </section>

          {/* ================= 01 the bar ================= */}
          <section className="sec" id="bar">
            <SectionHead
              index="01"
              title="THE BAR"
              note={browseQ ? `${featured.length} FOR “${browseQ.toUpperCase()}”` : 'TONIGHT’S DOZEN — OR SEARCH ABOVE'}
              loading={browseLoading}
            />
            <div className="bar-controls">
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
              <button className="text-btn" onClick={anotherRound}>
                ANOTHER ROUND <ArrowRight size={12} />
              </button>
            </div>
            {featured.length === 0 && !browseLoading ? (
              <div className="empty">
                <p className="empty-big">NOTHING BY THAT NAME.</p>
                <p className="k-label dim">TRY “NEGRONI” OR “RUM” — OR CLEAR THE MOOD FILTER.</p>
              </div>
            ) : (
              <div className="grid">
                {featured.map((r, i) => (
                  <RecipeCard key={r.id} recipe={r} vibe={vibeOf(r.vibe)} index={i} onVideo={setVideo} />
                ))}
              </div>
            )}
          </section>

          {/* ================= 02 your shelf ================= */}
          <section className="sec" id="shelf">
            <SectionHead index="02" title="YOUR SHELF" note="TYPE IT — OR SNAP IT" />
            <div className="shelf-grid">
              <div className="shelf-col">
                <span className="k-label field-label">WHAT HAVE YOU GOT?</span>
                <Typeahead onAdd={addIngredient} />
                <p className="k-label dim hint">GIN, YUZU, MINT — IF YOU’VE GOT IT, WE KNOW IT.</p>
              </div>
              <div className="shelf-col">
                <span className="k-label field-label">OR SHOW US</span>
                <UploadZone onAdd={addIngredient} onAddAll={addAll} pantry={pantry} />
              </div>
            </div>

            {hasPantry && (
              <div className="pantry">
                <div className="pantry-head">
                  <span className="k-label">ON THE SHELF — {String(pantry.length).padStart(2, '0')}</span>
                  <button className="text-btn" onClick={() => setPantry([])}>
                    CLEAR ALL <X size={11} />
                  </button>
                </div>
                <div className="chip-row">
                  {pantry.map((p) => (
                    <span key={p.name} className="chip">
                      <IngredientIcon category={p.category} size={18} />
                      {p.name}
                      <button className="chip-x" onClick={() => removeIngredient(p.name)} aria-label={`Remove ${p.name}`}>
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* ================= 03 pour tonight ================= */}
          <section className="sec" id="pour">
            <SectionHead
              index="03"
              title="POUR TONIGHT"
              note={hasPantry ? `${canMake.length} READY — NO SHOPPING NEEDED` : 'WAITING ON YOUR SHELF'}
              loading={matching}
            />
            {!hasPantry ? (
              <div className="empty">
                <p className="empty-big">YOUR SHELF’S EMPTY.</p>
                <p className="k-label dim">ADD A FEW BOTTLES ABOVE — WE’LL DO THE REST.</p>
              </div>
            ) : (
              <>
                <div className="invent-row">
                  <div>
                    <span className="k-label">HOUSE SPECIALS</span>
                    <p className="invent-note">
                      A brand-new drink, dreamed up from exactly what you’ve got
                      {vibeFilter ? ' in your chosen mood' : ''}. Every press pours something different.
                    </p>
                  </div>
                  <button className="btn btn-solid" onClick={invent} disabled={generating}>
                    {generating ? 'MIXING…' : 'MIX ME SOMETHING NEW'} <ArrowRight size={14} />
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
                      <p className="k-label dim">ONE OR TWO MORE BOTTLES — SEE “SO CLOSE” BELOW.</p>
                    </div>
                  )
                )}

                {almost.length > 0 && (
                  <>
                    <SectionHead index="04" title="SO CLOSE" note="ONE BOTTLE SHORT" sub />
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

          {/* ================= 05 bar basics ================= */}
          <section className="sec" id="basics">
            <SectionHead index="05" title="BAR BASICS" note="EVERYTHING WORTH KNOWING — NO SNOBBERY" />
            <Reveal>
              <Knowledge />
            </Reveal>
          </section>
        </main>

        {/* ================= footer ================= */}
        <footer className="foot">
          <Lines as="p" className="foot-big" lines={['POUR SOMETHING', 'PROPER.']} stagger={0.08} />
          <div className="foot-meta">
            <span className="k-label">RECIPES FROM THECOCKTAILDB</span>
            <span className="k-label">HOUSE SPECIALS ARE ROBOT-MADE — TASTE BEFORE SERVING</span>
            <span className="k-label">THE PUBCRAWL © 2026</span>
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
        initial={LOADED_HIDDEN ? false : { scaleX: 0 }}
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
          <span className="k-label">{id ? 'WATCH IT MADE' : 'FINDING A VIDEO'} — {recipe.name.toUpperCase()}</span>
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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { fetchHealth, fetchLikes, fetchRecipes, fetchVibes, generateRecipe, matchRecipes, postLike } from './api';
import type { Health, Ingredient, MatchResult, Recipe, Vibe } from './types';
import { Typeahead } from './components/Typeahead';
import { UploadZone } from './components/UploadZone';
import { RecipeCard } from './components/RecipeCard';
import { IngredientIcon } from './components/IngredientIcon';
import { Knowledge } from './components/Knowledge';
import { Counter, EASE, Lines, LOADED_HIDDEN, Reveal } from './motion';
import { ArrowDown, ArrowRight, Check, Heart, PubGlyph, Share, Shuffle, SketchDefs, X } from './icons';
import { shareContent, tabShareText } from './share';
import './App.css';

const FALLBACK_VIBE: Vibe = { id: 'boozy', label: 'Spirit-Forward', color: '#8A5A24' };

type Route = 'menu' | 'bar' | 'basics' | 'tab';
const ROUTES: Route[] = ['menu', 'bar', 'basics', 'tab'];
const NAV: { route: Route; label: string }[] = [
  { route: 'menu', label: 'THE MENU' },
  { route: 'bar', label: 'THE BAR' },
  { route: 'basics', label: 'BASICS' },
  { route: 'tab', label: 'THE TAB' },
];

function parseRoute(): Route {
  const h = window.location.hash.replace(/^#\/?/, '') as Route;
  return ROUTES.includes(h) ? h : 'menu';
}

function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parseRoute);
  useEffect(() => {
    // every page keeps its scroll position, so hopping to The Tab and back
    // drops you exactly where you left the list
    const positions: Partial<Record<Route, number>> = {};
    let current = parseRoute();
    const onChange = () => {
      positions[current] = window.scrollY;
      current = parseRoute();
      setRoute(current);
      const target = positions[current] ?? 0;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => window.scrollTo({ top: target, behavior: 'instant' as ScrollBehavior }))
      );
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

const MENU_MAX = 120;

export default function App() {
  const route = useRoute();
  const [vibes, setVibes] = useState<Vibe[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [pantry, setPantry] = useState<Ingredient[]>([]);
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [matching, setMatching] = useState(false);
  const [browse, setBrowse] = useState<Recipe[]>([]);
  const [browseQ, setBrowseQ] = useState('');
  const [browseLimit, setBrowseLimit] = useState(12);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [browseError, setBrowseError] = useState(false);
  const [aiDrinks, setAiDrinks] = useState<Recipe[]>([]);
  const [vibeFilter, setVibeFilter] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [video, setVideo] = useState<Recipe | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState<Recipe[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('pubcrawl.tab') || '[]');
    } catch {
      return [];
    }
  });
  const [tabShared, setTabShared] = useState(false);
  const [browseSeed, setBrowseSeed] = useState(() => String(Math.random()));
  const [likes, setLikes] = useState<Record<string, number>>({});
  const [likedIds, setLikedIds] = useState<Set<string>>(() => {
    try {
      return new Set<string>(JSON.parse(localStorage.getItem('pubcrawl.liked') || '[]'));
    } catch {
      return new Set();
    }
  });
  const [loved, setLoved] = useState(false);

  const vibeOf = useCallback(
    (id: string) => vibes.find((v) => v.id === id) ?? FALLBACK_VIBE,
    [vibes]
  );

  useEffect(() => {
    fetchVibes().then(setVibes).catch(() => {});
    fetchHealth().then(setHealth).catch(() => {});
    fetchLikes().then(setLikes).catch(() => {});
  }, []);

  // the page behind the mobile drawer shouldn't scroll while it's open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  useEffect(() => {
    try {
      localStorage.setItem('pubcrawl.tab', JSON.stringify(tab));
    } catch {}
  }, [tab]);

  useEffect(() => {
    try {
      localStorage.setItem('pubcrawl.liked', JSON.stringify([...likedIds]));
    } catch {}
  }, [likedIds]);

  const toggleLike = useCallback(
    (recipe: Recipe) => {
      const wasLiked = likedIds.has(recipe.id);
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.delete(recipe.id);
        else next.add(recipe.id);
        return next;
      });
      setLikes((prev) => ({ ...prev, [recipe.id]: Math.max(0, (prev[recipe.id] || 0) + (wasLiked ? -1 : 1)) }));
      postLike(recipe.id, wasLiked ? 'unlike' : 'like')
        .then((r) => setLikes((prev) => ({ ...prev, [r.id]: r.likes })))
        .catch(() => {});
    },
    [likedIds]
  );

  /* menu search / browse. Mood + search both apply server-side over the full catalogue,
     so a mood is never silently filtering a search down to nothing. */
  useEffect(() => {
    setBrowseLoading(true);
    setBrowseError(false);
    const t = setTimeout(() => {
      fetchRecipes({ q: browseQ, vibe: vibeFilter, limit: browseLimit, seed: browseSeed, sort: loved ? 'likes' : undefined })
        .then(setBrowse)
        .catch(() => setBrowseError(true))
        .finally(() => setBrowseLoading(false));
    }, browseQ ? 220 : 0);
    return () => clearTimeout(t);
  }, [browseQ, browseLimit, browseSeed, vibeFilter, loved]);

  /* fresh random dozen */
  const surpriseMe = () => {
    setBrowseQ('');
    setBrowseLimit(12);
    setLoved(false);
    setBrowseSeed(String(Math.random()));
  };

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

  const toggleTab = useCallback((recipe: Recipe) => {
    setTab((prev) =>
      prev.some((r) => r.id === recipe.id) ? prev.filter((r) => r.id !== recipe.id) : [...prev, recipe]
    );
  }, []);
  const tabIds = useMemo(() => new Set(tab.map((r) => r.id)), [tab]);

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
      setGenError(err instanceof Error ? err.message : 'That did not work. Try again.');
    } finally {
      setGenerating(false);
    }
  }

  const byVibe = useCallback(
    (list: Recipe[]) => {
      if (!vibeFilter) return list;
      if (vibeFilter === 'zeroproof')
        return list.filter((r) => (r.alcoholic || '').toLowerCase().includes('non'));
      return list.filter((r) => r.vibe === vibeFilter);
    },
    [vibeFilter]
  );

  const canMake = useMemo(() => byVibe(match?.canMake ?? []), [match, byVibe]);
  const almost = useMemo(() => byVibe(match?.almost ?? []), [match, byVibe]);
  // mood + search are server-filtered; in the Most Loved view also sort here
  // with the same counts the hearts display, so order always matches them
  const featured = useMemo(
    () => (loved ? [...browse].sort((a, b) => (likes[b.id] || 0) - (likes[a.id] || 0)) : browse),
    [browse, loved, likes]
  );
  const inventions = useMemo(() => byVibe(aiDrinks), [aiDrinks, byVibe]);
  const hasPantry = pantry.length > 0;
  const moreLeft = browse.length >= browseLimit && browseLimit < MENU_MAX;

  const card = (r: Recipe, i: number, removeMode = false) => (
    <RecipeCard
      key={r.id}
      recipe={r}
      vibe={vibeOf(r.vibe)}
      index={i}
      onVideo={setVideo}
      onToggleTab={toggleTab}
      inTab={tabIds.has(r.id)}
      removeMode={removeMode}
      likes={likes[r.id] || 0}
      liked={likedIds.has(r.id)}
      onToggleLike={toggleLike}
    />
  );

  const moodBar = (
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
      <button
        className={`vibe-chip ${vibeFilter === 'zeroproof' ? 'on' : ''}`}
        style={{ ['--vc' as string]: '#6B7A6E' }}
        onClick={() => setVibeFilter(vibeFilter === 'zeroproof' ? '' : 'zeroproof')}
      >
        <i className="swatch" />
        ZERO-PROOF
      </button>
    </div>
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className="site">
        <SketchDefs />

        {/* ================= nav ================= */}
        <header className="nav">
          <a className="brand" href="#/menu">
            <PubGlyph size={30} />
            <span className="wordmark">The PubCrawl</span>
          </a>
          <nav className="nav-links" aria-label="Pages">
            {NAV.map((n) => (
              <a
                key={n.route}
                href={`#/${n.route}`}
                className={`nav-link ${route === n.route ? 'active' : ''}`}
                aria-current={route === n.route ? 'page' : undefined}
              >
                {n.label}
                {n.route === 'tab' && tab.length > 0 ? ` (${tab.length})` : ''}
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
              <nav className="drawer-links" aria-label="Pages">
                {NAV.map((n, i) => (
                  <motion.a
                    key={n.route}
                    href={`#/${n.route}`}
                    onClick={() => setMenuOpen(false)}
                    initial={{ y: 44, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.45, delay: 0.06 * i, ease: EASE }}
                  >
                    <span className="k-label dim">0{i + 1}</span>
                    {n.label}
                    {n.route === 'tab' && tab.length > 0 ? ` (${tab.length})` : ''}
                  </motion.a>
                ))}
              </nav>
              <p className="k-label dim drawer-foot">EVERY BAR, ONE KITCHEN.</p>
            </motion.div>
          )}
        </AnimatePresence>

        <main>
          {/* every page stays mounted (hidden when inactive) so lists, search,
              flipped cards and accordion state survive switching between them */}
            <div hidden={route !== 'menu'}>
              <>
                {/* ================= the menu (landing) ================= */}
                <section className="hero">
                  <div className="hero-kicker">
                    <span className="k-label">EVERY BAR, ONE KITCHEN</span>
                    <span className="k-label dim">EST. 2026</span>
                  </div>
                  <Lines className="hero-h1" lines={['WHAT’S YOUR', 'POISON?']} />
                  <div className="hero-lower">
                    <Reveal delay={0.35} className="hero-copy">
                      <p>
                        Hop from drink to drink without leaving the kitchen. Browse the menu below,
                        or head to The Bar with what’s on your shelf and we’ll find the drinks you
                        can pour tonight, plus a few nobody’s ever tasted.
                      </p>
                      <a className="btn" href="#/bar">
                        WHAT CAN I MAKE? <ArrowRight size={14} />
                      </a>
                    </Reveal>
                    <div className="hero-stats">
                      <div className="stat">
                        <span className="stat-n"><Counter to={health?.cocktails ?? 611} /></span>
                        <span className="k-label dim">DRINKS TO TRY</span>
                      </div>
                      <div className="stat">
                        <span className="stat-n"><Counter to={health?.ingredients ?? 431} /></span>
                        <span className="k-label dim">INGREDIENTS WE KNOW</span>
                      </div>
                      <div className="stat">
                        <span className="stat-n"><Counter to={6} duration={0.8} /></span>
                        <span className="k-label dim">MOODS TO MATCH</span>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="sec" id="menu-list">
                  <SectionHead
                    index="01"
                    title="THE MENU"
                    note={
                      browseQ
                        ? `${featured.length} FOR “${browseQ.toUpperCase()}”`
                        : loved
                          ? 'THE CROWD’S FAVOURITES FIRST'
                          : vibeFilter
                            ? `SHOWING ${featured.length} IN THIS MOOD`
                            : `SHOWING ${featured.length} OF ${health?.cocktails ?? 611}`
                    }
                    loading={browseLoading}
                  />
                  <div className="field menu-search">
                    <input
                      value={browseQ}
                      onChange={(e) => setBrowseQ(e.target.value)}
                      placeholder="SEARCH ANY DRINK… MOJITO, NEGRONI, RUM"
                      aria-label="Search drinks"
                    />
                  </div>
                  <div className="bar-controls">
                    {moodBar}
                    <div className="menu-actions">
                      <button
                        className={`text-btn ${loved ? 'loved-on' : ''}`}
                        onClick={() => {
                          if (!loved) fetchLikes().then(setLikes).catch(() => {});
                          setLoved((v) => !v);
                        }}
                        aria-pressed={loved}
                      >
                        MOST LOVED <Heart size={12} />
                      </button>
                      <button className="text-btn" onClick={surpriseMe}>
                        SURPRISE ME <Shuffle size={13} />
                      </button>
                    </div>
                  </div>
                  {featured.length === 0 && browseLoading ? (
                    <div className="empty">
                      <p className="empty-big">OPENING THE BAR…</p>
                      <p className="k-label dim">FIRST VISIT OF THE DAY CAN TAKE HALF A MINUTE WHILE THE KITCHEN WAKES.</p>
                    </div>
                  ) : featured.length === 0 && browseError ? (
                    <div className="empty">
                      <p className="empty-big">THE BAR’S STILL WAKING UP.</p>
                      <p className="k-label dim">GIVE IT A MOMENT, THEN KNOCK AGAIN.</p>
                      <button className="btn empty-retry" onClick={() => setBrowseSeed(String(Math.random()))}>
                        KNOCK AGAIN <ArrowRight size={14} />
                      </button>
                    </div>
                  ) : featured.length === 0 && !browseLoading ? (
                    <div className="empty">
                      <p className="empty-big">NOTHING BY THAT NAME.</p>
                      <p className="k-label dim">TRY “NEGRONI” OR “RUM”, OR CLEAR THE MOOD FILTER.</p>
                    </div>
                  ) : (
                    <>
                      <div className="grid">{featured.map((r, i) => card(r, i))}</div>
                      {moreLeft && !browseLoading && (
                        <div className="more-row">
                          <button className="btn" onClick={() => setBrowseLimit((l) => l + 12)}>
                            SHOW 12 MORE DRINKS <ArrowDown size={14} />
                          </button>
                          <span className="k-label dim">
                            {browse.length} OF {health?.cocktails ?? 611} ON SHOW
                          </span>
                          <button className="text-btn" onClick={surpriseMe}>
                            OR SURPRISE ME <Shuffle size={12} />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </section>
              </>
            </div>

            <div hidden={route !== 'bar'}>
              <>
                {/* ================= the bar: shelf + pour ================= */}
                <section className="sec page-top" id="shelf">
                  <SectionHead index="01" title="YOUR SHELF" note="TYPE IT OR SNAP IT" />
                  <div className="shelf-grid">
                    <div className="shelf-col">
                      <span className="k-label field-label">WHAT HAVE YOU GOT?</span>
                      <Typeahead onAdd={addIngredient} />
                      <p className="k-label dim hint">GIN, YUZU, MINT. IF YOU’VE GOT IT, WE KNOW IT.</p>
                    </div>
                    <div className="shelf-col">
                      <span className="k-label field-label">OR SHOW US</span>
                      <UploadZone onAdd={addIngredient} onAddAll={addAll} pantry={pantry} />
                    </div>
                  </div>

                  {hasPantry && (
                    <div className="pantry">
                      <div className="pantry-head">
                        <span className="k-label">ON THE SHELF: {String(pantry.length).padStart(2, '0')}</span>
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

                <section className="sec" id="pour">
                  <SectionHead
                    index="02"
                    title="POUR TONIGHT"
                    note={hasPantry ? `${canMake.length} READY, NO SHOPPING NEEDED` : 'WAITING ON YOUR SHELF'}
                    loading={matching}
                  />
                  {!hasPantry ? (
                    <div className="empty">
                      <p className="empty-big">YOUR SHELF’S EMPTY.</p>
                      <p className="k-label dim">ADD A FEW BOTTLES ABOVE. WE’LL DO THE REST.</p>
                    </div>
                  ) : (
                    <>
                      <div className="bar-controls">{moodBar}</div>
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
                          {inventions.map((r, i) => card(r, i))}
                          {canMake.map((r, i) => card(r, i))}
                        </div>
                      ) : (
                        !matching && (
                          <div className="empty">
                            <p className="empty-big">NOTHING POURS CLEAN YET.</p>
                            <p className="k-label dim">ONE OR TWO MORE BOTTLES AND YOU’RE THERE. SEE “SO CLOSE” BELOW.</p>
                          </div>
                        )
                      )}

                      {almost.length > 0 && (
                        <>
                          <SectionHead index="03" title="SO CLOSE" note="ONE BOTTLE SHORT" sub />
                          <div className="grid">{almost.map((r, i) => card(r, i))}</div>
                        </>
                      )}
                    </>
                  )}
                </section>
              </>
            </div>

            <div hidden={route !== 'basics'}>
              <section className="sec page-top" id="basics">
                <SectionHead index="01" title="BAR BASICS" note="EVERYTHING WORTH KNOWING, NO SNOBBERY" />
                <Reveal>
                  <Knowledge />
                </Reveal>
              </section>
            </div>

            <div hidden={route !== 'tab'}>
              <section className="sec page-top" id="tab-page">
                <SectionHead
                  index="01"
                  title="THE TAB"
                  note={tab.length ? `${tab.length} ON YOUR TAB TONIGHT` : 'YOUR MENU FOR THE NIGHT'}
                />
                {tab.length === 0 ? (
                  <div className="empty">
                    <p className="empty-big">NOTHING ON THE TAB YET.</p>
                    <p className="k-label dim">
                      TAP THE + ON ANY DRINK CARD TO START TONIGHT’S LINEUP.{' '}
                      <a className="empty-link" href="#/menu">BROWSE THE MENU</a>
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="tab-head">
                      <span className="k-label dim">SAVED ON THIS DEVICE. IT KEEPS BETWEEN VISITS.</span>
                      <div className="tab-head-actions">
                        <button
                          className="text-btn"
                          onClick={async () => {
                            const outcome = await shareContent("Tonight's Tab · The PubCrawl", tabShareText(tab));
                            if (outcome === 'copied') {
                              setTabShared(true);
                              setTimeout(() => setTabShared(false), 1600);
                            }
                          }}
                        >
                          {tabShared ? (
                            <>COPIED <Check size={11} /></>
                          ) : (
                            <>SHARE THE TAB <Share size={11} /></>
                          )}
                        </button>
                        <button className="text-btn" onClick={() => setTab([])}>
                          CLEAR THE TAB <X size={11} />
                        </button>
                      </div>
                    </div>
                    <div className="grid">{tab.map((r, i) => card(r, i, true))}</div>
                  </>
                )}
              </section>
            </div>
        </main>

        {/* ================= footer ================= */}
        <footer className="foot">
          <Lines as="p" className="foot-big" lines={['POUR SOMETHING', 'PROPER.']} stagger={0.08} />
          <div className="foot-meta">
            <span className="k-label">RECIPES FROM THECOCKTAILDB</span>
            <span className="k-label">HOUSE SPECIALS ARE ROBOT-MADE. TASTE BEFORE SERVING.</span>
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
          <span className="k-label">{id ? 'WATCH IT MADE' : 'FINDING A VIDEO'}: {recipe.name.toUpperCase()}</span>
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

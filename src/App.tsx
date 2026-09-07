import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { fetchHealth, fetchKeptRecipes, fetchLikes, fetchRecipes, fetchVibes, generateRecipe, keepRecipe, matchRecipes, postLike } from './api';
import type { BrowseFilter, Health, Ingredient, MatchResult, Recipe, Theme, TourId, Vibe, VibeId } from './types';
import { Typeahead } from './components/Typeahead';
import { UploadZone } from './components/UploadZone';
import { RecipeCard } from './components/RecipeCard';
import { IngredientIcon } from './components/IngredientIcon';
import { Knowledge } from './components/Knowledge';
import { BarTalk } from './components/BarTalk';
import { InstallBanner } from './components/InstallBanner';
import { NudgeToggle } from './components/NudgeToggle';
import { NudgePrompt } from './components/NudgePrompt';
import { Quiz } from './components/Quiz';
import { Watch } from './components/Watch';
import { Shorts } from './components/Shorts';
import { CategoryFilter } from './components/CategoryFilter';
import { MobileNavigation, MobileTopActions } from './components/MobileNavigation';
import { DailyQuestion } from './components/DailyQuestion';
import { GuidedTour } from './components/GuidedTour';
import { ShelfResults } from './components/ShelfResults';
import { ContextualHelp } from './components/ContextualHelp';
import { EASE, Lines, LOADED_HIDDEN, Reveal } from './motion';
import { ArrowDown, ArrowRight, Burger, Check, Heart, PubGlyph, Share, Shuffle, SketchDefs, Sun, X } from './icons';
import { shareContent, tabShareText } from './share';
import { applyTheme, currentTheme, persistTheme } from './theme';
import { loadLocalCatalogue, matchLocalRecipes, queryLocalRecipes } from './localData';
import type { Route } from './navigation';
import { OVERLAY_PRIORITY, overlayGate, setBackgroundInert } from './overlayGate';
import './App.css';

const FALLBACK_VIBE: Vibe = { id: 'boozy', label: 'Spirit-Forward', color: '#8A5A24' };
const VIDEO_MODAL_GATE_ID = 'recipe-video';

const ROUTES: Route[] = ['menu', 'bar', 'basics', 'tab', 'quiz', 'watch', 'shorts'];
const NAV: { route: Route; label: string }[] = [
  { route: 'menu', label: 'MENU' },
  { route: 'bar', label: 'SHELF' },
  { route: 'tab', label: 'TAB' },
  { route: 'quiz', label: 'QUIZ' },
  { route: 'shorts', label: 'SHORTS' },
  { route: 'watch', label: 'WATCH' },
  { route: 'basics', label: 'BAR BASICS' },
];

/** the path part of the hash, without the query: '' | 'menu' | 'bar' | … */
function hashPath(): string {
  return window.location.hash.replace(/^#\/?/, '').split('?')[0];
}

function parseRoute(): Route {
  const h = hashPath() as Route;
  return ROUTES.includes(h) ? h : 'menu';
}

/**
 * The landing page and the drinks list live on the same route, so the hash
 * decides which one you arrive at: a bare URL (or the wordmark) opens the
 * landing view, while #/menu goes straight to the list.
 */
function isLandingView(): boolean {
  return hashPath() === '';
}

function hashParams(): URLSearchParams {
  const i = window.location.hash.indexOf('?');
  return new URLSearchParams(i === -1 ? '' : window.location.hash.slice(i + 1));
}

/** a nudge can deep-link straight to a drink: #/menu?q=<name> */
function hashQuery(): string {
  return hashParams().get('q') || '';
}

/** the 5pm nudge lands on #/quiz?daily=1, which always opens today's question */
function wantsDaily(): boolean {
  return hashParams().get('daily') === '1';
}

/** a shareable Shorts link carries the YouTube id after ?v= */
function shortVideoId(): string {
  return hashParams().get('v') || '';
}

function shortsSource(): string {
  return hashParams().get('src') || 'direct';
}

/** a shareable Watch link carries the YouTube id after ?v= */
function watchVideoId(): string {
  return hashParams().get('v') || '';
}

function watchSource(): string {
  return hashParams().get('src') || 'direct';
}

/** top of the drinks list, allowing for the sticky nav */
function menuListTop(): number {
  const el = document.getElementById('menu-list');
  if (!el) return 0;
  const nav = document.querySelector('.nav')?.getBoundingClientRect().height ?? 58;
  return Math.max(el.getBoundingClientRect().top + window.scrollY - nav - 8, 0);
}

/** the landing view and the drinks list are separate places to come back to */
const viewKey = (route: Route, landing: boolean) => (landing ? 'landing' : route);
let preserveLandingPositionOnce = false;

function useRoute(): { route: Route; landing: boolean } {
  const [view, setView] = useState(() => ({ route: parseRoute(), landing: isLandingView() }));
  const positions = useRef<Record<string, number>>({});

  useEffect(() => {
    let current = viewKey(parseRoute(), isLandingView());
    const onChange = () => {
      // remember where the user left each view
      positions.current[current] = window.scrollY;
      const route = parseRoute();
      const landing = isLandingView();
      current = viewKey(route, landing);
      // the wordmark means "take me home", so always open at the top
      if (landing && !preserveLandingPositionOnce) delete positions.current.landing;
      preserveLandingPositionOnce = false;
      setView({ route, landing });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  // restore synchronously after the new page renders and before paint — racing
  // this with rAF left phones stranded in the void below the footer when a long
  // page swapped to a short one
  useLayoutEffect(() => {
    // a deep link to a drink (#/menu?q=…) is an explicit request, so it wins
    // over wherever this view was last left
    const deepLink = hashQuery() !== '';
    const remembered = deepLink ? null : positions.current[viewKey(view.route, view.landing)];
    if (remembered != null) {
      window.scrollTo({ top: remembered, behavior: 'instant' as ScrollBehavior });
      return;
    }
    // arriving fresh at #/menu (a notification, a shared link, the nav): open
    // on the drinks themselves rather than the hero
    if (view.route === 'menu' && !view.landing) {
      const jump = () => window.scrollTo({ top: menuListTop(), behavior: 'instant' as ScrollBehavior });
      jump();
      // the list is still loading on a cold open, so settle once it has height
      requestAnimationFrame(jump);
      const t = setTimeout(jump, 260);
      return () => clearTimeout(t);
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [view]);

  return view;
}

export default function App() {
  const { route, landing } = useRoute();
  const shortsActive = route === 'shorts';
  const lastNonShortsHash = useRef('#/');
  const [vibes, setVibes] = useState<Vibe[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [pantry, setPantry] = useState<Ingredient[]>([]);
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [matching, setMatching] = useState(false);
  const [barQ, setBarQ] = useState('');
  const [browse, setBrowse] = useState<Recipe[]>([]);
  const [browseQ, setBrowseQ] = useState(hashQuery);
  const [browseLimit] = useState(12);
  const [browseTotal, setBrowseTotal] = useState(0);
  const [browseHasMore, setBrowseHasMore] = useState(false);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [browseError, setBrowseError] = useState(false);
  const [browseAppending, setBrowseAppending] = useState(false);
  const [browseAppendError, setBrowseAppendError] = useState(false);
  const browseControllerRef = useRef<AbortController | null>(null);
  const browseRequestIdRef = useRef(0);
  const [aiDrinks, setAiDrinks] = useState<Recipe[]>([]);
  const [keptRecipes, setKeptRecipes] = useState<Recipe[]>([]);
  const [browseFilter, setBrowseFilter] = useState<BrowseFilter>({ kind: 'all' });
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [video, setVideo] = useState<Recipe | null>(null);
  const videoOpenerRef = useRef<HTMLElement | null>(null);
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
  const [lovedRefresh, setLovedRefresh] = useState(0);
  const [inventMood, setInventMood] = useState('');
  const [barFiltersExpanded, setBarFiltersExpanded] = useState(false);
  const [barVisible, setBarVisible] = useState(12);
  const barMatchRequestIdRef = useRef(0);
  const [dailyForced, setDailyForced] = useState(wantsDaily);
  const [theme, setTheme] = useState<Theme>(() => currentTheme());
  // Most Loved is the only browse view whose ordering depends on likes. Keep
  // a stable null dependency for every other view so a background likes
  // refresh never clears/reorders the normal menu mid-scroll.
  const lovedLikes = loved ? likes : null;

  const vibeOf = useCallback(
    (id: VibeId) => vibes.find((v) => v.id === id) ?? FALLBACK_VIBE,
    [vibes]
  );

  const openVideo = useCallback((recipe: Recipe) => {
    if (!overlayGate.acquire(VIDEO_MODAL_GATE_ID, OVERLAY_PRIORITY.recipeVideo)) return;
    videoOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setVideo(recipe);
  }, []);

  const closeVideo = useCallback(() => {
    setVideo(null);
    overlayGate.release(VIDEO_MODAL_GATE_ID);
    window.requestAnimationFrame(() => videoOpenerRef.current?.focus());
  }, []);

  useEffect(() => {
    // Vibes and the immutable catalogue are bundled locally. Keep the API
    // call as a compatibility fallback for an older/stale build, but do not
    // make first paint wait for a sleeping Render service.
    loadLocalCatalogue()
      .then((bundle) => setVibes(bundle.vibes))
      .catch(() => fetchVibes().then(setVibes).catch(() => {}));
    fetchHealth().then(setHealth).catch(() => {});
    fetchLikes().then(setLikes).catch(() => {});
    // Kept AI specials are dynamic extensions to the local catalogue. Fetch
    // them opportunistically; a store outage must never hide the 691 audited
    // recipes that are already available offline.
    fetchKeptRecipes().then((recipes) => {
      if (Array.isArray(recipes)) setKeptRecipes(recipes);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      persistTheme(next);
      applyTheme(next);
      return next;
    });
  }, []);

  // a tapped nudge lands on #/menu?q=<drink>; if the app was already open,
  // pick the drink up from the new hash too
  useEffect(() => {
    const onHash = () => {
      const q = hashQuery();
      if (q) setBrowseQ(q);
      if (wantsDaily()) setDailyForced(true);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // The legacy drawer (desktop/compact breakpoint) owns body locking. Shorts
  // uses its own fixed viewport surface and must not mutate document overflow:
  // iOS PWAs otherwise detach the fixed navigation from the visual viewport.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    document.body.style.overscrollBehavior = menuOpen ? 'none' : '';
    return () => {
      document.body.style.overflow = '';
      document.body.style.overscrollBehavior = '';
    };
  }, [menuOpen]);

  // Route-aware styling is kept on the root so the portalled mobile
  // navigation can react without relying on a transformed `.site` ancestor.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.route = route;
    return () => {
      if (root.dataset.route === route) delete root.dataset.route;
    };
  }, [route]);

  // Remember where an in-app Shorts visit began. Direct deep links have no
  // prior PubCrawl screen, so BACK safely falls home instead of leaving the app.
  useEffect(() => {
    let previousHash = window.location.hash || '#/';
    let previousWasShorts = parseRoute() === 'shorts';
    if (!previousWasShorts) lastNonShortsHash.current = previousHash;
    const remember = () => {
      const nextHash = window.location.hash || '#/';
      const nextIsShorts = parseRoute() === 'shorts';
      if (nextIsShorts && !previousWasShorts) {
        lastNonShortsHash.current = previousHash;
      }
      previousHash = nextHash;
      previousWasShorts = nextIsShorts;
    };
    window.addEventListener('hashchange', remember);
    return () => window.removeEventListener('hashchange', remember);
  }, []);

  const leaveShorts = useCallback(() => {
    const target = lastNonShortsHash.current || '#/';
    // A bare-hash landing navigation normally means the wordmark and opens at
    // the top. BACK is different: keep the landing position remembered by the
    // route hook for this one transition.
    preserveLandingPositionOnce = target === '#/' || target === '#' || target === '';
    window.location.hash = target;
  }, []);

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

  // A machine-drafted drink lives only in memory until the drinker keeps it
  // (likes / tabs / shares). Keeping persists it to the menu with a stable id
  // and swaps that id into every place the ephemeral one appears.
  const keepDrink = useCallback(async (recipe: Recipe): Promise<Recipe> => {
    const isGen = recipe.source === 'ai' || recipe.source === 'fallback';
    if (!isGen || recipe.id.startsWith('kept-')) return recipe;
    try {
      const kept = await keepRecipe(recipe);
      setAiDrinks((prev) => prev.map((d) => (d.id === recipe.id ? kept : d)));
      setKeptRecipes((prev) => {
        const withoutEphemeral = prev.filter((drink) => drink.id !== recipe.id && drink.id !== kept.id);
        return [kept, ...withoutEphemeral];
      });
      setTab((prev) => prev.map((d) => (d.id === recipe.id ? kept : d)));
      setLikedIds((prev) =>
        prev.has(recipe.id) ? new Set([...prev].map((id) => (id === recipe.id ? kept.id : id))) : prev
      );
      setLikes((prev) => (prev[recipe.id] ? { ...prev, [kept.id]: prev[recipe.id] } : prev));
      return kept;
    } catch {
      return recipe;
    }
  }, []);

  const toggleLike = useCallback(
    async (recipe: Recipe) => {
      const r = await keepDrink(recipe);
      const wasLiked = likedIds.has(r.id);
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.delete(r.id);
        else next.add(r.id);
        return next;
      });
      setLikes((prev) => ({ ...prev, [r.id]: Math.max(0, (prev[r.id] || 0) + (wasLiked ? -1 : 1)) }));
      postLike(r.id, wasLiked ? 'unlike' : 'like')
        .then((res) => setLikes((prev) => ({ ...prev, [res.id]: res.likes })))
        .catch(() => {});
      if (loved) setLovedRefresh((value) => value + 1);
    },
    [likedIds, keepDrink, loved]
  );

  /* menu search / browse. Mood + search both apply server-side over the full catalogue,
     so a mood is never silently filtering a search down to nothing. */
  useEffect(() => {
    browseControllerRef.current?.abort();
    const controller = new AbortController();
    const requestId = ++browseRequestIdRef.current;
    browseControllerRef.current = controller;
    setBrowseLoading(true);
    setBrowseError(false);
    setBrowseAppending(false);
    setBrowseAppendError(false);
    setBrowse([]);
    setBrowseTotal(0);
    setBrowseHasMore(false);
    const timer = setTimeout(() => {
      const query: Parameters<typeof fetchRecipes>[0] = {
        q: browseQ,
        limit: browseLimit,
        offset: 0,
        seed: browseSeed,
        sort: loved ? 'likes' : undefined,
        category: browseFilter.kind === 'category' ? browseFilter.id : undefined,
        collection: browseFilter.kind === 'collection' ? browseFilter.id : undefined,
        signal: controller.signal,
      };
      queryLocalRecipes({
        q: query.q,
        offset: query.offset,
        limit: query.limit,
        seed: query.seed,
        sort: query.sort,
        filter: browseFilter,
        likes: lovedLikes || undefined,
        extraRecipes: keptRecipes,
      })
        .then((page) => {
          if (controller.signal.aborted || requestId !== browseRequestIdRef.current) return;
          setBrowse(page.recipes);
          setBrowseTotal(page.total);
          setBrowseHasMore(page.hasMore);
        })
        .catch((err) => {
          if (controller.signal.aborted || requestId !== browseRequestIdRef.current || (err as Error)?.name === 'AbortError') return;
          // An old installed build may not contain the generated chunk. One
          // compatibility request keeps that build usable without reviving the
          // long free-host retry loop in the normal path.
          return fetchRecipes(query)
            .then((page) => {
              if (controller.signal.aborted || requestId !== browseRequestIdRef.current) return;
              setBrowse(page.recipes);
              setBrowseTotal(page.total);
              setBrowseHasMore(page.hasMore);
            })
            .catch((fallbackError) => {
              if (!controller.signal.aborted && requestId === browseRequestIdRef.current && (fallbackError as Error)?.name !== 'AbortError') setBrowseError(true);
            });
        })
        .finally(() => {
          if (!controller.signal.aborted && requestId === browseRequestIdRef.current) setBrowseLoading(false);
        });
    }, browseQ ? 220 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
      if (browseControllerRef.current === controller) browseControllerRef.current = null;
    };
  }, [browseQ, browseLimit, browseSeed, browseFilter, loved, lovedLikes, lovedRefresh, keptRecipes]);

  const loadMore = useCallback(() => {
    if (browseLoading || browseAppending || !browseHasMore) return;
    browseControllerRef.current?.abort();
    const controller = new AbortController();
    const requestId = ++browseRequestIdRef.current;
    browseControllerRef.current = controller;
    setBrowseAppending(true);
    setBrowseAppendError(false);
    const query: Parameters<typeof fetchRecipes>[0] = {
      q: browseQ,
      limit: browseLimit,
      offset: browse.length,
      seed: browseSeed,
      sort: loved ? 'likes' : undefined,
      category: browseFilter.kind === 'category' ? browseFilter.id : undefined,
      collection: browseFilter.kind === 'collection' ? browseFilter.id : undefined,
      signal: controller.signal,
    };
    queryLocalRecipes({
      q: query.q,
      offset: query.offset,
      limit: query.limit,
      seed: query.seed,
      sort: query.sort,
      filter: browseFilter,
      likes,
      extraRecipes: keptRecipes,
    })
      .then((page) => {
        if (controller.signal.aborted || requestId !== browseRequestIdRef.current) return;
        setBrowse((prev) => {
          const ids = new Set(prev.map((recipe) => recipe.id));
          return [...prev, ...page.recipes.filter((recipe) => !ids.has(recipe.id))];
        });
        setBrowseTotal(page.total);
        setBrowseHasMore(page.hasMore);
      })
      .catch((err) => {
        if (controller.signal.aborted || requestId !== browseRequestIdRef.current || (err as Error)?.name === 'AbortError') return;
        return fetchRecipes(query)
          .then((page) => {
            if (controller.signal.aborted || requestId !== browseRequestIdRef.current) return;
            setBrowse((prev) => {
              const ids = new Set(prev.map((recipe) => recipe.id));
              return [...prev, ...page.recipes.filter((recipe) => !ids.has(recipe.id))];
            });
            setBrowseTotal(page.total);
            setBrowseHasMore(page.hasMore);
          })
          .catch((fallbackError) => {
            if (!controller.signal.aborted && requestId === browseRequestIdRef.current && (fallbackError as Error)?.name !== 'AbortError') setBrowseAppendError(true);
          });
      })
      .finally(() => {
        if (!controller.signal.aborted && requestId === browseRequestIdRef.current) setBrowseAppending(false);
      });
  }, [browse, browseAppending, browseFilter, browseLoading, browseHasMore, browseQ, browseLimit, browseSeed, loved, likes, keptRecipes]);

  /* fresh random dozen */
  const surpriseMe = () => {
    setBrowseQ('');
    setLoved(false);
    setBrowseSeed(String(Math.random()));
  };

  const barFilter: BrowseFilter =
    inventMood === 'indian'
      ? { kind: 'collection', id: 'india' }
      : inventMood === 'house'
        ? { kind: 'collection', id: 'house' }
        : inventMood
          ? { kind: 'category', id: inventMood as VibeId }
          : { kind: 'all' };

  /* shelf matching */
  useEffect(() => {
    const requestId = ++barMatchRequestIdRef.current;
    if (!pantry.length) {
      setMatch(null);
      setMatching(false);
      setBarFiltersExpanded(false);
      return;
    }
    setMatching(true);
    const t = setTimeout(() => {
      matchLocalRecipes({ pantry: pantry.map((p) => p.name), q: barQ, filter: barFilter, extraRecipes: keptRecipes })
        .then((recipes) => {
          if (requestId !== barMatchRequestIdRef.current) return;
          setMatch({
            canMake: recipes.filter((recipe) => recipe.missingCount === 0),
            almost: recipes.filter((recipe) => recipe.missingCount > 0),
          });
        })
        .catch(() => matchRecipes(pantry.map((p) => p.name), barQ, barFilter)
          .then((next) => {
            if (requestId === barMatchRequestIdRef.current) setMatch(next);
          })
          .catch(() => {}))
        .finally(() => {
          if (requestId === barMatchRequestIdRef.current) setMatching(false);
        });
    }, 150);
    return () => clearTimeout(t);
  }, [pantry, barQ, inventMood, keptRecipes]);

  const addIngredient = useCallback((ing: Ingredient) => {
    setPantry((prev) =>
      prev.some((p) => p.name.toLowerCase() === ing.name.toLowerCase()) ? prev : [...prev, ing]
    );
  }, []);
  const addAll = useCallback((ings: Ingredient[]) => ings.forEach(addIngredient), [addIngredient]);
  const removeIngredient = (name: string) => setPantry((prev) => prev.filter((p) => p.name !== name));

  const toggleTab = useCallback(
    async (recipe: Recipe) => {
      if (tab.some((r) => r.id === recipe.id)) {
        setTab((prev) => prev.filter((r) => r.id !== recipe.id));
        return;
      }
      const r = await keepDrink(recipe);
      setTab((prev) => (prev.some((x) => x.id === r.id) ? prev : [...prev, r]));
    },
    [tab, keepDrink]
  );
  const tabIds = useMemo(() => new Set(tab.map((r) => r.id)), [tab]);

  async function invent() {
    if (!pantry.length || generating) return;
    setGenerating(true);
    setGenError('');
    try {
      const drink = await generateRecipe(
        pantry.map((p) => p.name),
        inventMood || undefined,
        aiDrinks.map((d) => `${d.name} (${d.ingredients.slice(0, 3).map((i) => i.name).join(', ')})`),
        tab.slice(-6).map((r) => `${r.name}: ${r.ingredients.slice(0, 4).map((i) => i.name).join(', ')}`)
      );
      setAiDrinks((prev) => [drink, ...prev].slice(0, 6));
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        const cardElement = document.querySelector<HTMLElement>(`[data-recipe-id="${CSS.escape(drink.id)}"]`);
        if (!cardElement) return;
        const bounds = cardElement.getBoundingClientRect();
        if (bounds.top < 0 || bounds.bottom > window.innerHeight) cardElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        cardElement.querySelector<HTMLElement>('[data-recipe-heading]')?.focus({ preventScroll: true });
      }));
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'That did not work. Try again.');
    } finally {
      setGenerating(false);
    }
  }

  const featured = browse;
  // freshly drafted specials always show, whatever mood is selected — they were
  // just made for this drinker, so filtering them out felt like they vanished
  const inventions = aiDrinks;
  const barResults = useMemo(() => {
    const seen = new Set<string>();
    // The local matcher applies filters atomically. Do not filter the old
    // result set again while its replacement is still being calculated.
    return [...inventions, ...(match?.canMake ?? []), ...(match?.almost ?? [])].filter((recipe) => {
      if (seen.has(recipe.id)) return false;
      seen.add(recipe.id);
      return true;
    });
  }, [inventions, match]);
  useEffect(() => {
    setBarVisible(12);
  }, [pantry, barQ, inventMood]);
  const hasPantry = pantry.length > 0;
  // the landing view is 'home', so no nav item is lit until you're in a section
  const active = landing ? null : route;
  const helpTour: TourId = landing ? 'landing' : route;
  const moreLeft = browseHasMore;

  const onBarFilter = useCallback((value: BrowseFilter) => {
    setInventMood(value.kind === 'all' ? '' : value.id);
  }, []);
  const browseContext = browseFilter.kind === 'category'
    ? vibes.find((v) => v.id === browseFilter.id)?.label.toUpperCase()
    : browseFilter.kind === 'collection'
      ? browseFilter.id === 'india' ? 'INDIA' : 'HOUSE SPECIALS'
      : loved ? 'MOST LOVED' : browseQ ? `“${browseQ.toUpperCase()}”` : '';
  const browseNote = `SHOWING ${featured.length} OF ${browseTotal}${browseContext ? ` · ${browseContext}` : ''}`;

  const card = (r: Recipe, i: number, removeMode = false, tourActions?: string) => (
    <RecipeCard
      key={r.id}
      recipe={r}
      vibe={vibeOf(r.vibe)}
      index={i}
      onVideo={openVideo}
      onToggleTab={toggleTab}
      inTab={tabIds.has(r.id)}
      removeMode={removeMode}
      likes={likes[r.id] || 0}
      liked={likedIds.has(r.id)}
      onToggleLike={toggleLike}
      onKeep={keepDrink}
      tourActions={tourActions}
    />
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className={`site ${shortsActive ? 'shorts-active' : ''}`}>
        <SketchDefs />
        {!shortsActive && <DailyQuestion force={dailyForced} />}
        {!shortsActive && <InstallBanner />}
        {!shortsActive && <NudgePrompt />}
        <GuidedTour id="landing" active={landing} />
        <GuidedTour id="menu" active={route === 'menu' && !landing} />
        <GuidedTour id="bar" active={route === 'bar'} />
        <GuidedTour id="basics" active={route === 'basics'} />
        <GuidedTour id="tab" active={route === 'tab'} />
        <GuidedTour id="quiz" active={route === 'quiz'} />
        <GuidedTour id="watch" active={route === 'watch'} />
        <GuidedTour id="shorts" active={route === 'shorts'} />

        {/* ================= nav ================= */}
        <header className="nav">
          <a className="brand" href="#/">
            <PubGlyph size={30} />
            <span className="wordmark">The PubCrawl</span>
          </a>
          <nav className="nav-links" aria-label="Pages">
            {NAV.map((n) => (
              <a
                key={n.route}
                href={n.route === 'shorts' ? '#/shorts?src=nav' : n.route === 'watch' ? '#/watch?src=nav' : `#/${n.route}`}
                className={`nav-link ${active === n.route ? 'active' : ''}`}
                aria-current={active === n.route ? 'page' : undefined}
              >
                {n.label}
                {n.route === 'tab' && tab.length > 0 ? ` (${tab.length})` : ''}
              </a>
            ))}
          </nav>
          <button
            className="desktop-theme-toggle text-btn header-icon-action"
            type="button"
            onClick={toggleTheme}
            aria-pressed={theme === 'dark'}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            data-tip={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            <Sun size={20} />
          </button>
          <ContextualHelp tour={helpTour} className="desktop-help-action" />
          <span className="nav-status k-label dim">
            {health ? `${health.cocktails} DRINKS ON TAP` : '…'}
          </span>
          <a className="nav-make k-label" href="#/bar">
            WHAT CAN I MAKE?
          </a>
          <button className="nav-menu-btn" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Burger size={22} />
          </button>
          <MobileTopActions
            active={active}
            theme={theme}
            onToggleTheme={toggleTheme}
            tabCount={tab.length}
            helpTour={helpTour}
          />
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
                    href={n.route === 'shorts' ? '#/shorts?src=nav' : n.route === 'watch' ? '#/watch?src=nav' : `#/${n.route}`}
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

        <MobileNavigation active={active} tabCount={tab.length} theme={theme} onToggleTheme={toggleTheme} />

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
                      <div className="hero-cta">
                        <a className="btn btn-solid" href="#/bar" data-tour="landing-make">
                          WHAT CAN I MAKE? <ArrowRight size={14} />
                        </a>
                        <button
                          className="btn"
                          data-tour="landing-browse"
                          onClick={() => document.querySelector('#menu-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                        >
                          BROWSE ALL DRINKS <ArrowDown size={14} />
                        </button>
                      </div>
                    </Reveal>
                    <ol className="hero-steps" aria-label="How it works" data-tour="landing-steps">
                      <li>
                        <span className="k-label dim">01</span>
                        <strong>Add your ingredients</strong>
                        <span>Type them, or snap a photo of your shelf.</span>
                      </li>
                      <li>
                        <span className="k-label dim">02</span>
                        <strong>See what you can pour</strong>
                        <span>Real drinks you can make tonight.</span>
                      </li>
                      <li>
                        <span className="k-label dim">03</span>
                        <strong>Save it or invent one</strong>
                        <span>Keep a menu for the night, or let the bar invent something new.</span>
                      </li>
                    </ol>
                  </div>
                  <BarTalk />
                </section>

                <section className="sec" id="menu-list">
                  <SectionHead
                    index="01"
                    title="MENU"
                    note={browseNote}
                    loading={browseLoading}
                  />
                  <div className="field menu-search" data-tour="menu-controls">
                    <input
                      value={browseQ}
                      onChange={(e) => setBrowseQ(e.target.value)}
                      placeholder="SEARCH… PICANTE, REGIONAL, TIER 1, COUPE"
                      aria-label="Search menu by name, ingredient, lane, access tier, glass, place, mood or method"
                    />
                  </div>
                  <div className="bar-controls">
                    <CategoryFilter
                      value={browseFilter}
                      vibes={vibes}
                      includeIndia
                      includeHouse
                      onChange={setBrowseFilter}
                      label="Filter menu by category or collection"
                    />
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
                      <p className="k-label dim">LOADING THE LOCAL MENU…</p>
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
                      <p className="k-label dim">TRY “REGIONAL”, “TIER 1”, “HIGHBALL” OR “RUM”, OR CLEAR THE MOOD FILTER.</p>
                    </div>
                  ) : (
                    <>
                      <div className={`grid ${browseLoading ? 'is-loading' : ''}`} data-tour="menu-grid">
                        {featured.map((r, i) => card(r, i, false, i === 0 ? 'menu-card-actions' : undefined))}
                      </div>
                      {moreLeft && !browseLoading && (
                        <div className="more-row">
                          <button className="btn" onClick={loadMore} disabled={browseAppending}>
                            {browseAppending ? 'LOADING…' : browseAppendError ? 'RETRY' : 'SHOW MORE'} {!browseAppending && <ArrowDown size={14} />}
                          </button>
                          <span className="k-label dim">
                            {browse.length} OF {browseTotal} ON SHOW
                          </span>
                          {browseAppendError && <span className="k-label err-inline" role="status">LOAD FAILED — TRY AGAIN</span>}
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
                  <SectionHead
                    index="01"
                    title="SHELF"
                    note=""
                  />
                  <div className="shelf-grid" data-tour="shelf-entry">
                    <div className="shelf-col">
                      <span className="k-label field-label">WHAT HAVE YOU GOT?</span>
                      <Typeahead onAdd={addIngredient} />
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

                {hasPantry && <section className="sec" id="pour" aria-busy={matching}>
                  <SectionHead
                    index="02"
                    title="DRINKS FOR YOUR SHELF"
                    note={`${barResults.length} MATCHES`}
                    loading={matching}
                  />
                  <div className="shelf-results-head">
                    <button
                      type="button"
                      className="btn btn-solid"
                      data-tour="invent-drink"
                      onClick={invent}
                      disabled={generating}
                    >
                      {generating ? 'INVENTING…' : 'INVENT A DRINK'} <ArrowRight size={14} />
                    </button>
                  </div>
                  {genError && <p className="err" role="alert">{genError}</p>}
                    <>
                      <button
                        type="button"
                        className="text-btn shelf-filter-toggle"
                        aria-expanded={barFiltersExpanded}
                        aria-controls="bar-result-filters"
                        onClick={() => setBarFiltersExpanded((expanded) => !expanded)}
                      >
                        {barFiltersExpanded ? 'HIDE FILTERS' : 'FILTER RESULTS'} <ArrowDown size={12} />
                      </button>
                      {barFiltersExpanded && (
                        <div id="bar-result-filters" className="shelf-filters" role="region" aria-label="Filter shelf results">
                          <div className="bar-controls">
                            <CategoryFilter
                              value={barFilter}
                              vibes={vibes}
                              includeIndia
                              includeHouse={false}
                              onChange={onBarFilter}
                              label="Filter your pours by category or collection"
                            />
                          </div>
                          <div className="field menu-search">
                            <input
                              value={barQ}
                              onChange={(e) => setBarQ(e.target.value)}
                              placeholder="SEARCH YOUR SHELF… HIGHBALL, TIER 1, REGIONAL"
                              aria-label="Search matched drinks by name, ingredient, lane, access, glass or style"
                            />
                          </div>
                        </div>
                      )}
                      {barResults.length > 0 ? (
                        <ShelfResults
                          recipes={barResults}
                          visible={barVisible}
                          matching={matching}
                          onLoadMore={() => setBarVisible((visible) => Math.min(visible + 12, barResults.length))}
                          renderCard={card}
                        />
                      ) : (
                        !matching && (
                          <div className="shelf-no-matches" role="status">
                            <p className="k-label">NO MATCHES</p>
                            <p>Add another ingredient or change your filters</p>
                          </div>
                        )
                      )}
                    </>
                </section>}
              </>
            </div>

            <div hidden={route !== 'basics'}>
              <section className="sec page-top" id="basics">
                <SectionHead index="01" title="BAR BASICS" note="EVERYTHING WORTH KNOWING, NO SNOBBERY" />
                <BarTalk />
                <Reveal>
                  <Knowledge />
                </Reveal>
              </section>
            </div>

            <div hidden={route !== 'quiz'}>
              <section className="sec page-top" id="quiz-page">
                <SectionHead
                  index="01"
                  title="PUB QUIZ"
                  note="ONE POINT A CORRECT ANSWER"
                />
                {route === 'quiz' && <Quiz />}
              </section>
            </div>

            <div hidden={route !== 'watch'}>
              <Watch active={route === 'watch'} initialId={watchVideoId()} source={watchSource()} />
            </div>

            <div className="shorts-route" hidden={route !== 'shorts'}>
              <Shorts
                active={shortsActive}
                initialId={shortVideoId()}
                source={shortsSource()}
                onBack={leaveShorts}
              />
            </div>

            <div hidden={route !== 'tab'}>
              <section className="sec page-top" id="tab-page">
                <SectionHead
                  index="01"
                  title="TAB"
                  note={tab.length ? `${tab.length} ON YOUR TAB TONIGHT` : 'YOUR MENU FOR THE NIGHT'}
                />
                <BarTalk />
                <div data-tour="tab-lineup">
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
                      <div className="tab-head-actions" data-tour="tab-actions">
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
                    <div className="grid" data-tour="tab-cards">{tab.map((r, i) => card(r, i, true))}</div>
                  </>
                )}
                </div>
              </section>
            </div>
        </main>

        {/* ================= footer ================= */}
        {!shortsActive && (
          <footer className="foot">
            <Lines as="p" className="foot-big" lines={['POUR SOMETHING', 'PROPER.']} stagger={0.08} />
            <div className="foot-nudge">
              <NudgeToggle />
            </div>
            <div className="foot-meta">
              <span className="k-label">RECIPES FROM THECOCKTAILDB</span>
              <span className="k-label">HOUSE SPECIALS MAY BE ORIGINAL OR ROBOT-MADE. TASTE BEFORE SERVING.</span>
              <span className="k-label">THE PUBCRAWL © 2026</span>
            </div>
          </footer>
        )}

        {/* ================= video modal ================= */}
        <AnimatePresence>
          {video && <VideoModal recipe={video} onClose={closeVideo} />}
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
  lead,
  sub = false,
  loading = false,
}: {
  index: string;
  title: string;
  note: string;
  lead?: string;
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
        {note && <span className="k-label dim sec-note">{note}</span>}
      </div>
      {lead && <p className="sec-lead">{lead}</p>}
      {loading && <span className="loadline" aria-label="Loading" />}
    </div>
  );
}

/* ---------- video modal ---------- */
function VideoModal({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const id = recipe.video.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/)?.[1];
  const src = id ? `https://www.youtube.com/embed/${id}?autoplay=1` : '';
  const videoLabel = 'WATCH IT MADE';
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const restoreInert = setBackgroundInert(true, '.modal-backdrop');
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button, a, iframe, [tabindex]:not([tabindex="-1"])') || []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      restoreInert();
      overlayGate.release(VIDEO_MODAL_GATE_ID);
    };
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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${recipe.name} video`}
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 26, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 18, opacity: 0 }}
        transition={{ duration: 0.34, ease: EASE }}
      >
        <div className="modal-head">
          <span className="k-label">{videoLabel}: {recipe.name.toUpperCase()}</span>
          <button ref={closeRef} className="text-btn" onClick={onClose}>
            CLOSE <X size={12} />
          </button>
        </div>
        {src ? (
          <iframe
            src={src}
            title={recipe.name}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="modal-empty" role="status">NO VERIFIED VIDEO AVAILABLE.</div>
        )}
      </motion.div>
    </motion.div>
  );
}

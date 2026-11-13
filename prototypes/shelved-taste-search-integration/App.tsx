import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { fetchHealth, fetchKeptRecipes, fetchLikes, fetchRecipes, fetchVibes, generateRecipe, keepRecipe, matchRecipes, postLike } from './api';
import type { BrowseFilter, Health, Ingredient, MatchResult, Recipe, ShortVideo, Theme, TourId, Vibe, VibeId } from './types';
import { Typeahead } from './components/Typeahead';
import { UploadZone } from './components/UploadZone';
import { RecipeCard } from './components/RecipeCard';
import { RecipeFocus } from './components/RecipeFocus';
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
import { SiteNavigation } from './components/SiteNavigation';
import { ScrollToTop } from './components/ScrollToTop';
import { TasteFinder } from './components/TasteFinder';
import { hasTasteProfile, mappedRecipeMatches, offersTartIntent, TASTE_PROFILES } from './tasteProfiles';
import type { TasteContext } from './tasteProfiles';
import { DailyQuestion } from './components/DailyQuestion';
import { GuidedTour } from './components/GuidedTour';
import { LandingPage } from './components/LandingPage';
import { ShelfResults } from './components/ShelfResults';
import { EASE, Lines, LOADED_HIDDEN, Reveal } from './motion';
import { ArrowDown, ArrowRight, Check, Heart, Share, Shuffle, SketchDefs, X } from './icons';
import { shareContent, tabShareText } from './share';
import { applyTheme, currentTheme, persistTheme, readStoredTheme, systemTheme, clearStoredTheme } from './theme';
import { loadLocalCatalogue, matchLocalRecipes, queryLocalRecipes } from './localData';
import type { Route } from './navigation';
import { OVERLAY_PRIORITY, overlayGate, setBackgroundInert } from './overlayGate';
import { selectLandingShorts } from './landingPreviewPolicy';
import { SHORTS_SEED } from './shortsData';
import { parseBrowseFilter, serializeBrowseFilter } from './filter';
import { useRecipeFocus } from './useRecipeFocus';
import './App.css';
import './components/landing/landing.css';
import './house-standard.css';

const BarAtlas = lazy(() => import('./components/atlas/BarAtlas'));

const FALLBACK_VIBE: Vibe = { id: 'boozy', label: 'Spirit-Forward', color: '#8A5A24' };
const VIDEO_MODAL_GATE_ID = 'recipe-video';

const ROUTES: Route[] = ['menu', 'bar', 'basics', 'tab', 'quiz', 'watch', 'shorts', 'atlas'];
/** the path part of the hash, without the query: '' | 'menu' | 'bar' | … */
function hashPath(): string {
  return window.location.hash.replace(/^#\/?/, '').split('?')[0];
}

function parseRoute(): Route {
  const h = hashPath() as Route;
  return ROUTES.includes(h) ? h : 'menu';
}

/**
 * A bare URL (or the wordmark) opens the landing view, while #/menu opens the
 * separately rendered catalogue without mounting Menu beneath the hero.
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

function hashBrowseFilter(): BrowseFilter {
  return parseBrowseFilter(hashParams().get('filter') || '');
}

function hashTasteContext(): TasteContext | null {
  const params = hashParams();
  if (params.get('view') !== 'map') return null;
  const anchorId = params.get('near') || '';
  if (hasTasteProfile(anchorId)) return { kind: 'related', anchorId };
  if (params.get('from') === 'shelf') return { kind: 'shelf' };
  const flavour = params.get('taste');
  if (flavour === 'tart' || flavour === 'bitter') return { kind: 'flavour', flavour };
  return { kind: params.get('scope') !== 'all' && (params.has('q') || params.has('filter')) ? 'matches' : 'all' };
}

function menuHash(query: string, filter: BrowseFilter, taste?: TasteContext): string {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query);
  if (filter.kind !== 'all') params.set('filter', serializeBrowseFilter(filter));
  if (taste) {
    params.set('view', 'map');
    if (taste.kind === 'related') params.set('near', taste.anchorId);
    if (taste.kind === 'shelf') params.set('from', 'shelf');
    if (taste.kind === 'flavour') params.set('taste', taste.flavour);
    if (taste.kind === 'all') params.set('scope', 'all');
  }
  const value = params.toString();
  return `#/menu${value ? `?${value}` : ''}`;
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

interface HomeVisit {
  id: string;
  shorts: ShortVideo[];
}

interface RoutedView {
  route: Route;
  landing: boolean;
  homeVisit: HomeVisit | null;
}

type HomeIntent = { kind: 'fresh' } | { kind: 'restore'; id: string };

const HOME_HISTORY_KEY = '__pubcrawlHomeVisit';
const randomToken = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

function homeHistoryId(sessionId: string): string | null {
  const value = window.history.state?.[HOME_HISTORY_KEY];
  return value && value.sessionId === sessionId && typeof value.id === 'string' ? value.id : null;
}

function writeHomeHistory(sessionId: string, id: string) {
  const state = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
  window.history.replaceState({ ...state, [HOME_HISTORY_KEY]: { sessionId, id } }, '', window.location.href);
}

/** Home has explicit visit identity so Back can restore discovery without making it permanent history. */
function useRoute(): RoutedView & {
  beginFreshHome: () => boolean;
  restoreLastHomeOnNextEntry: () => void;
} {
  const sessionId = useRef(randomToken());
  const visitSerial = useRef(0);
  const visits = useRef(new Map<string, HomeVisit>());
  const intent = useRef<HomeIntent | null>(null);
  const lastHomeId = useRef<string | null>(null);
  const positions = useRef<Record<string, number>>({});

  const createVisit = useCallback((id = `${sessionId.current}:${++visitSerial.current}`): HomeVisit => {
    const existing = visits.current.get(id);
    if (existing) return existing;
    const visit = { id, shorts: selectLandingShorts(SHORTS_SEED) };
    visits.current.set(id, visit);
    return visit;
  }, []);

  const [view, setView] = useState<RoutedView>(() => {
    const landing = isLandingView();
    const homeVisit = landing ? createVisit() : null;
    if (homeVisit) lastHomeId.current = homeVisit.id;
    return { route: parseRoute(), landing, homeVisit };
  });
  const viewRef = useRef(view);
  viewRef.current = view;

  const keyFor = useCallback((value: RoutedView) => value.landing && value.homeVisit
    ? `landing:${value.homeVisit.id}`
    : value.route, []);

  const commitView = useCallback((next: RoutedView) => {
    viewRef.current = next;
    if (next.homeVisit) lastHomeId.current = next.homeVisit.id;
    setView(next);
  }, []);

  useEffect(() => {
    const onChange = () => {
      positions.current[keyFor(viewRef.current)] = window.scrollY;
      const route = parseRoute();
      const landing = isLandingView();
      let homeVisit: HomeVisit | null = null;
      if (landing) {
        const requested = intent.current;
        const remembered = requested?.kind === 'restore'
          ? requested.id
          : requested?.kind === 'fresh'
            ? null
            : homeHistoryId(sessionId.current);
        homeVisit = createVisit(remembered ?? undefined);
        writeHomeHistory(sessionId.current, homeVisit.id);
      }
      intent.current = null;
      commitView({ route, landing, homeVisit });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, [commitView, createVisit, keyFor]);

  useLayoutEffect(() => {
    if (view.landing && view.homeVisit) writeHomeHistory(sessionId.current, view.homeVisit.id);
  }, []);

  // restore synchronously after the new page renders and before paint — racing
  // this with rAF left phones stranded in the void below the footer when a long
  // page swapped to a short one
  useLayoutEffect(() => {
    // a deep link to a drink (#/menu?q=…) is an explicit request, so it wins
    // over wherever this view was last left
    const deepLink = hashQuery() !== '' || hashParams().has('filter');
    const remembered = deepLink ? null : positions.current[keyFor(view)];
    if (remembered != null) {
      window.scrollTo({ top: remembered, behavior: 'instant' as ScrollBehavior });
      return;
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [keyFor, view]);

  const beginFreshHome = useCallback(() => {
    intent.current = { kind: 'fresh' };
    if (!viewRef.current.landing) return false;
    positions.current[keyFor(viewRef.current)] = window.scrollY;
    const homeVisit = createVisit();
    writeHomeHistory(sessionId.current, homeVisit.id);
    intent.current = null;
    commitView({ route: 'menu', landing: true, homeVisit });
    return true;
  }, [commitView, createVisit, keyFor]);

  const restoreLastHomeOnNextEntry = useCallback(() => {
    intent.current = lastHomeId.current ? { kind: 'restore', id: lastHomeId.current } : { kind: 'fresh' };
  }, []);

  return { ...view, beginFreshHome, restoreLastHomeOnNextEntry };
}

export default function App() {
  const { route, landing, homeVisit, beginFreshHome, restoreLastHomeOnNextEntry } = useRoute();
  const retainedHomeVisit = useRef<HomeVisit | null>(homeVisit);
  if (homeVisit) retainedHomeVisit.current = homeVisit;
  const shortsActive = route === 'shorts';
  const lastNonShortsHash = useRef('#/');
  const [vibes, setVibes] = useState<Vibe[]>([]);
  const [catalogueRecipes, setCatalogueRecipes] = useState<Recipe[]>([]);
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
  const [atlasActivated, setAtlasActivated] = useState(() => route === 'atlas');
  useEffect(() => { if (route === 'atlas') setAtlasActivated(true); }, [route]);
  const [menuActivated, setMenuActivated] = useState(() => route === 'menu' && !landing);
  const browseControllerRef = useRef<AbortController | null>(null);
  const browseRequestIdRef = useRef(0);
  const [aiDrinks, setAiDrinks] = useState<Recipe[]>([]);
  const [keptRecipes, setKeptRecipes] = useState<Recipe[]>([]);
  const [browseFilter, setBrowseFilter] = useState<BrowseFilter>(hashBrowseFilter);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [video, setVideo] = useState<Recipe | null>(null);
  const videoOpenerRef = useRef<HTMLElement | null>(null);
  const [browseView, setBrowseView] = useState<'map' | 'list'>(() => hashTasteContext() ? 'map' : 'list');
  const [tasteContext, setTasteContext] = useState<TasteContext>(() => hashTasteContext() || { kind: 'all' });
  const [tasteSelectedId, setTasteSelectedId] = useState<string | null>(() => {
    const context = hashTasteContext();
    return context?.kind === 'related' ? context.anchorId : null;
  });
  const [tasteRequest, setTasteRequest] = useState({ id: 0, focus: 'map' as 'map' | 'preview' });
  const tasteContextRef = useRef(tasteContext);
  tasteContextRef.current = tasteContext;
  const browseViewRef = useRef(browseView);
  browseViewRef.current = browseView;
  const menuWasActive = useRef(route === 'menu' && !landing);
  const lastMenuHash = useRef(window.location.hash);
  const menuReturn = useRef<{ hash: string; scroll: number } | null>(null);
  const recipeListReturn = useRef<{ scroll: number; trigger: HTMLElement | null } | null>(null);
  const [refineOpen, setRefineOpen] = useState(false);
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
  const [themePreference, setThemePreference] = useState<Theme | 'system'>(() => readStoredTheme() || 'system');
  const recipeFocus = useRecipeFocus();
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
    fetchHealth().then(setHealth).catch(() => {});
    fetchLikes().then(setLikes).catch(() => {});
    // Kept AI specials are dynamic extensions to the local catalogue. Fetch
    // them opportunistically; a store outage must never hide the 691 audited
    // recipes that are already available offline.
    fetchKeptRecipes().then((recipes) => {
      if (Array.isArray(recipes)) setKeptRecipes(recipes);
    }).catch(() => {});
  }, []);

  const catalogueRequestedRef = useRef(false);
  useEffect(() => {
    if (catalogueRequestedRef.current || landing || !['menu', 'bar', 'tab'].includes(route)) return;
    catalogueRequestedRef.current = true;
    // Vibes and the immutable catalogue remain local-first, but Home no
    // longer pulls the full recipe chunk merely to render discovery cards.
    loadLocalCatalogue()
      .then((bundle) => { setVibes(bundle.vibes); setCatalogueRecipes(bundle.recipes); })
      .catch(() => fetchVibes().then(setVibes).catch(() => {}));
  }, [landing, route]);

  useEffect(() => {
    if (route === 'menu' && !landing) setMenuActivated(true);
  }, [landing, route]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const changeTheme = useCallback((preference: Theme | 'system') => {
    setThemePreference(preference);
    if (preference === 'system') clearStoredTheme();
    else persistTheme(preference);
    const next = preference === 'system' ? systemTheme() : preference;
    applyTheme(next);
    setTheme(next);
  }, []);
  const toggleTheme = useCallback(() => changeTheme(theme === 'dark' ? 'light' : 'dark'), [theme, changeTheme]);
  useEffect(() => {
    if (themePreference !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => { const next = media.matches ? 'dark' : 'light'; applyTheme(next); setTheme(next); };
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [themePreference]);

  // a tapped nudge lands on #/menu?q=<drink>; if the app was already open,
  // pick the drink up from the new hash too
  useEffect(() => {
    const onHash = () => {
      const menuNow = parseRoute() === 'menu' && !isLandingView();
      const restoringMenu = menuNow && !menuWasActive.current;
      if (menuWasActive.current && !menuNow) menuReturn.current = { hash: lastMenuHash.current, scroll: window.scrollY };
      menuWasActive.current = menuNow;
      if (menuNow) {
        const params = hashParams();
        // A parameterized menu URL is an explicit discovery request and owns
        // the complete browse state. A bare #/menu remains the user's way
        // back to the Menu they already arranged, including its search.
        if (params.has('q') || params.has('filter') || params.has('view')) {
          const q = params.get('q') || '';
          const taste = hashTasteContext();
          const returningToResults = !taste && browseViewRef.current === 'map' && recipeListReturn.current;
          setBrowseView(taste ? 'map' : 'list');
          if (taste) {
            const previous = tasteContextRef.current;
            setTasteContext(taste);
            // Returning to the same collection restores its chosen neighbour,
            // page and scroll position rather than reselecting the anchor.
            if (taste.kind === 'related' && (previous.kind !== 'related' || previous.anchorId !== taste.anchorId)) setTasteSelectedId(taste.anchorId);
          }
          const rawFilter = params.get('filter') || '';
          const filter = parseBrowseFilter(rawFilter);
          setBrowseQ(q);
          setBrowseFilter((current) => serializeBrowseFilter(current) === serializeBrowseFilter(filter) ? current : filter);
          setLoved(false);
          if (returningToResults) requestAnimationFrame(() => {
            window.scrollTo({ top: returningToResults.scroll, behavior: 'instant' as ScrollBehavior });
            if (returningToResults.trigger?.isConnected && !returningToResults.trigger.closest('[hidden]')) returningToResults.trigger.focus({ preventScroll: true });
          });
          if (rawFilter && filter.kind === 'all' && rawFilter !== 'all') {
            const state = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
            window.history.replaceState(state, '', menuHash(q, filter));
          }
        }
        if (restoringMenu && menuReturn.current && (menuReturn.current.hash === window.location.hash || window.location.hash === '#/menu')) {
          const scroll = menuReturn.current.scroll;
          requestAnimationFrame(() => window.scrollTo({ top: scroll, behavior: 'instant' as ScrollBehavior }));
        }
        lastMenuHash.current = window.location.hash;
      }
      if (wantsDaily()) setDailyForced(true);
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

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
    if (target === '#/' || target === '#' || target === '') restoreLastHomeOnNextEntry();
    window.location.hash = target;
  }, [restoreLastHomeOnNextEntry]);

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
    if (!menuActivated) return;
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
  }, [menuActivated, browseQ, browseLimit, browseSeed, browseFilter, loved, lovedLikes, lovedRefresh, keptRecipes]);

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
    setBrowseFilter({ kind: 'all' });
    setLoved(false);
    setBrowseSeed(String(Math.random()));
    if (route === 'menu' && !landing && window.location.hash !== '#/menu') {
      const state = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
      window.history.pushState(state, '', '#/menu');
    }
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
  const helpTour: TourId | null = landing ? 'landing' : route === 'atlas' ? null : route;
  const moreLeft = browseHasMore;

  const onBarFilter = useCallback((value: BrowseFilter) => {
    setInventMood(value.kind === 'all' ? '' : value.id);
  }, []);
  const onBrowseQuery = useCallback((value: string) => {
    setBrowseQ(value);
    // A typed query always exposes the full library, regardless of the last map view.
    setBrowseView('list');
    if (route !== 'menu' || landing) return;
    const state = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
    window.history.replaceState(state, '', menuHash(value, browseFilter));
    lastMenuHash.current = window.location.hash;
  }, [browseFilter, landing, route]);
  const onBrowseFilter = useCallback((value: BrowseFilter) => {
    setBrowseFilter(value);
    setLoved(false);
    if (route !== 'menu' || landing) return;
    const state = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
    window.history.pushState(state, '', menuHash(browseQ, value));
    lastMenuHash.current = window.location.hash;
  }, [browseQ, landing, route]);
  const openTaste = useCallback((context: TasteContext, trigger?: HTMLElement) => {
    setTasteContext(context);
    setBrowseView('map');
    setTasteRequest(value => ({ id: value.id + 1, focus: 'map' }));
    if (context.kind === 'related') setTasteSelectedId(context.anchorId);
    const fromMenu = route === 'menu' && !landing;
    // A contextual entry from Shelf or Tab should not inherit an unrelated
    // keyword search from an earlier library visit. Its old URL still restores on Back.
    if (!fromMenu) { setBrowseQ(''); setBrowseFilter(current => current.kind === 'all' ? current : { kind: 'all' }); setLoved(false); }
    const target = menuHash(fromMenu ? browseQ : '', fromMenu ? browseFilter : { kind: 'all' }, context);
    if (route === 'menu' && !landing) {
      if (browseView === 'list') {
        // Safari touch clicks do not focus buttons. Keep the actual opener,
        // rather than whichever element happened to retain keyboard focus.
        recipeListReturn.current = { scroll: window.scrollY, trigger: trigger || (document.activeElement instanceof HTMLElement ? document.activeElement : null) };
        const previous = new URL(menuHash(browseQ, browseFilter), window.location.href);
        const params = new URLSearchParams(previous.hash.split('?')[1] || '');
        params.set('view', 'recipes');
        window.history.replaceState(window.history.state, '', `#/menu?${params}`);
        window.history.pushState(window.history.state, '', target);
      } else window.history.replaceState(window.history.state, '', target);
      lastMenuHash.current = window.location.hash;
    } else window.location.hash = target;
  }, [browseQ, browseFilter, route, landing, browseView]);
  const showRecipes = () => {
    setBrowseView('list');
    window.history.replaceState(window.history.state, '', menuHash(browseQ, browseFilter));
    lastMenuHash.current = window.location.hash;
  };
  const mappedMatches = useMemo(() => mappedRecipeMatches(catalogueRecipes, browseQ, browseFilter, vibes), [catalogueRecipes, browseQ, browseFilter, vibes]);
  const mappedMatchIds = useMemo(() => new Set(mappedMatches.map(recipe => recipe.id)), [mappedMatches]);
  const hasRecipeQuery = Boolean(browseQ.trim()) || browseFilter.kind !== 'all';
  const showRecipeResults = browseView === 'list' || hasRecipeQuery;
  const browseContext = browseFilter.kind === 'category'
    ? vibes.find((v) => v.id === browseFilter.id)?.label
    : browseFilter.kind === 'collection'
      ? browseFilter.id === 'india' ? 'India' : 'House Specials'
      : loved ? 'Most loved' : browseQ ? `“${browseQ}”` : '';
  const browseNote = `Showing ${featured.length} of ${browseTotal}${browseContext ? ` · ${browseContext}` : ''}`;

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
      onExpand={recipeFocus.openRecipe}
      onMoreLike={hasTasteProfile(r.id) ? trigger => openTaste({ kind: 'related', anchorId: r.id }, trigger) : undefined}
      onTastePreview={route === 'menu' && browseView === 'map' && hasTasteProfile(r.id) ? () => { setTasteSelectedId(r.id); setTasteRequest(value => ({ id: value.id + 1, focus: 'preview' })); } : undefined}
      tasteSelected={route === 'menu' && browseView === 'map' && tasteSelectedId === r.id}
      tourActions={tourActions}
    />
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className={`site ${shortsActive ? 'shorts-active' : ''} ${landing ? 'landing-active' : ''}`}>
        <SketchDefs />
        {!shortsActive && <DailyQuestion force={dailyForced} />}
        {!shortsActive && <InstallBanner />}
        {!shortsActive && <NudgePrompt />}
        <GuidedTour id="landing" active={landing} autoStart={false} />
        <GuidedTour id="menu" active={route === 'menu' && !landing} autoStart={false} />
        <GuidedTour id="bar" active={route === 'bar'} autoStart={false} />
        <GuidedTour id="basics" active={route === 'basics'} autoStart={false} />
        <GuidedTour id="tab" active={route === 'tab'} autoStart={false} />
        <GuidedTour id="quiz" active={route === 'quiz'} autoStart={false} />
        <GuidedTour id="watch" active={route === 'watch'} autoStart={false} />
        <GuidedTour id="shorts" active={route === 'shorts'} autoStart={false} />

        <SiteNavigation
          active={active} theme={theme} preference={themePreference} onPreference={changeTheme}
          onToggleTheme={toggleTheme} tabCount={tab.length} helpTour={helpTour}
          onHome={event => { if (beginFreshHome()) event.preventDefault(); }}
        />

        <main id="main-content" tabIndex={-1}>
          {/* every page stays mounted (hidden when inactive) so lists, search,
              flipped cards and accordion state survive switching between them */}
            <div hidden={!landing}>
              <LandingPage
                active={landing}
                visitId={retainedHomeVisit.current?.id ?? ''}
                shorts={retainedHomeVisit.current?.shorts ?? []}
              />
            </div>

            <div hidden={route !== 'menu' || landing}>
                <section className="sec menu-page" id="menu-list">
                  <SectionHead
                    index="01"
                    title="Find a drink you’ll like."
                    note={`${health?.cocktails ?? 691} recipes · ${TASTE_PROFILES.length} illustrated classics`}
                    loading={browseLoading}
                  />
                  <p className="house-page-intro">Search the full recipe library, or explore classics by taste.</p>
                  <div className="field menu-search" data-tour="menu-controls">
                    <input
                      value={browseQ}
                      onChange={(e) => onBrowseQuery(e.target.value)}
                      placeholder="Search drinks or ingredients"
                      aria-label="Search menu by name, ingredient, lane, access tier, glass, place, mood or method"
                    />
                  </div>
                  <div className="drink-view-controls">
                    <div className="drink-view-switch" role="group" aria-label="Drinks view">
                      <button aria-pressed={browseView === 'list'} onClick={showRecipes}>Search drinks</button>
                      <button aria-pressed={browseView === 'map'} onClick={event => openTaste(tasteContext, event.currentTarget)}>Explore by taste</button>
                    </div>
                    <button className="text-btn" aria-expanded={refineOpen} onClick={() => setRefineOpen(value => !value)}>{refineOpen ? 'Hide filters' : 'More filters'} <ArrowDown size={14} /></button>
                  </div>
                  {hasRecipeQuery && <div className="drink-search-summary" aria-busy={browseLoading}>
                    <div><h2>{browseQ.trim() ? `Recipes matching “${browseQ.trim()}”` : 'Filtered recipes'}</h2><p role="status">{browseLoading ? 'Searching the recipe library…' : browseError ? 'The recipe library couldn’t load.' : `${browseTotal} recipe ${browseTotal === 1 ? 'match' : 'matches'} · ${mappedMatches.length} on the Taste Map`}</p></div>
                    {!browseLoading && !browseError && <button className="text-btn" onClick={event => openTaste({ kind: 'matches' }, event.currentTarget)}>See mapped matches <span className="drink-count">{mappedMatches.length}</span><ArrowRight size={16} /></button>}
                    {offersTartIntent(browseQ) && <div className="drink-search-intent"><p>Looking for a flavour instead?</p><button className="text-btn" onClick={event => openTaste({ kind: 'flavour', flavour: 'tart' }, event.currentTarget)}>Explore tart &amp; citrusy drinks <ArrowRight size={16} /></button></div>}
                  </div>}
                  {refineOpen && <div className="bar-controls">
                    <CategoryFilter
                      value={browseFilter}
                      vibes={vibes}
                      includeIndia
                      includeHouse
                      onChange={value => { onBrowseFilter(value); setBrowseView('list'); }}
                      label="Filter menu by category or collection"
                    />
                    <div className="menu-actions">
                      <button
                        className={`text-btn ${loved ? 'loved-on' : ''}`}
                        onClick={() => {
                          if (!loved) fetchLikes().then(setLikes).catch(() => {});
                          setLoved((v) => !v);
                          setBrowseView('list');
                        }}
                        aria-pressed={loved}
                      >
                        Most loved <Heart size={12} />
                      </button>
                      <button className="text-btn" onClick={() => { setBrowseView('list'); surpriseMe(); }}>
                        Surprise me <Shuffle size={13} />
                      </button>
                    </div>
                  </div>}
                  <div hidden={browseView !== 'map'}><TasteFinder active={route === 'menu' && !landing && menuActivated && browseView === 'map'} query={browseQ} matchingIds={mappedMatchIds} matchTotal={browseLoading || browseError ? null : browseTotal} context={tasteContext} request={tasteRequest} selectedId={tasteSelectedId} onSelect={setTasteSelectedId} onContext={openTaste} onCatalogue={setCatalogueRecipes} pantry={pantry} saved={tabIds} onSave={toggleTab} onExpand={recipeFocus.openRecipe} onList={() => { showRecipes(); requestAnimationFrame(() => { const heading = document.getElementById('drink-results-heading'); heading?.scrollIntoView({ block: 'start' }); heading?.focus({ preventScroll: true }); }); }} /></div>
                  <div hidden={!showRecipeResults} className="drink-results" aria-labelledby="drink-results-heading">
                  <div className="drink-results-heading"><h2 id="drink-results-heading" tabIndex={-1}>{hasRecipeQuery ? 'All recipe matches' : 'The recipe library'}</h2><p>{browseLoading ? 'Loading recipes…' : browseNote}</p></div>
                  {featured.length === 0 && browseLoading ? (
                    <div className="empty">
                      <p className="empty-big">Opening the bar…</p>
                      <p className="k-label dim">Loading the local menu…</p>
                    </div>
                  ) : featured.length === 0 && browseError ? (
                    <div className="empty">
                      <p className="empty-big">The recipe list couldn’t load.</p>
                      <p className="k-label dim">Your search is saved. Try loading the list again.</p>
                      <button className="btn empty-retry" onClick={() => setBrowseSeed(String(Math.random()))}>
                        Try again <ArrowRight size={14} />
                      </button>
                    </div>
                  ) : featured.length === 0 && !browseLoading ? (
                    <div className="empty">
                      <p className="empty-big">Nothing by that name</p>
                      <p className="k-label dim">Try a drink name or ingredient, or clear your filters.</p>
                    </div>
                  ) : (
                    <>
                      <div className={`grid ${browseLoading ? 'is-loading' : ''}`} data-tour="menu-grid">
                        {featured.map((r, i) => card(r, i, false, i === 0 ? 'menu-card-actions' : undefined))}
                      </div>
                      {moreLeft && !browseLoading && (
                        <div className="more-row">
                          <button className="btn" onClick={loadMore} disabled={browseAppending}>
                            {browseAppending ? 'Loading…' : browseAppendError ? 'Retry' : 'Show more'} {!browseAppending && <ArrowDown size={14} />}
                          </button>
                          <span className="k-label dim">
                            {browse.length} of {browseTotal} on show
                          </span>
                          {browseAppendError && <span className="k-label err-inline" role="status">Load failed — try again</span>}
                          <button className="text-btn" onClick={surpriseMe}>
                            Or surprise me <Shuffle size={12} />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                  </div>
                </section>
            </div>

            <div hidden={route !== 'bar'}>
              <>
                {/* ================= the bar: shelf + pour ================= */}
                <section className="sec page-top" id="shelf">
                  <SectionHead
                    index="01"
                    title="My Shelf"
                    note="Add your ingredients. Find out what you can make."
                  />
                  <div className="shelf-grid" data-tour="shelf-entry">
                    <div className="shelf-col">
                      <span className="k-label field-label">What have you got?</span>
                      <Typeahead onAdd={addIngredient} />
                    </div>
                    <div className="shelf-col">
                      <span className="k-label field-label">Or upload a photo</span>
                      <UploadZone onAdd={addIngredient} onAddAll={addAll} pantry={pantry} />
                    </div>
                  </div>

                  {hasPantry && (
                    <div className="pantry">
                      <div className="pantry-head">
                        <span className="k-label">On the shelf: {String(pantry.length).padStart(2, '0')}</span>
                        <button className="text-btn" onClick={() => setPantry([])}>
                          Clear all <X size={11} />
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
                    title="What you can make"
                    note={`${barResults.length} matches`}
                    loading={matching}
                  />
                  <div className="shelf-results-head">
                    <div className="shelf-map-entry"><button className="text-btn" onClick={() => openTaste({ kind: 'shelf' })}>Explore these drinks <ArrowRight size={16} /></button><p>Illustrated classics that fit your shelf.</p></div>
                    <button
                      type="button"
                      className="btn btn-solid"
                      data-tour="invent-drink"
                      onClick={invent}
                      disabled={generating}
                    >
                      {generating ? 'Inventing…' : 'Invent a drink'} <ArrowRight size={14} />
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
                        {barFiltersExpanded ? 'Hide filters' : 'Filter results'} <ArrowDown size={12} />
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
                              placeholder="Search your Shelf… highball, Tier 1, regional"
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
                            <p className="k-label">No matches</p>
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
                <SectionHead index="01" title="Bar Basics" note="Learn the techniques, tools and terms behind a good drink." />
                <Reveal>
                  <Knowledge />
                </Reveal>
                <BarTalk />
              </section>
            </div>

            <div hidden={route !== 'quiz'}>
              <section className="sec page-top" id="quiz-page">
                <SectionHead
                  index="01"
                  title="Pub Quiz"
                  note="One point a correct answer"
                />
                {route === 'quiz' && <Quiz />}
              </section>
            </div>

            <div hidden={route !== 'atlas'}>
              {(atlasActivated || route === 'atlas') && <Suspense fallback={<p className="sec page-top" role="status">Opening the Bar Atlas…</p>}><BarAtlas /></Suspense>}
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
                  title="Your Tab"
                  note={tab.length ? `${tab.length} saved ${tab.length === 1 ? 'drink' : 'drinks'}` : 'Save a few drinks for your next round.'}
                />
                <div data-tour="tab-lineup">
                {tab.length === 0 ? (
                  <div className="empty">
                    <p className="empty-big">Nothing on the Tab yet</p>
                    <p className="k-label dim">
                      Save a drink from its preview or use + on a recipe card.{' '}
                      <a className="empty-link" href="#/menu">Browse drinks</a>
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="tab-head">
                      <span className="k-label dim">Saved on this device. It keeps between visits.</span>
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
                            <>Copied <Check size={11} /></>
                          ) : (
                            <>Share the Tab <Share size={11} /></>
                          )}
                        </button>
                        <button className="text-btn" onClick={() => setTab([])}>
                          Clear the Tab <X size={11} />
                        </button>
                      </div>
                    </div>
                    <div className="grid" data-tour="tab-cards">{tab.map((r, i) => card(r, i, true))}</div>
                  </>
                )}
                </div>
                <BarTalk />
              </section>
            </div>
        </main>
        <ScrollToTop routeKey={landing ? 'home' : route} />

        {/* ================= footer ================= */}
        {!shortsActive && (
          <footer className="foot">
            <Lines as="p" className="foot-big" lines={['Pour something', 'proper']} stagger={0.08} />
            <div className="foot-nudge">
              <NudgeToggle />
            </div>
            <div className="foot-meta">
              <span className="k-label">Recipes from TheCocktailDB</span>
              <span className="k-label">House Specials may be original or robot-made. Taste before serving.</span>
              <span className="k-label">The PubCrawl © 2026</span>
            </div>
          </footer>
        )}

        {/* ================= video modal ================= */}
        <AnimatePresence>
          {video && <VideoModal recipe={video} onClose={closeVideo} />}
        </AnimatePresence>
        {recipeFocus.session && (
          <RecipeFocus
            session={recipeFocus.session}
            phase={recipeFocus.phase}
            onRequestClose={recipeFocus.requestClose}
            onEntered={recipeFocus.markOpen}
            onExited={recipeFocus.completeClose}
          />
        )}
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
  const videoLabel = 'Watch it made';
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
          <span className="k-label">{videoLabel}: {recipe.name}</span>
          <button ref={closeRef} className="text-btn" onClick={onClose}>
            Close <X size={12} />
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
          <div className="modal-empty" role="status">No verified video available</div>
        )}
      </motion.div>
    </motion.div>
  );
}

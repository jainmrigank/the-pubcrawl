import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { fetchRecipes, fetchShorts, postShortSession } from '../api';
import type { Recipe, ShortLibrary, ShortsReturnState, ShortVideo, Vibe, WatchLane } from '../types';
import { applyMutedSound, YT_PLAYER_STATES, type YouTubePlayer } from '../shortsPlayer';
import { ArrowLeft, ArrowRight, Check, GlassIcon, Share, X } from '../icons';
import { shareContent, shortShareText } from '../share';
import { formatMeasure } from '../measure';
import { SHORTS_SEED } from '../shortsData';
import { RecipeCardActions } from './RecipeCard';
import { ContextualHelp } from './ContextualHelp';
import { ShortPlayerHost } from './shorts/ShortPlayerHost';
import { OVERLAY_PRIORITY, overlayGate, setBackgroundInert } from '../overlayGate';
import { queryLocalRecipes } from '../localData';
import {
  createShortsControllerState,
  leaseMatches,
  reconcileShortsOrder,
  shortsPreparationPriority,
  shortsContentWindow,
  shortsDirectionalPlayerWindow,
  transitionShortsController,
  type PlayerLease,
  type ShortsControllerPhase,
  type ShortsControllerState,
} from '../shortsController';
import {
  audibleAuthorizationMatches,
  claimShortsStart,
  createShortsStartCommand,
  markShortsStartProgress,
  mutedFallbackAuthorization,
  playerReadyForStart,
  readShortsSoundPreference,
  shouldRevokeShortsLease,
  startModeForGesture,
  writeShortsSoundPreference,
  type ShortsStartAttempt,
  type ShortsStartAuthorization,
  type ShortsStartCommand,
  type ShortsStartMode,
} from '../shortsSoundPolicy';
import { createShortsInitializationPool, type InitializationLease } from '../shortsPlayerPool';

const FALLBACK_LANES: WatchLane[] = [
  { id: 'craft', label: 'The Craft', color: '#8A5A24' },
  { id: 'education', label: 'Learn It', color: '#5C7A3B' },
  { id: 'comedy', label: 'For The Laugh', color: '#4A4E7A' },
  { id: 'people', label: 'People & Drink', color: '#8E4A5B' },
];

const staticLibrary: ShortLibrary = {
  shorts: SHORTS_SEED,
  lanes: FALLBACK_LANES,
  hasNumbers: false,
  updatedAt: null,
};

function randomSeed() {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 0x100000000);
}

/** Deterministic Fisher–Yates shuffle so metadata refreshes keep this visit's order. */
function shuffleWithSeed<T>(items: readonly T[], seed: number): T[] {
  const shuffled = [...items];
  let state = seed >>> 0;
  const random = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function sourceLabel(source: string): 'landing' | 'nav' | 'deep-link' | 'direct' {
  return source === 'landing' || source === 'nav' || source === 'deep-link' ? source : 'direct';
}

/**
 * `offsetTop` is relative to an element's offset parent, which is not
 * necessarily the independently scrolling Shorts feed. iOS and Chromium can
 * therefore jump several cards on route entry. Geometry plus the feed's
 * current scroll position gives the correct feed-local destination.
 */
function scrollFeedToCard(
  root: HTMLElement,
  card: HTMLElement,
  behavior: ScrollBehavior,
) {
  const index = Number(card.dataset.shortIndex);
  const top = Number.isInteger(index)
    ? index * root.clientHeight
    : root.scrollTop + card.getBoundingClientRect().top - root.getBoundingClientRect().top;
  root.scrollTo({ top: Math.max(0, top), behavior });
}

const SHORTS_SNAPSHOT_VERSION = 2 as const;
const SHORTS_SNAPSHOT_KEY = 'pubcrawl.shorts.overlay.v2';
const SHORTS_RECIPE_GATE_ID = 'shorts-recipe-overlay';

function isShortsReturnState(value: unknown): value is ShortsReturnState {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<ShortsReturnState>;
  const order = snapshot.order;
  const volume = snapshot.volume;
  return (
    typeof snapshot.videoId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(snapshot.videoId) &&
    (snapshot.version == null || snapshot.version === SHORTS_SNAPSHOT_VERSION) &&
    Array.isArray(order) && order.length > 0 && order.length <= 180 &&
    order.every((id) => typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id)) &&
    new Set(order).size === order.length && order.includes(snapshot.videoId) &&
    typeof snapshot.currentTime === 'number' && Number.isFinite(snapshot.currentTime) && snapshot.currentTime >= 0 &&
    typeof snapshot.wasPlaying === 'boolean' &&
    (snapshot.resumeIntent == null || snapshot.resumeIntent === 'autoplay' || snapshot.resumeIntent === 'paused') &&
    typeof snapshot.muted === 'boolean' && typeof volume === 'number' && Number.isFinite(volume) && volume >= 0 && volume <= 100 &&
    (snapshot.recipeQuery == null || typeof snapshot.recipeQuery === 'string')
  );
}

function readShortsOverlaySnapshot(): ShortsReturnState | null {
  if (typeof window === 'undefined') return null;
  const fromHistory = window.history.state?.pubcrawlShortsOverlay;
  if (isShortsReturnState(fromHistory)) return { ...fromHistory, version: SHORTS_SNAPSHOT_VERSION };
  try {
    const raw = window.sessionStorage.getItem(SHORTS_SNAPSHOT_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return isShortsReturnState(parsed) ? { ...parsed, version: SHORTS_SNAPSHOT_VERSION } : null;
  } catch {
    return null;
  }
}

function clearShortsOverlaySnapshot() {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.removeItem(SHORTS_SNAPSHOT_KEY); } catch {}
}

type ShortsPlaybackMode = 'pool' | 'balanced' | 'manual';
type ShortsScrollDirection = 'forward' | 'backward';
type ShortsSettleSource = 'native-scrollend' | 'stable-touchend' | 'quiet-fallback' | 'keyboard' | 'programmatic';

export type { ShortsStartAuthorization, ShortsStartMode } from '../shortsSoundPolicy';

function preferredPlaybackMode(): ShortsPlaybackMode {
  if (typeof window === 'undefined') return 'manual';
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const capabilities = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  };
  const connection = capabilities.connection;
  const slow = connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g';
  const saveData = Boolean(connection?.saveData);
  // Autoplay is evaluated per YouTube iframe. A single blocked player must
  // not collapse the whole visit into a one-player queue; the remaining
  // directional shells can still cue while the active card exposes TAP TO
  // PLAY when YouTube confirms a block.
  if (reduced || slow || saveData) return 'manual';
  return connection?.effectiveType === '3g' ? 'balanced' : 'pool';
}

/** Initialization order for the bounded iframe bootstrap queue. */
function shortsInitPriority(index: number, activeIndex: number, focusIndex: number, direction: ShortsScrollDirection): number {
  return shortsPreparationPriority(index, activeIndex, focusIndex, direction);
}

interface SessionCounters {
  videosStarted: number;
  advances: number;
  shares: number;
  recipeClicks: number;
  autoplayFailures: number;
  unavailableSkips: number;
  bufferingEvents: number;
  startupMsTotal: number;
}

const blankSession = (): SessionCounters => ({
  videosStarted: 0,
  advances: 0,
  shares: 0,
  recipeClicks: 0,
  autoplayFailures: 0,
  unavailableSkips: 0,
  bufferingEvents: 0,
  startupMsTotal: 0,
});

interface ShortsProps {
  active: boolean;
  initialId?: string;
  source?: string;
  onBack: () => void;
  returnState?: ShortsReturnState | null;
  onContinueToBar?: (snapshot: ShortsReturnState) => void;
  onReturnConsumed?: () => void;
  recipeVibe: (recipe: Recipe) => Vibe;
  onToggleRecipeTab: (recipe: Recipe) => void;
  recipeTabIds: ReadonlySet<string>;
  recipeLikes: Record<string, number>;
  recipeLikedIds: ReadonlySet<string>;
  onToggleRecipeLike: (recipe: Recipe) => void;
  onKeepRecipe: (recipe: Recipe) => void;
}

interface ShortRecipeCardProps {
  recipe: Recipe;
  index: number;
  vibe: Vibe;
  onToggleTab: (recipe: Recipe) => void;
  inTab: boolean;
  likes: number;
  liked: boolean;
  onToggleLike: (recipe: Recipe) => void;
  onKeep: (recipe: Recipe) => void;
}

function ShortRecipeCard({ recipe, index, vibe, onToggleTab, inTab, likes, liked, onToggleLike, onKeep }: ShortRecipeCardProps) {
  const [flipped, setFlipped] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <article className={`shorts-recipe-card ${flipped ? 'is-flipped' : ''}`}>
      <div
        className="shorts-recipe-card-inner"
        role="button"
        tabIndex={0}
        aria-label={`${recipe.name}. ${flipped ? 'Show photo' : 'Show ingredients and method'}`}
        onClick={() => setFlipped((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setFlipped((value) => !value);
          }
        }}
      >
        <div className="shorts-recipe-face shorts-recipe-front">
          {recipe.thumb && !imageFailed ? (
            <div className="shorts-recipe-image">
              <img src={recipe.thumb} alt={recipe.name} loading={index < 2 ? 'eager' : 'lazy'} decoding="async" onError={() => setImageFailed(true)} />
            </div>
          ) : (
            <div className="shorts-recipe-image shorts-recipe-image-fallback" role="img" aria-label="No verified photo available">
              <span className="k-label">NO PHOTO</span>
              <GlassIcon glass={recipe.glass} size={56} />
            </div>
          )}
          <div className="shorts-recipe-copy">
            <span className="k-label">{recipe.glass || 'ANY GLASS'}</span>
            <h3>{recipe.name}</h3>
            <span className="k-label dim">TAP FOR THE POUR</span>
          </div>
        </div>
        <div className="shorts-recipe-face shorts-recipe-back">
          <div className="shorts-recipe-back-head">
            <span className="k-label">WHAT YOU NEED</span>
            <h3>{recipe.name}</h3>
          </div>
          <ul>
            {recipe.ingredients.slice(0, 8).map((ingredient, ingredientIndex) => (
              <li key={`${ingredient.name}-${ingredientIndex}`}>
                <span>{ingredient.name}</span>
                <span className="k-label dim">{formatMeasure(ingredient.measure) || '—'}</span>
              </li>
            ))}
          </ul>
          <p>{recipe.instructions}</p>
        </div>
      </div>
      <div className="card-actions shorts-recipe-card-actions" aria-label={`${recipe.name} actions`}>
        <RecipeCardActions
          recipe={recipe}
          vibe={vibe}
          onToggleTab={onToggleTab}
          inTab={inTab}
          likes={likes}
          liked={liked}
          onToggleLike={onToggleLike}
          onKeep={onKeep}
        />
      </div>
    </article>
  );
}


interface ShortsSpeedHoldProps {
  enabled: boolean;
  rate: number;
  player: YouTubePlayer | null;
}

/** Instagram/YouTube-style temporary 2× hold, kept outside the iframe. */
function ShortsSpeedHold({ enabled, rate, player }: ShortsSpeedHoldProps) {
  const timerRef = useRef<number | null>(null);
  const pointerRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const originalRateRef = useRef<number | null>(null);
  const [holding, setHolding] = useState(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const restore = useCallback(() => {
    clearTimer();
    const original = originalRateRef.current;
    if (player && original != null) {
      try {
        player.setPlaybackRate?.(original);
      } catch {}
    }
    originalRateRef.current = null;
    pointerRef.current = null;
    setHolding(false);
  }, [clearTimer, player]);

  const begin = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (!enabled || pointerRef.current) return;
    if (!player) return;
    let current = rate || 1;
    try {
      current = player.getPlaybackRate?.() || current;
    } catch {}
    pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    originalRateRef.current = current;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const active = player;
      if (!active || !pointerRef.current || !enabled) return;
      if (!active.setPlaybackRate) {
        restore();
        return;
      }
      let rates: number[] = [];
      try {
        rates = active.getAvailablePlaybackRates?.() || [];
      } catch {}
      const faster = rates.filter((candidate) => Number.isFinite(candidate) && candidate > 1 && candidate <= 2);
      if (rates.length && !faster.length) {
        restore();
        return;
      }
      const target = faster.length ? Math.max(...faster) : 2;
      try {
        active.setPlaybackRate(target);
      } catch {
        restore();
      }
    }, 250);
  }, [enabled, player, rate, restore]);

  const move = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 12) restore();
  }, [restore]);

  useEffect(() => {
    if (enabled) return;
    restore();
  }, [enabled, restore]);

  // The IFrame API confirms the accepted rate asynchronously. Do not claim a
  // 2× hold when a browser/player silently clamps or rejects the request.
  useEffect(() => {
    const original = originalRateRef.current;
    if (!pointerRef.current || original == null || !Number.isFinite(rate)) return;
    if (rate > original + 0.01) setHolding(true);
  }, [rate]);

  useEffect(() => {
    const stop = () => restore();
    document.addEventListener('visibilitychange', stop);
    window.addEventListener('pagehide', stop);
    return () => {
      document.removeEventListener('visibilitychange', stop);
      window.removeEventListener('pagehide', stop);
      restore();
    };
  }, [restore]);

  return (
    <button
      type="button"
      className={`shorts-speed-hold ${holding ? 'is-holding' : ''}`}
      aria-label={holding ? `Playing at ${rate}×. Release to restore speed.` : 'Hold for double speed'}
      aria-pressed={holding}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={restore}
      onPointerCancel={restore}
      onPointerLeave={(event) => {
        if (holding) restore();
        else if (pointerRef.current?.id === event.pointerId) restore();
      }}
    >
      {holding ? `${rate % 1 ? rate.toFixed(1) : rate}×` : '2×'}
    </button>
  );
}

/** One-card-per-viewport Shorts shelf with an adaptive directional player pool. */
export function Shorts({
  active,
  initialId,
  source = 'direct',
  onBack,
  returnState = null,
  onContinueToBar,
  onReturnConsumed,
  recipeVibe,
  onToggleRecipeTab,
  recipeTabIds,
  recipeLikes,
  recipeLikedIds,
  onToggleRecipeLike,
  onKeepRecipe,
}: ShortsProps) {
  const [data, setData] = useState<ShortLibrary>(staticLibrary);
  const [orderSeed, setOrderSeed] = useState(randomSeed);
  const [orderRevision, setOrderRevision] = useState(0);
  const orderIdsRef = useRef<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [prepareIndex, setPrepareIndex] = useState(0);
  const [scrollDirection, setScrollDirection] = useState<ShortsScrollDirection>('forward');
  const [visibleIndex, setVisibleIndex] = useState(-1);
  const [controllerPhase, setControllerPhase] = useState<ShortsControllerPhase>('route-inactive');
  const [manualIndex, setManualIndex] = useState<number | null>(null);
  const [manualToken, setManualToken] = useState(0);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [playbackMode, setPlaybackMode] = useState<ShortsPlaybackMode>(() => preferredPlaybackMode());
  const [blockedIndex, setBlockedIndex] = useState<number | null>(null);
  const [startAuthorization, setStartAuthorization] = useState<ShortsStartAuthorization | null>(null);
  const [failureVersion, setFailureVersion] = useState(0);
  const [shared, setShared] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [error, setError] = useState(false);
  const [configError, setConfigError] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [recipeOverlay, setRecipeOverlay] = useState<{ short: ShortVideo; snapshot: ShortsReturnState } | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [recipesError, setRecipesError] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const recipeCloseRef = useRef<HTMLButtonElement>(null);
  const recipeOpenerRef = useRef<HTMLElement | null>(null);
  const activeRef = useRef(active);
  const activeIndexRef = useRef(0);
  const prepareIndexRef = useRef(0);
  const visibleIndexRef = useRef(-1);
  const controllerRef = useRef<ShortsControllerState>(createShortsControllerState(0));
  const gestureStartTopRef = useRef<number | null>(null);
  const openingOverlayRef = useRef(false);
  const overlayRestoredRef = useRef(false);
  const overlayLoadedRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const scrollDirectionRef = useRef<ShortsScrollDirection>('forward');
  const activeIdRef = useRef<string | null>(null);
  const visitStarted = useRef(false);
  const lastInitialIdRef = useRef<string | undefined>(undefined);
  const wasPlayingRef = useRef(false);
  const [initialSoundPreference] = useState(() => readShortsSoundPreference());
  // `muted` represents the user's desired session state. A specific active
  // player may temporarily be forced muted by iOS without changing this value.
  const soundRef = useRef({ muted: !initialSoundPreference.desiredAudible, volume: initialSoundPreference.volume });
  const soundSyncTokenRef = useRef(0);
  const soundSyncTimersRef = useRef<number[]>([]);
  const startAuthorizationRef = useRef<ShortsStartAuthorization | null>(null);
  const forcedMutedLeaseRef = useRef<string | null>(null);
  const startCommandsRef = useRef(new Map<string, ShortsStartCommand>());
  const playersRef = useRef(new Map<number, YouTubePlayer>());
  const initializationPoolRef = useRef<ReturnType<typeof createShortsInitializationPool> | null>(null);
  if (!initializationPoolRef.current) {
    initializationPoolRef.current = createShortsInitializationPool(2);
  }
  const failedIdsRef = useRef(new Set<string>());
  const retryCountsRef = useRef(new Map<string, number>());
  const session = useRef<SessionCounters>(blankSession());
  const started = useRef(new Set<string>());
  const sent = useRef(false);
  const sourceRef = useRef(sourceLabel(source));
  const overlayRef = useRef(recipeOverlay);
  const overlayBaseHash = useRef('');
  const overlayResumeRef = useRef<boolean | null>(null);
  const pendingRestoreRef = useRef<ShortsReturnState | null>(null);
  const activationTimerRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const pendingActivationRef = useRef<number | null>(null);
  const setActiveRef = useRef<(next: number, countAdvance?: boolean, startMode?: ShortsStartMode) => PlayerLease | null>(() => null);
  const orderedLengthRef = useRef(0);

  overlayRef.current = recipeOverlay;
  activeRef.current = active;
  activeIndexRef.current = activeIndex;
  prepareIndexRef.current = prepareIndex;
  visibleIndexRef.current = visibleIndex;
  startAuthorizationRef.current = startAuthorization;

  const orderedShorts = useMemo(() => {
    const byId = new Map(data.shorts.map((short) => [short.id, short]));
    const deterministic = shuffleWithSeed(data.shorts, orderSeed).map((short) => short.id);
    const existing = orderIdsRef.current.filter((id) => byId.has(id));
    const seen = new Set(existing);
    const next = [...existing, ...deterministic.filter((id) => !seen.has(id))];
    orderIdsRef.current = next;
    return next.map((id) => byId.get(id)).filter((short): short is ShortVideo => Boolean(short));
  }, [data.shorts, orderRevision, orderSeed]);

  const contentIndices = useMemo(
    () => new Set(shortsContentWindow(activeIndex, orderedShorts.length, 5)),
    [activeIndex, orderedShorts.length]
  );
  const playerIndices = useMemo(
    () => new Set(shortsDirectionalPlayerWindow(activeIndex, orderedShorts.length, scrollDirection, playbackMode === 'manual' ? 1 : 5)),
    [activeIndex, orderedShorts.length, playbackMode, scrollDirection]
  );

  const transitionController = useCallback((event: Parameters<typeof transitionShortsController>[1]) => {
    const next = transitionShortsController(controllerRef.current, event);
    controllerRef.current = next;
    setControllerPhase(next.phase);
    if (typeof window !== 'undefined') {
      const hashQuery = window.location.hash.includes('?') ? new URLSearchParams(window.location.hash.split('?')[1]) : null;
      const debug = import.meta.env.DEV && (new URLSearchParams(window.location.search).get('debug') === 'shorts' || hashQuery?.get('debug') === 'shorts');
      if (debug) {
        const target = window as Window & { __PUBCRAWL_SHORTS_DEBUG__?: Array<Record<string, unknown>> };
        const ring = target.__PUBCRAWL_SHORTS_DEBUG__ || [];
        ring.push({ at: Date.now(), event: event.type, phase: next.phase, settledIndex: next.settledIndex, intentIndex: next.intentIndex, generation: next.generation, leaseIndex: next.lease?.index ?? null });
        target.__PUBCRAWL_SHORTS_DEBUG__ = ring.slice(-100);
      }
    }
    return next;
  }, []);

  const startCommandKey = useCallback((index: number, generation: number) => {
    const shortId = orderedShorts[index]?.id;
    return shortId ? `${shortId}:${index}:${generation}` : '';
  }, [orderedShorts]);

  const claimStartCommand = useCallback((
    index: number,
    generation: number,
    attempt: ShortsStartAttempt,
    requestedAudible: boolean,
  ) => {
    if (!leaseMatches(controllerRef.current, index, generation)) return false;
    const short = orderedShorts[index];
    if (!short) return false;
    const key = startCommandKey(index, generation);
    const current = startCommandsRef.current.get(key)
      ?? createShortsStartCommand(short.id, index, generation, requestedAudible);
    const claimed = claimShortsStart({ ...current, requestedAudible: current.requestedAudible || requestedAudible }, attempt);
    startCommandsRef.current.set(key, claimed.command);
    return claimed.allowed;
  }, [orderedShorts, startCommandKey]);

  const markStartProgress = useCallback((index: number, generation: number | null) => {
    if (generation == null) return;
    const key = startCommandKey(index, generation);
    const command = startCommandsRef.current.get(key);
    if (command) startCommandsRef.current.set(key, markShortsStartProgress(command));
  }, [startCommandKey]);

  const persistSoundPreference = useCallback((muted: boolean, volume: number) => {
    const normalized = writeShortsSoundPreference({ version: 1, desiredAudible: !muted, volume });
    soundRef.current = { muted: !normalized.desiredAudible, volume: normalized.volume };
  }, []);

  const cancelSoundSync = useCallback(() => {
    soundSyncTokenRef.current += 1;
    soundSyncTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    soundSyncTimersRef.current = [];
    // Sound authorizations are deliberately ephemeral. Any scroll, route,
    // overlay, or visibility transition invalidates the gesture that created
    // them so a late YouTube callback cannot unmute a different card.
    startAuthorizationRef.current = null;
    setStartAuthorization(null);
  }, []);

  /** Start the current player audibly from a direct user gesture. */
  const beginAudibleStart = useCallback((
    index: number,
    generation: number,
    player: YouTubePlayer,
    attempt: ShortsStartAttempt = 'initial',
  ) => {
    const authorization = startAuthorizationRef.current;
    if (
      !audibleAuthorizationMatches(authorization, index, generation, soundRef.current.muted) ||
      !leaseMatches(controllerRef.current, index, generation)
    ) return;
    if (!claimStartCommand(index, generation, attempt, true)) return;

    soundSyncTokenRef.current += 1;
    soundSyncTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    soundSyncTimersRef.current = [];
    try {
      // These commands intentionally remain adjacent to the event handler;
      // WebKit can reject an unmute that is issued from a later effect.
      player.setVolume(Math.max(0, Math.min(100, Math.round(soundRef.current.volume))));
      player.unMute();
      player.playVideo();
      forcedMutedLeaseRef.current = null;
    } catch {
      const fallback = mutedFallbackAuthorization(authorization, index, generation);
      if (attempt === 'initial' && fallback && claimStartCommand(index, generation, 'retry', false)) {
        startAuthorizationRef.current = fallback;
        setStartAuthorization(fallback);
        forcedMutedLeaseRef.current = startCommandKey(index, generation);
        try { player.mute(); player.playVideo(); } catch {}
      }
      return;
    }

    const token = soundSyncTokenRef.current;
    const timer = window.setTimeout(() => {
      soundSyncTimersRef.current = soundSyncTimersRef.current.filter((entry) => entry !== timer);
      if (token !== soundSyncTokenRef.current) return;
      const current = startAuthorizationRef.current;
      if (
        !current ||
        current.index !== index ||
        current.generation !== generation ||
        current.mode !== 'gesture-audible' ||
        !leaseMatches(controllerRef.current, index, generation) ||
        document.visibilityState === 'hidden'
      ) return;
      let state: number = YT_PLAYER_STATES.UNSTARTED;
      let muted = true;
      try {
        state = player.getPlayerState();
        muted = Boolean(player.isMuted());
      } catch {
        // Treat an unavailable iframe as a blocked audible start.
      }
      // First-frame motion has its own reveal gate. Requiring 80ms of media
      // progress here could unnecessarily remute a valid but slow-starting
      // iOS player after every swipe.
      if ((state === YT_PLAYER_STATES.PLAYING || state === YT_PLAYER_STATES.BUFFERING) && !muted) {
        forcedMutedLeaseRef.current = null;
        return;
      }
      // One and only one recovery: preserve the desired unmuted preference,
      // but make the video move muted when iOS rejects the audible start.
      const fallback = mutedFallbackAuthorization(current, index, generation);
      if (attempt !== 'initial' || !fallback || !claimStartCommand(index, generation, 'retry', false)) return;
      startAuthorizationRef.current = fallback;
      setStartAuthorization(fallback);
      forcedMutedLeaseRef.current = startCommandKey(index, generation);
      try {
        player.setVolume(Math.max(0, Math.min(100, Math.round(soundRef.current.volume))));
        player.mute();
        player.playVideo();
      } catch {}
      session.current.autoplayFailures += 1;
    }, 260);
    soundSyncTimersRef.current.push(timer);
  }, [claimStartCommand, startCommandKey]);

  /**
   * A facade tap is an explicit recovery request. It first uses any untouched
   * command for the lease, then consumes the single retry if startup had
   * already been attempted. The native YouTube control remains the only
   * sound UI; a blocked audible recovery degrades to muted motion.
   */
  const beginManualStart = useCallback((index: number, generation: number, player: YouTubePlayer) => {
    if (!leaseMatches(controllerRef.current, index, generation)) return;
    const requestedAudible = !soundRef.current.muted;
    const authorization: ShortsStartAuthorization = {
      index,
      generation,
      mode: requestedAudible ? 'gesture-audible' : 'muted-autoplay',
      fallbackUsed: false,
    };
    startAuthorizationRef.current = authorization;
    setStartAuthorization(authorization);

    if (requestedAudible) {
      const key = startCommandKey(index, generation);
      const existing = startCommandsRef.current.get(key);
      beginAudibleStart(index, generation, player, existing?.issued ? 'retry' : 'initial');
      return;
    }

    const key = startCommandKey(index, generation);
    const existing = startCommandsRef.current.get(key);
    const attempt: ShortsStartAttempt = existing?.issued ? 'retry' : 'initial';
    if (!claimStartCommand(index, generation, attempt, false)) return;
    forcedMutedLeaseRef.current = key;
    try {
      player.setVolume(Math.max(0, Math.min(100, Math.round(soundRef.current.volume))));
      player.mute();
      player.playVideo();
    } catch {}
  }, [beginAudibleStart, claimStartCommand, startCommandKey]);

  /**
   * A touch/key gesture can settle before its destination iframe is ready.
   * That gesture cannot legally be replayed from a later YouTube callback on
   * iOS, so explicitly downgrade that lease to a muted automatic start. Keep
   * the user's desired-sound preference intact so the next eligible swipe can
   * request audible playback again.
   */
  const demoteAudibleStart = useCallback((index: number, generation: number) => {
    const authorization = startAuthorizationRef.current;
    if (
      !authorization ||
      authorization.index !== index ||
      authorization.generation !== generation ||
      authorization.mode !== 'gesture-audible'
    ) return;
    const next = mutedFallbackAuthorization(authorization, index, generation);
    if (!next) return;
    startAuthorizationRef.current = next;
    setStartAuthorization(next);
    forcedMutedLeaseRef.current = startCommandKey(index, generation);
  }, [startCommandKey]);

  const requestPlayerInitialization = useCallback(
    (index: number, priority: number, start: (signal: AbortSignal) => Promise<void>): InitializationLease =>
      initializationPoolRef.current!.request(index, priority, start),
    []
  );

  const pausePlayersExcept = useCallback((keepIndex: number | null = null) => {
    playersRef.current.forEach((player, index) => {
      if (index !== keepIndex) {
        try {
          // A paused iframe can retain its audible state on iOS. Mute before
          // pausing so a prepared/previous card can never leak sound after a
          // swipe, route change, overlay open, or visibility transition.
          player.mute();
          player.pauseVideo();
        } catch {
          // A player can be between iframe teardown and its final callback.
        }
      }
    });
  }, []);

  const flushSession = useCallback(() => {
    const counters = session.current;
    const total =
      counters.videosStarted +
      counters.advances +
      counters.shares +
      counters.recipeClicks +
      counters.autoplayFailures +
      counters.unavailableSkips +
      counters.bufferingEvents +
      counters.startupMsTotal;
    if (sent.current || total === 0) return;
    sent.current = true;
    postShortSession({
      source: sourceRef.current,
      videosStarted: Math.min(50, counters.videosStarted),
      advances: Math.min(50, counters.advances),
      shares: Math.min(50, counters.shares),
      recipeClicks: Math.min(50, counters.recipeClicks),
      autoplayFailures: Math.min(50, counters.autoplayFailures),
      unavailableSkips: Math.min(50, counters.unavailableSkips),
      bufferingEvents: Math.min(50, counters.bufferingEvents),
      startupMsTotal: Math.min(300000, counters.startupMsTotal),
    }).catch(() => {});
  }, []);

  const replaceShortHash = useCallback((short: ShortVideo) => {
    if (typeof window === 'undefined' || !short || !activeRef.current) return;
    const params = new URLSearchParams({ v: short.id, src: sourceRef.current });
    // A persisted MAKE THIS entry owns the route until the dialog closes. If
    // a browser emits a synthetic snap/scroll event while that entry is being
    // reconstructed, changing the video hash must not silently drop make=1.
    const currentHashQuery = window.location.hash.includes('?')
      ? new URLSearchParams(window.location.hash.split('?')[1])
      : null;
    if (currentHashQuery?.get('make') === '1') params.set('make', '1');
    if (currentHashQuery?.get('debug') === 'shorts') params.set('debug', 'shorts');
    window.history.replaceState(window.history.state, '', `#/shorts?${params.toString()}`);
  }, []);

  const setActive = useCallback(
    (next: number, countAdvance = true, startMode: ShortsStartMode = 'muted-autoplay'): PlayerLease | null => {
      // Shorts stays mounted behind every route so its visit can be restored,
      // but no delayed scroll/player callback may mutate the URL after the
      // user has left the route.
      if (!activeRef.current || next < 0 || next >= orderedShorts.length) return null;
      let target = next;
      if (failedIdsRef.current.has(orderedShorts[target].id)) {
        // A prefetched neighbour can fail before the user reaches it. Never
        // make that failed facade an active stop: advance to the next healthy
        // card in visit order (or the closest previous one at the end).
        target = -1;
        for (let index = next + 1; index < orderedShorts.length; index += 1) {
          if (!failedIdsRef.current.has(orderedShorts[index].id)) {
            target = index;
            break;
          }
        }
        if (target < 0) {
          for (let index = next - 1; index >= 0; index -= 1) {
            if (!failedIdsRef.current.has(orderedShorts[index].id)) {
              target = index;
              break;
            }
          }
        }
        if (target < 0) {
          setError(true);
          return null;
        }
        const card = feedRef.current?.querySelector<HTMLElement>(`[data-short-index="${target}"]`);
        if (card && feedRef.current) scrollFeedToCard(feedRef.current, card, 'smooth');
      }
      const current = controllerRef.current;
      if (current.phase === 'idle' && current.lease?.index === target && current.settledIndex === target) {
        visibleIndexRef.current = target;
        setVisibleIndex(target);
        return current.lease;
      }
      const previous = activeIndexRef.current;
      const direction: ShortsScrollDirection = target < previous ? 'backward' : 'forward';
      const settled = transitionController({ type: 'scroll-settle', index: target });
      activeIndexRef.current = target;
      prepareIndexRef.current = target;
      visibleIndexRef.current = target;
      scrollDirectionRef.current = direction;
      setActiveIndex(target);
      setPrepareIndex(target);
      setScrollDirection(direction);
      setVisibleIndex(target);
      setManualIndex(null);
      setBlockedIndex(null);
      // The incoming player has not reported PLAYING yet. Do not let a
      // previous card's state make an immediate MAKE THIS snapshot resume a
      // video that was only cued.
      wasPlayingRef.current = false;
      cancelSoundSync();
      setPlayingIndex(null);
      setPlaybackRate(1);
      if (countAdvance) overlayResumeRef.current = null;
      // A real activation owns the new lease. Every other player is paused at
      // the same transition boundary; prepared shells remain CUED.
      pausePlayersExcept(target);
      const short = orderedShorts[target];
      activeIdRef.current = short?.id || null;
      if (short) replaceShortHash(short);
      if (countAdvance && previous !== target) session.current.advances += 1;
      const lease = settled.lease;
      if (lease) {
        const authorization: ShortsStartAuthorization = {
          index: target,
          generation: lease.generation,
          mode: startMode,
          fallbackUsed: false,
        };
        startAuthorizationRef.current = authorization;
        setStartAuthorization(authorization);
        startCommandsRef.current.clear();
        const key = startCommandKey(target, lease.generation);
        const command = createShortsStartCommand(short.id, target, lease.generation, startMode === 'gesture-audible');
        startCommandsRef.current.set(key, command);
        forcedMutedLeaseRef.current = startMode === 'muted-autoplay' && !soundRef.current.muted ? key : null;
      }
      return lease;
    },
    [cancelSoundSync, orderedShorts, pausePlayersExcept, replaceShortHash, startCommandKey, transitionController]
  );
  // The scroll listener is intentionally long-lived. API enrichment can
  // replace the ordered array while a quiet-settle timer is pending; keeping
  // the latest activation callback in a ref prevents that rerender from
  // tearing down the listener and stranding the controller in `scrolling`.
  setActiveRef.current = setActive;
  orderedLengthRef.current = orderedShorts.length;

  const registerPlayer = useCallback((index: number, player: YouTubePlayer) => {
    playersRef.current.set(index, player);
    // All automatic starts begin muted. The session preference is applied to
    // the active player only after YouTube confirms PLAYING.
    try {
      player.setVolume(soundRef.current.volume);
      player.mute();
    } catch {}
    if (index !== activeIndexRef.current) {
      try {
        player.pauseVideo();
      } catch {
        // Ignore a player that has not finished its own initialization.
      }
    }
  }, []);

  /**
   * Apply a captured MAKE THIS/menu-return position once the matching player
   * is cued. Playing restores seek again on PLAYING because the iframe can
   * emit a fresh state transition after the initial seek; paused snapshots
   * only need the first CUED seek and are then fully restored without auto-play.
   */
  const restorePlayerState = useCallback(
    (index: number, player: YouTubePlayer, phase: 'cued' | 'playing') => {
      const snapshot = pendingRestoreRef.current;
      const short = orderedShorts[index];
      if (!snapshot || !short || snapshot.videoId !== short.id) return;
      try {
        const authorization = startAuthorizationRef.current;
        const directAudible = Boolean(
          phase === 'playing' &&
          authorization &&
          authorization.index === index &&
          authorization.mode === 'gesture-audible' &&
          !authorization.fallbackUsed &&
          !soundRef.current.muted &&
          leaseMatches(controllerRef.current, index, authorization.generation),
        );
        // Passive restores seek muted. A close-button/keyboard gesture may
        // keep the active player audible, but only while its lease remains
        // current; never let a late CUED callback unmute a prepared iframe.
        if (directAudible) {
          player.setVolume(Math.max(0, Math.min(100, Math.round(snapshot.volume))));
        } else {
          applyMutedSound(player, snapshot.volume);
        }
        if (snapshot.currentTime > 0) player.seekTo(snapshot.currentTime, true);
        if (phase === 'playing') {
          pendingRestoreRef.current = null;
        } else if (!snapshot.wasPlaying) pendingRestoreRef.current = null;
      } catch {
        // The API can briefly reject commands while a cue/load transition is
        // settling; the next state event gets another chance.
      }
    },
    [orderedShorts]
  );

  const unregisterPlayer = useCallback((index: number, player: YouTubePlayer) => {
    if (playersRef.current.get(index) === player) playersRef.current.delete(index);
  }, []);

  const findNextPlayable = useCallback(
    (from: number) => {
      for (let index = from + 1; index < orderedShorts.length; index += 1)
        if (!failedIdsRef.current.has(orderedShorts[index].id)) return index;
      for (let index = from - 1; index >= 0; index -= 1)
        if (!failedIdsRef.current.has(orderedShorts[index].id)) return index;
      return -1;
    },
    [orderedShorts]
  );

  const handlePlayerError = useCallback(
    (index: number, generation: number | null, code: number) => {
      if (generation != null && !leaseMatches(controllerRef.current, index, generation)) return;
      const short = orderedShorts[index];
      if (!short) return;
      if (code === 153) {
        setConfigError(true);
        setBlockedIndex(index);
        if (index === activeIndexRef.current) {
          cancelSoundSync();
          setPlayingIndex(null);
        }
        return;
      }
      if (code === 5) {
        const tries = retryCountsRef.current.get(short.id) || 0;
        // A prefetched neighbour that fails is not visible, so there is no
        // reason to keep a broken player in the pool or wait for a retry that
        // can never become active. Mark it now; the active card will advance
        // past it on the next observer decision.
        if (index !== activeIndexRef.current) {
          failedIdsRef.current.add(short.id);
          setFailureVersion((version) => version + 1);
          session.current.unavailableSkips += 1;
          return;
        }
        if (tries < 1) {
          retryCountsRef.current.set(short.id, tries + 1);
          window.setTimeout(() => {
            const player = playersRef.current.get(index);
            if (!player || activeIndexRef.current !== index || generation == null) return;
            try {
              if (
                player.getPlayerState() !== YT_PLAYER_STATES.BUFFERING &&
                claimStartCommand(index, generation, 'retry', false)
              ) {
                player.mute();
                player.playVideo();
              }
            } catch {}
          }, 1500);
          return;
        }
      }
      if (code === 100 || code === 101 || code === 150 || code === 5 || code === 2) {
        failedIdsRef.current.add(short.id);
        setFailureVersion((version) => version + 1);
        session.current.unavailableSkips += 1;
        if (index === activeIndexRef.current) {
          cancelSoundSync();
          setPlayingIndex(null);
        }
        if (index !== activeIndexRef.current) return;
        const next = findNextPlayable(index);
        if (next >= 0) {
          const card = feedRef.current?.querySelector<HTMLElement>(`[data-short-index="${next}"]`);
          if (card && feedRef.current) scrollFeedToCard(feedRef.current, card, 'smooth');
          setActive(next);
        } else {
          setError(true);
        }
      }
    },
    [cancelSoundSync, claimStartCommand, findNextPlayable, orderedShorts, setActive]
  );

  const handleAutoplayBlocked = useCallback((index: number, generation: number | null, player: YouTubePlayer): boolean => {
    if (index !== activeIndexRef.current) return false;
    if (generation != null && !leaseMatches(controllerRef.current, index, generation)) return false;
    if (generation == null) return false;
    const authorization = startAuthorizationRef.current;
    if (claimStartCommand(index, generation, 'retry', false)) {
      const fallback = authorization
        ? { ...authorization, mode: 'muted-autoplay' as const, fallbackUsed: true }
        : { index, generation, mode: 'muted-autoplay' as const, fallbackUsed: true };
      startAuthorizationRef.current = fallback;
      setStartAuthorization(fallback);
      forcedMutedLeaseRef.current = startCommandKey(index, generation);
      try {
        player.setVolume(Math.max(0, Math.min(100, Math.round(soundRef.current.volume))));
        player.mute();
        player.playVideo();
      } catch {}
      setBlockedIndex(null);
      session.current.autoplayFailures += 1;
      return true;
    }
    setBlockedIndex(index);
    session.current.autoplayFailures += 1;
    return false;
  }, [claimStartCommand, startCommandKey]);

  const handlePlaying = useCallback((index: number, generation: number | null, startupMs: number, player: YouTubePlayer) => {
    if (!leaseMatches(controllerRef.current, index, generation)) {
      // A late PLAYING callback from a previous lease is never allowed to
      // reclaim the feed. It is safe to pause that iframe immediately.
      try { player.mute(); player.pauseVideo(); } catch {}
      return;
    }
    markStartProgress(index, generation);
    restorePlayerState(index, player, 'playing');
    setPlayingIndex(index);
    wasPlayingRef.current = true;
    const short = orderedShorts[index];
    if (!short) return;
    if (!started.current.has(short.id)) {
      started.current.add(short.id);
      session.current.videosStarted += 1;
      session.current.startupMsTotal += Math.min(30000, startupMs);
    }
  }, [markStartProgress, orderedShorts, restorePlayerState]);

  const handlePlaybackRateChange = useCallback((index: number, generation: number | null, rate: number) => {
    if (leaseMatches(controllerRef.current, index, generation) && Number.isFinite(rate) && rate > 0) setPlaybackRate(rate);
  }, []);

  const handleCued = useCallback(
    (index: number, generation: number | null, player: YouTubePlayer) => {
      // Prepared neighbours may cue freely, but only the settled card owns a
      // restore operation. This keeps a late CUED callback from an old lease
      // from seeking or changing sound on a hidden iframe.
      if (index !== activeIndexRef.current) return;
      if (generation != null && !leaseMatches(controllerRef.current, index, generation)) return;
      restorePlayerState(index, player, 'cued');
    },
    [restorePlayerState]
  );

  const handleBuffering = useCallback((index: number, generation: number | null) => {
    if (leaseMatches(controllerRef.current, index, generation)) {
      markStartProgress(index, generation);
      session.current.bufferingEvents += 1;
    }
  }, [markStartProgress]);

  const captureSnapshot = useCallback(
    (short: ShortVideo): ShortsReturnState => {
      const player = playersRef.current.get(activeIndexRef.current);
      let currentTime = 0;
      let wasPlaying = wasPlayingRef.current;
      let resumeIntent: ShortsReturnState['resumeIntent'] = wasPlaying ? 'autoplay' : 'paused';
      if (player) {
        try {
          currentTime = Math.max(0, player.getCurrentTime() || 0);
          const state = player.getPlayerState();
          // A paused native player is an intentional pause. CUED/BUFFERING,
          // however, can simply be a transient startup state while autoplay
          // is still pending and must resume after the recipe closes.
          resumeIntent = state === YT_PLAYER_STATES.PAUSED
            ? 'paused'
            : state === YT_PLAYER_STATES.PLAYING || state === YT_PLAYER_STATES.BUFFERING || state === YT_PLAYER_STATES.CUED
              ? 'autoplay'
              : wasPlaying ? 'autoplay' : 'paused';
          wasPlaying = resumeIntent === 'autoplay';
        } catch {
          // Keep the last known playback state when the iframe is unavailable.
        }
      }
      return {
        version: SHORTS_SNAPSHOT_VERSION,
        videoId: short.id,
        title: short.title,
        order: orderedShorts.map((entry) => entry.id),
        currentTime,
        wasPlaying,
        resumeIntent,
        recipeQuery: short.recipeQuery,
        muted: soundRef.current.muted,
        volume: soundRef.current.volume,
      };
    },
    [orderedShorts]
  );

  const restoreSnapshot = useCallback(
    (snapshot: ShortsReturnState, fromDirectGesture = false) => {
      if (!isShortsReturnState(snapshot)) return;
      const index = orderedShorts.findIndex((short) => short.id === snapshot.videoId);
      if (index < 0) return;
      pendingRestoreRef.current = snapshot;
      const shouldResume = snapshot.resumeIntent ? snapshot.resumeIntent === 'autoplay' : snapshot.wasPlaying;
      overlayResumeRef.current = shouldResume;
      if (activeIndexRef.current === index) {
        const resumed = transitionController({ type: 'overlay-close', resume: shouldResume });
        visibleIndexRef.current = index;
        setVisibleIndex(index);
        const player = playersRef.current.get(index);
        if (player) {
          try {
            if (snapshot.currentTime > 0) player.seekTo(snapshot.currentTime, true);
            const directAudible = Boolean(fromDirectGesture && shouldResume && !soundRef.current.muted && resumed.lease);
            if (directAudible && resumed.lease) {
              const authorization: ShortsStartAuthorization = {
                index,
                generation: resumed.lease.generation,
                mode: 'gesture-audible',
                fallbackUsed: false,
              };
              startAuthorizationRef.current = authorization;
              setStartAuthorization(authorization);
              let state: number = YT_PLAYER_STATES.UNSTARTED;
              try { state = player.getPlayerState(); } catch {}
              if (playerReadyForStart(state)) {
                beginAudibleStart(index, resumed.lease.generation, player);
              } else {
                demoteAudibleStart(index, resumed.lease.generation);
                applyMutedSound(player, soundRef.current.volume);
              }
            } else {
              // A passive history/reload restore cannot legally reuse the
              // gesture that opened the recipe. Keep it moving muted; the next
              // eligible swipe can request the session's desired sound again.
              applyMutedSound(player, soundRef.current.volume);
              if (shouldResume && resumed.lease && claimStartCommand(index, resumed.lease.generation, 'initial', false)) {
                forcedMutedLeaseRef.current = startCommandKey(index, resumed.lease.generation);
                player.playVideo();
              }
            }
          } catch {}
        }
      } else {
        setActive(index, false);
      }
      requestAnimationFrame(() => {
        const card = feedRef.current?.querySelector<HTMLElement>(`[data-short-index="${index}"]`);
        if (card && feedRef.current) scrollFeedToCard(feedRef.current, card, 'auto');
      });
    },
    [beginAudibleStart, claimStartCommand, demoteAudibleStart, orderedShorts, setActive, startCommandKey, transitionController]
  );

  const openRecipeOverlay = useCallback(
    (short: ShortVideo) => {
      if (!activeRef.current || !short.recipeQuery || openingOverlayRef.current || overlayRef.current) return;
      if (!overlayGate.acquire(SHORTS_RECIPE_GATE_ID, OVERLAY_PRIORITY.shortsRecipe)) return;
      openingOverlayRef.current = true;
      recipeOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const snapshot = captureSnapshot(short);
      const baseHash = typeof window !== 'undefined' ? window.location.hash.replace(/[?&]make=1(?=&|$)/, '').replace(/[?&]$/, '') : '';
      overlayBaseHash.current = baseHash;
      transitionController({ type: 'overlay-open' });
      pausePlayersExcept(null);
      setVisibleIndex(-1);
      visibleIndexRef.current = -1;
      wasPlayingRef.current = snapshot.wasPlaying;
      setRecipeOverlay({ short, snapshot });
      setRecipes([]);
      setRecipesLoading(true);
      setRecipesError(false);
      session.current.recipeClicks += 1;
      if (typeof window !== 'undefined') {
        const separator = baseHash.includes('?') ? '&' : '?';
        const nextHash = `${baseHash}${separator}make=1`;
        const currentState = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
        window.history.pushState({ ...currentState, pubcrawlShortsOverlay: snapshot }, '', nextHash);
        try { window.sessionStorage.setItem(SHORTS_SNAPSHOT_KEY, JSON.stringify(snapshot)); } catch {}
      }
      queryLocalRecipes({ q: short.recipeQuery, limit: 3, seed: short.id })
        .catch(() => fetchRecipes({ q: short.recipeQuery!, limit: 3, seed: short.id }))
        .then((result) => setRecipes(result.recipes))
        .catch(() => setRecipesError(true))
        .finally(() => {
          openingOverlayRef.current = false;
          setRecipesLoading(false);
        });
    },
    [captureSnapshot, pausePlayersExcept, transitionController]
  );

  const closeRecipeOverlay = useCallback((fromDirectGesture = false) => {
    const snapshot = overlayRef.current?.snapshot;
    if (!snapshot || overlayRestoredRef.current) return;
    overlayRestoredRef.current = true;
    openingOverlayRef.current = false;
    setRecipeOverlay(null);
    overlayGate.release(SHORTS_RECIPE_GATE_ID);
    clearShortsOverlaySnapshot();
    if (typeof window !== 'undefined' && window.location.hash.includes('make=1')) {
      const rest = window.history.state && typeof window.history.state === 'object' ? { ...(window.history.state as Record<string, unknown>) } : {};
      delete rest.pubcrawlShortsOverlay;
      window.history.replaceState(rest, '', overlayBaseHash.current || window.location.hash.replace(/[?&]make=1(?=&|$)/, '').replace(/[?&]$/, ''));
    }
    restoreSnapshot(snapshot, fromDirectGesture);
    recipeOpenerRef.current?.focus();
    window.setTimeout(() => { overlayRestoredRef.current = false; }, 0);
  }, [restoreSnapshot]);

  const continueToBar = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay || !onContinueToBar) return;
    const snapshot = overlay.snapshot;
    setRecipeOverlay(null);
    openingOverlayRef.current = false;
    overlayRestoredRef.current = true;
    overlayGate.release(SHORTS_RECIPE_GATE_ID);
    clearShortsOverlaySnapshot();
    if (typeof window !== 'undefined') {
      const baseHash = overlayBaseHash.current || window.location.hash.replace(/&make=1$/, '');
      // Keep the history entry immediately before the Menu explicitly
      // resumable. This matters when the user presses browser/mobile Back
      // instead of tapping BACK TO SHORT: a nav-sourced visit must not be
      // mistaken for a brand-new random Shorts visit.
      const returnHash = /([?&])src=[^&]*/.test(baseHash)
        ? baseHash.replace(/([?&])src=[^&]*/, '$1src=return')
        : `${baseHash}${baseHash.includes('?') ? '&' : '?'}src=return`;
      overlayBaseHash.current = returnHash;
      const rest = window.history.state && typeof window.history.state === 'object' ? { ...(window.history.state as Record<string, unknown>) } : {};
      delete rest.pubcrawlShortsOverlay;
      window.history.replaceState(rest, '', returnHash);
    }
    transitionController({ type: 'route-inactive' });
    onContinueToBar(snapshot);
    // `continueToBar` leaves this component mounted while App changes routes.
    // Clear the idempotence guard on the next turn so a later Shorts visit can
    // close its own overlay normally.
    window.setTimeout(() => { overlayRestoredRef.current = false; }, 0);
  }, [onContinueToBar, transitionController]);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetchShorts()
      .then((remote) => {
        if (!alive || !Array.isArray(remote?.shorts)) return;
        setData(remote);
      })
      .catch(() => {
        if (alive && SHORTS_SEED.length === 0) setError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // A fresh route entry gets a new random order. A return from the Menu keeps
  // the captured order so the next swipe is exactly where the drinker left it.
  useLayoutEffect(() => {
    if (active && !visitStarted.current) {
      overlayLoadedRef.current = false;
      overlayRestoredRef.current = false;
      const persistedOverlay = typeof window !== 'undefined' && window.location.hash.includes('make=1') ? readShortsOverlaySnapshot() : null;
      const canResume = Boolean(returnState && initialId && returnState.videoId === initialId && source !== 'nav');
      const capturedState = persistedOverlay || (canResume ? returnState : null);
      if (capturedState) {
        orderIdsRef.current = [...capturedState.order];
        pendingRestoreRef.current = capturedState;
        overlayResumeRef.current = persistedOverlay ? false : (capturedState.resumeIntent === 'autoplay' || capturedState.wasPlaying);
        setOrderRevision((revision) => revision + 1);
        if (!persistedOverlay) onReturnConsumed?.();
      } else {
        pendingRestoreRef.current = null;
        overlayResumeRef.current = null;
        if (orderRevision === 0 && orderIdsRef.current.length) {
          // The first render already used a cryptographically random seed.
          // Re-shuffling that keyed list during route entry makes browser
          // scroll anchoring follow the old first card to its new position,
          // sometimes jumping dozens of Shorts before playback begins.
          setOrderRevision(1);
        } else {
          const nextSeed = randomSeed();
          orderIdsRef.current = shuffleWithSeed(data.shorts, nextSeed).map((short) => short.id);
          setOrderSeed(nextSeed);
          setOrderRevision((revision) => revision + 1);
        }
      }
      visitStarted.current = true;
      sourceRef.current = sourceLabel(source);
      sent.current = false;
      session.current = blankSession();
      started.current.clear();
      failedIdsRef.current.clear();
      retryCountsRef.current.clear();
      startCommandsRef.current.clear();
      forcedMutedLeaseRef.current = null;
      setError(false);
      setConfigError(false);
      cancelSoundSync();
      const nextPlaybackMode = preferredPlaybackMode();
      setPlaybackMode(nextPlaybackMode);
      setManualIndex(null);
      setBlockedIndex(null);
      setFailureVersion((version) => version + 1);
      if (!capturedState) overlayResumeRef.current = null;
      const targetId = capturedState ? capturedState.videoId : initialId;
      const target = targetId ? orderIdsRef.current.indexOf(targetId) : 0;
      const safeTarget = target >= 0 ? target : 0;
      // If a deep-link id is not in the build-time seed yet, leave the marker
      // empty so reconciliation can pick it up when the API catalogue arrives.
      // Otherwise the first render would stay on the random seed card and
      // never honour the shared link.
      lastInitialIdRef.current = target >= 0 ? targetId : undefined;
      activeIndexRef.current = safeTarget;
      prepareIndexRef.current = safeTarget;
      visibleIndexRef.current = safeTarget;
      const entered = transitionController({ type: 'route-enter', index: safeTarget });
      if (entered.lease && !soundRef.current.muted) {
        const shortId = orderIdsRef.current[safeTarget];
        if (shortId) forcedMutedLeaseRef.current = `${shortId}:${safeTarget}:${entered.lease.generation}`;
      }
      if (typeof window !== 'undefined' && window.location.hash.includes('make=1')) {
        // The overlay is reconstructed below once the matching catalogue item
        // is available; keep the initial route from acquiring a play lease.
        controllerRef.current = transitionShortsController(entered, { type: 'overlay-open' });
        setControllerPhase('overlay');
      }
      lastScrollTopRef.current = 0;
      scrollDirectionRef.current = 'forward';
      setActiveIndex(safeTarget);
      setPrepareIndex(safeTarget);
      setScrollDirection('forward');
      setVisibleIndex(safeTarget);
      // `orderedShorts` is from the render before this fresh seed/order was
      // committed. Read the ref we just established so the reconciliation
      // effect cannot jump the user back to the old first card.
      activeIdRef.current = orderIdsRef.current[safeTarget] || null;
      requestAnimationFrame(() => {
        const card = feedRef.current?.querySelector<HTMLElement>(`[data-short-index="${safeTarget}"]`);
        if (card && feedRef.current) scrollFeedToCard(feedRef.current, card, 'auto');
      });
    }
  }, [active, cancelSoundSync, data.shorts, initialId, onReturnConsumed, orderRevision, orderedShorts, returnState, source, transitionController]);

  // Route exit is the only passive transition that pauses the whole pool.
  // Keep its dependency list intentionally narrow: a hidden Shorts instance
  // may still receive catalogue/API enrichment, and that must never replay a
  // global pause or flush the visit as though the user just navigated away.
  useEffect(() => {
    if (active) return;
    visitStarted.current = false;
    overlayLoadedRef.current = false;
    if (overlayRef.current) {
      setRecipeOverlay(null);
      openingOverlayRef.current = false;
      overlayRestoredRef.current = true;
      overlayGate.release(SHORTS_RECIPE_GATE_ID);
      clearShortsOverlaySnapshot();
    }
    transitionController({ type: 'route-inactive' });
    // Invalidate any gesture authorization and its verification timer before
    // pausing the pool. A delayed YouTube callback must not revive sound or
    // playback after the user has left Shorts.
    cancelSoundSync();
    startCommandsRef.current.clear();
    forcedMutedLeaseRef.current = null;
    pausePlayersExcept(null);
    flushSession();
    wasPlayingRef.current = false;
    setPlayingIndex(null);
  }, [active, cancelSoundSync, flushSession, pausePlayersExcept, transitionController]);

  // A reload can land directly on #/shorts?...&make=1. Rehydrate the modal
  // from history.state/sessionStorage before any player is granted a lease.
  useEffect(() => {
    if (!active || recipeOverlay || overlayLoadedRef.current || typeof window === 'undefined' || !window.location.hash.includes('make=1')) return;
    const snapshot = pendingRestoreRef.current || readShortsOverlaySnapshot();
    const removeInvalidFlag = () => {
      clearShortsOverlaySnapshot();
      const base = window.location.hash.replace(/[?&]make=1(?=&|$)/, '').replace(/[?&]$/, '');
      const state = window.history.state && typeof window.history.state === 'object' ? { ...(window.history.state as Record<string, unknown>) } : {};
      delete state.pubcrawlShortsOverlay;
      window.history.replaceState(state, '', base);
      pendingRestoreRef.current = null;
      overlayResumeRef.current = null;
      transitionController({ type: 'route-enter', index: activeIndexRef.current });
    };
    if (!snapshot || !isShortsReturnState(snapshot)) {
      removeInvalidFlag();
      return;
    }
    const known = new Set(data.shorts.map((short) => short.id));
    const restoredOrder = snapshot.order.filter((id) => known.has(id));
    if (!known.has(snapshot.videoId) || !restoredOrder.length) {
      removeInvalidFlag();
      return;
    }
    // Preserve the visit order before resolving the target index. The first
    // pass may still contain the fresh random order, so wait for this revision.
    const currentIds = orderedShorts.map((short) => short.id);
    const reconciledOrder = reconcileShortsOrder(restoredOrder, currentIds);
    if (currentIds.some((id, index) => id !== reconciledOrder[index])) {
      orderIdsRef.current = reconciledOrder;
      setOrderRevision((revision) => revision + 1);
      return;
    }
    const short = orderedShorts.find((entry) => entry.id === snapshot.videoId);
    if (!short) {
      removeInvalidFlag();
      return;
    }
    const index = orderedShorts.indexOf(short);
    activeIndexRef.current = index;
    prepareIndexRef.current = index;
    visibleIndexRef.current = -1;
    activeIdRef.current = short.id;
    setActiveIndex(index);
    setPrepareIndex(index);
    setVisibleIndex(-1);
    if (!overlayGate.acquire(SHORTS_RECIPE_GATE_ID, OVERLAY_PRIORITY.shortsRecipe)) return;
    transitionController({ type: 'overlay-open' });
    overlayBaseHash.current = window.location.hash.replace(/[?&]make=1(?=&|$)/, '').replace(/[?&]$/, '');
    pendingRestoreRef.current = snapshot;
    overlayLoadedRef.current = true;
    setRecipeOverlay({ short, snapshot });
    setRecipes([]);
    setRecipesLoading(true);
    setRecipesError(false);
    queryLocalRecipes({ q: short.recipeQuery || short.title, limit: 3, seed: short.id })
      .catch(() => fetchRecipes({ q: short.recipeQuery || short.title, limit: 3, seed: short.id }))
      .then((result) => setRecipes(result.recipes))
      .catch(() => setRecipesError(true))
      .finally(() => setRecipesLoading(false));
  }, [active, data.shorts, orderedShorts, recipeOverlay, transitionController]);

  // Browsers are allowed to restore an element's scroll position before React
  // mounts its scroll listener (notably after a reload or a PWA resume). In
  // that case there is no scroll event to drive the normal settle path, so
  // explicitly re-assert the settled lease and visible card once the ordered
  // catalogue has committed. This is a no-op during a real gesture or recipe
  // overlay and prevents a blank, non-active feed until the next swipe.
  useLayoutEffect(() => {
    if (!active || !orderedShorts.length || recipeOverlay || typeof window === 'undefined' || window.location.hash.includes('make=1')) return;
    if (document.visibilityState === 'hidden' || controllerRef.current.phase === 'scrolling') return;
    const index = Math.max(0, Math.min(orderedShorts.length - 1, activeIndexRef.current));
    const lease = controllerRef.current.lease;
    if (controllerRef.current.phase === 'route-inactive' || !lease || lease.index !== index) {
      transitionController({ type: 'scroll-settle', index });
    }
    if (controllerRef.current.phase === 'idle' && visibleIndexRef.current !== index) {
      visibleIndexRef.current = index;
      setVisibleIndex(index);
    }
  }, [active, orderedShorts, recipeOverlay, transitionController]);

  // A deep link can change while the Shorts component stays mounted (for
  // example, a second teaser tap or a shared link opened from the current
  // feed). Reconcile that id explicitly instead of letting the existing visit
  // order win and silently playing a different Short.
  useEffect(() => {
    if (!active || !visitStarted.current || !initialId || initialId === activeIdRef.current) return;
    const index = orderedShorts.findIndex((short) => short.id === initialId);
    lastInitialIdRef.current = initialId;
    if (index < 0) return;
    sourceRef.current = sourceLabel(source);
    overlayResumeRef.current = null;
    setActive(index, false);
    requestAnimationFrame(() => {
      const card = feedRef.current?.querySelector<HTMLElement>(`[data-short-index="${index}"]`);
      if (card && feedRef.current) scrollFeedToCard(feedRef.current, card, 'auto');
    });
  }, [active, initialId, orderedShorts, setActive, source]);

  // Keep the active index valid when the server removes a dead Short during a
  // metadata refresh, without reshuffling the surviving visit.
  useEffect(() => {
    // The first active render deliberately replaces the initial random seed
    // in a layout effect. Passive effects from that render still carry the
    // pre-replacement `orderedShorts` array; waiting for the committed order
    // prevents its stale index lookup from jumping a fresh visit to a random
    // card before the first scroll.
    if (!orderedShorts.length || orderRevision === 0) return;
    const currentId = activeIdRef.current;
    const next = currentId ? orderedShorts.findIndex((short) => short.id === currentId) : -1;
    if (next >= 0 && next !== activeIndexRef.current) {
      activeIndexRef.current = next;
      visibleIndexRef.current = next;
      setActiveIndex(next);
      setVisibleIndex(next);
    } else if (currentId && next < 0) {
      // The refresh endpoint may remove the currently visible id after a
      // confirmed YouTube takedown. Keep the visit order and land on the card
      // occupying that slot instead of leaving a stale hash/player visible.
      const fallback = Math.min(activeIndexRef.current, orderedShorts.length - 1);
      if (fallback >= 0) setActive(fallback, false);
    } else if (activeIndexRef.current >= orderedShorts.length) {
      setActive(orderedShorts.length - 1, false);
    }
  }, [orderRevision, orderedShorts, setActive]);

  // One scroll state machine owns activation. A meaningful movement revokes
  // the current lease in the same task; only the nearest card after native
  // scrollend, a stable touchend, or the single quiet fallback receives one.
  useEffect(() => {
    const root = feedRef.current;
    if (!active || !root || !orderedShorts.length) return;
    let frame = 0;
    let lastTop = root.scrollTop;
    let touchActive = false;
    let lastScrollAt = performance.now();
    let lastScrollDelta = 0;
    const clearSettle = () => {
      if (settleTimerRef.current != null) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    };
    const cardIndexAtRest = () => {
      const feedTop = root.getBoundingClientRect().top;
      const cards = [...root.querySelectorAll<HTMLElement>('[data-short-index]')];
      let best = 0;
      let distance = Infinity;
      cards.forEach((card) => {
        const index = Number(card.dataset.shortIndex);
        if (!Number.isInteger(index)) return;
        const next = Math.abs(card.getBoundingClientRect().top - feedTop);
        if (next < distance) {
          best = index;
          distance = next;
        }
      });
      return Math.max(0, Math.min(orderedLengthRef.current - 1, best));
    };
    const commitSettlement = (targetIndex: number, source: ShortsSettleSource) => {
      if (!activeRef.current || overlayRef.current || document.visibilityState === 'hidden' || window.location.hash.includes('make=1')) return null;
      const target = Math.max(0, Math.min(orderedLengthRef.current - 1, Math.round(targetIndex)));
      clearSettle();
      pendingActivationRef.current = null;
      const current = controllerRef.current;
      const hasLease = current.phase === 'idle' && current.lease?.index === target && current.settledIndex === target;
      if (hasLease) {
        visibleIndexRef.current = target;
        setVisibleIndex(target);
        gestureStartTopRef.current = null;
        return current.lease;
      }
      const directGesture = source === 'stable-touchend' || source === 'keyboard';
      const mode = startModeForGesture(soundRef.current.muted, directGesture);
      const lease = setActiveRef.current(target, true, mode);
      if (directGesture && mode === 'gesture-audible' && lease) {
        const player = playersRef.current.get(target);
        if (player) {
          let state: number = YT_PLAYER_STATES.UNSTARTED;
          try { state = player.getPlayerState(); } catch {}
          if (playerReadyForStart(state)) {
            beginAudibleStart(target, lease.generation, player);
          } else {
            demoteAudibleStart(target, lease.generation);
          }
        } else {
          demoteAudibleStart(target, lease.generation);
        }
      }
      gestureStartTopRef.current = null;
      return lease;
    };
    const beginScroll = (direction: ShortsScrollDirection) => {
      if (controllerRef.current.phase === 'scrolling') return;
      transitionController({ type: 'scroll-start', direction });
      // This is deliberately imperative: React's next render must not be the
      // first opportunity for the outgoing iframe to stop playing.
      pausePlayersExcept(null);
      cancelSoundSync();
      setPlayingIndex(null);
      setVisibleIndex(-1);
      visibleIndexRef.current = -1;
      pendingActivationRef.current = null;
      if (activationTimerRef.current != null) {
        window.clearTimeout(activationTimerRef.current);
        activationTimerRef.current = null;
      }
    };
    const updateIntent = () => {
      const top = root.scrollTop;
      const delta = top - lastTop;
      lastScrollDelta = delta;
      lastScrollAt = performance.now();
      const viewport = Math.max(1, root.clientHeight);
      const intent = Math.max(0, Math.min(orderedLengthRef.current - 1, Math.round(top / viewport)));
      if (Math.abs(delta) > 1) {
        if (gestureStartTopRef.current == null) gestureStartTopRef.current = lastTop;
        const start = gestureStartTopRef.current;
        const displacement = top - start;
        const direction: ShortsScrollDirection = displacement < -8 ? 'backward' : displacement > 8 ? 'forward' : delta < 0 ? 'backward' : 'forward';
        // Direction is based on the gesture displacement, not the tiny
        // reverse correction emitted by mandatory snapping.
        if (Math.abs(displacement) > 8 && direction !== scrollDirectionRef.current) {
          scrollDirectionRef.current = direction;
          setScrollDirection(direction);
          transitionController({ type: 'scroll-intent', index: prepareIndexRef.current, direction });
        }
        const settled = controllerRef.current.settledIndex;
        if (shouldRevokeShortsLease(settled, intent, displacement, viewport)) beginScroll(direction);
      }
      lastTop = top;
      if (intent !== prepareIndexRef.current) {
        prepareIndexRef.current = intent;
        setPrepareIndex(intent);
        transitionController({ type: 'scroll-intent', index: intent, direction: scrollDirectionRef.current });
      }
    };
    const scheduleQuietSettlement = () => {
      clearSettle();
      const target = cardIndexAtRest();
      pendingActivationRef.current = target;
      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = null;
        commitSettlement(cardIndexAtRest(), 'quiet-fallback');
      }, 120);
    };
    const onScroll = () => {
      if (!active || overlayRef.current || (typeof window !== 'undefined' && window.location.hash.includes('make=1'))) {
        clearSettle();
        return;
      }
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        updateIntent();
        // Never settle an intermediate card while a finger is down. Once the
        // browser has released the gesture, one 120ms quiet timer is enough
        // for engines that do not implement native scrollend.
        if (!touchActive) scheduleQuietSettlement();
      });
    };
    const flushScrollFrame = () => {
      if (!frame) return;
      cancelAnimationFrame(frame);
      frame = 0;
      updateIntent();
    };
    const onScrollEnd = () => {
      if (touchActive || !active || overlayRef.current || (typeof window !== 'undefined' && window.location.hash.includes('make=1'))) return;
      // A browser may deliver scrollend before our queued animation-frame
      // reader. Flush that reader first so it cannot revoke this fresh lease
      // and let the quiet fallback start the same card a second time.
      flushScrollFrame();
      commitSettlement(cardIndexAtRest(), 'native-scrollend');
    };
    const onTouchStart = () => {
      touchActive = true;
      gestureStartTopRef.current = root.scrollTop;
      clearSettle();
    };
    const onTouchEnd = () => {
      touchActive = false;
      flushScrollFrame();
      const target = cardIndexAtRest();
      const feedTop = root.getBoundingClientRect().top;
      const card = root.querySelector<HTMLElement>(`[data-short-index="${target}"]`);
      const cardDistance = card ? Math.abs(card.getBoundingClientRect().top - feedTop) : Infinity;
      const velocity = Math.abs(lastScrollDelta) / Math.max(1, performance.now() - lastScrollAt);
      let playerReady = false;
      const player = playersRef.current.get(target);
      if (player) {
        try {
          const state = player.getPlayerState();
          playerReady = playerReadyForStart(state);
        } catch {}
      }
      const exactlySnapped = cardDistance <= 2;
      const stable = cardDistance <= Math.max(16, root.clientHeight * 0.04)
        && (exactlySnapped || velocity < 0.35)
        && Math.round(root.scrollTop / Math.max(1, root.clientHeight)) === target
        && playerReady;
      if (stable) commitSettlement(target, 'stable-touchend');
      else scheduleQuietSettlement();
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    root.addEventListener('scrollend', onScrollEnd as EventListener, { passive: true });
    root.addEventListener('touchstart', onTouchStart, { passive: true });
    root.addEventListener('touchend', onTouchEnd, { passive: true });
    root.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      root.removeEventListener('scroll', onScroll);
      root.removeEventListener('scrollend', onScrollEnd as EventListener);
      root.removeEventListener('touchstart', onTouchStart);
      root.removeEventListener('touchend', onTouchEnd);
      root.removeEventListener('touchcancel', onTouchEnd);
      if (frame) cancelAnimationFrame(frame);
      clearSettle();
    };
    }, [active, beginAudibleStart, cancelSoundSync, demoteAudibleStart, pausePlayersExcept, transitionController]);

  // YouTube has no volumechange event. Observe the active player only; never
  // use this passive poll to unmute a prepared/newly active iframe.
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      const index = activeIndexRef.current;
      const lease = controllerRef.current.lease;
      const player = playersRef.current.get(index);
      if (!player || !lease || lease.index !== index) return;
      try {
        const muted = Boolean(player.isMuted());
        const volume = Math.max(0, Math.min(100, Math.round(player.getVolume())));
        const key = startCommandKey(index, lease.generation);
        if (!muted) {
          // YouTube exposes no volume event to the parent. An observed unmute
          // on the active iframe is therefore the native control's result.
          forcedMutedLeaseRef.current = null;
          if (soundRef.current.muted || volume !== soundRef.current.volume) persistSoundPreference(false, volume);
        } else if (soundRef.current.muted) {
          if (volume !== soundRef.current.volume) persistSoundPreference(true, volume);
        } else if (forcedMutedLeaseRef.current !== key) {
          // A mute on an audibly playing, non-fallback lease is a native user
          // choice. Forced iOS fallback mutes retain the desired-audible flag.
          persistSoundPreference(true, soundRef.current.volume);
        }
      } catch {
        // Ignore calls while the active iframe is being replaced.
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [active, persistSoundPreference, startCommandKey]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        transitionController({ type: 'hidden' });
        gestureStartTopRef.current = null;
        cancelSoundSync();
        startCommandsRef.current.clear();
        forcedMutedLeaseRef.current = null;
        pausePlayersExcept(null);
        wasPlayingRef.current = false;
        setPlayingIndex(null);
        setVisibleIndex(-1);
      } else if (active && !overlayRef.current) {
        const next = transitionController({ type: 'visible' });
        if (next.phase === 'idle') {
          visibleIndexRef.current = next.settledIndex;
          setVisibleIndex(next.settledIndex);
          if (next.lease && !soundRef.current.muted) {
            forcedMutedLeaseRef.current = startCommandKey(next.lease.index, next.lease.generation);
          }
        }
      }
    };
    const restoreFromHistory = () => {
      if (!window.location.hash.includes('make=1') && overlayRef.current) {
        closeRecipeOverlay();
      }
    };
    const onHash = () => restoreFromHistory();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flushSession);
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flushSession);
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onHash);
    };
  }, [active, cancelSoundSync, closeRecipeOverlay, flushSession, pausePlayersExcept, startCommandKey, transitionController]);

  // Only final unmount is allowed to tear down every iframe. Metadata/API
  // enrichment and callback changes must not pause a healthy active player.
  useEffect(() => () => {
    pausePlayersExcept(null);
    cancelSoundSync();
    flushSession();
  }, [cancelSoundSync, flushSession, pausePlayersExcept]);

  useEffect(() => {
    if (!recipeOverlay) return;
    const restoreInert = setBackgroundInert(true, '.shorts-recipe-backdrop');
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRecipeOverlay(true);
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = document.querySelector<HTMLElement>('.shorts-recipe-dialog');
      const focusable = Array.from(dialog?.querySelectorAll<HTMLElement>('button, a, input, [tabindex]:not([tabindex="-1"])') || []).filter((element) => !element.hasAttribute('disabled'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    recipeCloseRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      restoreInert();
    };
  }, [closeRecipeOverlay, recipeOverlay]);

  if (error)
    return (
      <section className="shorts-page shorts-state">
        <p className="err" role="alert">The Shorts shelf is still waking up. Try again in a moment.</p>
      </section>
    );

  if (!orderedShorts.length)
    return (
      <section className="shorts-page shorts-state">
        <p className="empty-big">THE FIRST POUR IS COMING.</p>
        <p className="k-label dim">WE’RE CURATING THE FIRST 60 SHORTS BEFORE THIS SHELF OPENS.</p>
      </section>
    );

  const activeLease: PlayerLease | null = controllerRef.current.lease;

  return (
    <section className="shorts-page" aria-label="Shorts">
      <div
        ref={feedRef}
        className="shorts-feed"
        tabIndex={0}
        aria-label="Shorts feed. Scroll vertically for the next video."
        data-tour="shorts-feed"
        data-controller-phase={controllerPhase}
        data-controller-active={activeIndex}
        data-controller-visible={visibleIndex}
        data-controller-lease={activeLease ? `${activeLease.index}:${activeLease.generation}` : ''}
        aria-hidden={recipeOverlay ? true : undefined}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || recipeOverlay) return;
          const forward = event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === ' ';
          const backward = event.key === 'ArrowUp' || event.key === 'PageUp';
          if (!forward && !backward && event.key !== 'Home' && event.key !== 'End') return;
          event.preventDefault();
          const next = event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? orderedShorts.length - 1
              : Math.max(0, Math.min(orderedShorts.length - 1, activeIndexRef.current + (forward ? 1 : -1)));
          const card = feedRef.current?.querySelector<HTMLElement>(`[data-short-index="${next}"]`);
          if (card && feedRef.current) scrollFeedToCard(feedRef.current, card, 'smooth');
          const mode = startModeForGesture(soundRef.current.muted, true);
          const lease = setActiveRef.current(next, true, mode);
          if (mode === 'gesture-audible' && lease) {
            const player = playersRef.current.get(next);
            if (player) {
              let state: number = YT_PLAYER_STATES.UNSTARTED;
              try { state = player.getPlayerState(); } catch {}
              if (playerReadyForStart(state)) beginManualStart(next, lease.generation, player);
              else demoteAudibleStart(next, lease.generation);
            } else {
              demoteAudibleStart(next, lease.generation);
            }
          }
        }}
      >
        {orderedShorts.map((short, index) => {
          const isVisible = controllerPhase === 'idle' && activeLease?.index === index && visibleIndex === index && activeIndex === index;
          const failed = failureVersion >= 0 && failedIdsRef.current.has(short.id);
          const renderContent = contentIndices.has(index);
          if (!renderContent) {
            return <article className="shorts-card shorts-card-placeholder" data-short-index={index} key={short.id} aria-hidden="true" />;
          }
          const enabled = active && online && !failed && playerIndices.has(index);
          const shouldPlay = active && isVisible && activeLease?.index === index && !recipeOverlay && overlayResumeRef.current !== false && online && !failed && (playbackMode !== 'manual' || manualIndex === index) && blockedIndex !== index;
          const playLeaseGeneration = shouldPlay && activeLease?.index === index ? activeLease.generation : null;
          return (
            <article
              className={`shorts-card ${isVisible ? 'is-active' : ''}`}
              data-short-index={index}
              data-short-id={short.id}
              data-lease-generation={activeLease?.index === index ? activeLease.generation : ''}
              key={short.id}
            >
              <div className={`shorts-stage ${short.recipeQuery ? 'has-recipe' : ''}`}>
                <div className="shorts-visual">
                  <div className="shorts-player-frame">
                    <ShortPlayerHost
                      index={index}
                      short={short}
                      enabled={enabled}
                      initPriority={shortsInitPriority(index, activeIndex, prepareIndex, scrollDirection)}
                      shouldPlay={shouldPlay}
                      manualMode={playbackMode === 'manual'}
                      manualToken={manualToken}
                      playLeaseGeneration={playLeaseGeneration}
                      startAuthorization={startAuthorization}
                      muted={soundRef.current.muted}
                      volume={soundRef.current.volume}
                      online={online}
                      failed={failed}
                      onManual={(target) => {
                        if (!online) return;
                        const card = feedRef.current?.querySelector<HTMLElement>(`[data-short-index="${target}"]`);
                        if (card && feedRef.current && target !== activeIndexRef.current) scrollFeedToCard(feedRef.current, card, 'smooth');
                        const mode = startModeForGesture(soundRef.current.muted, true);
                        const lease = setActive(target, false, mode);
                        if (lease) {
                          const player = playersRef.current.get(target);
                          if (player) {
                            let state: number = YT_PLAYER_STATES.UNSTARTED;
                            try { state = player.getPlayerState(); } catch {}
                            if (playerReadyForStart(state)) beginManualStart(target, lease.generation, player);
                            else if (mode === 'gesture-audible') demoteAudibleStart(target, lease.generation);
                          } else if (mode === 'gesture-audible') {
                            demoteAudibleStart(target, lease.generation);
                          }
                        }
                        overlayResumeRef.current = null;
                        setManualIndex(target);
                        setManualToken((token) => token + 1);
                      }}
                      onRegister={registerPlayer}
                      onUnregister={unregisterPlayer}
                      onPlaying={handlePlaying}
                      onCued={handleCued}
                      onBuffering={handleBuffering}
                      onError={handlePlayerError}
                      onAutoplayBlocked={handleAutoplayBlocked}
                      onPlaybackRateChange={handlePlaybackRateChange}
                      onClaimStart={claimStartCommand}
                      onStartProgress={markStartProgress}
                      onRequestInitialize={requestPlayerInitialization}
                    />
                  </div>
                  {isVisible && (
                    <div className="shorts-top-overlay" aria-label="Short navigation">
                      <button type="button" className="shorts-overlay-action" onClick={onBack} aria-label="Back" title="Back">
                        <ArrowLeft size={20} />
                      </button>
                      <ContextualHelp tour="shorts" className="shorts-overlay-action shorts-help" />
                    </div>
                  )}
                  {isVisible && (
                    <ShortsSpeedHold
                      enabled={active && playingIndex === index && !recipeOverlay}
                      rate={playbackRate}
                      player={playersRef.current.get(index) || null}
                    />
                  )}
                  {isVisible && (
                    <div className="shorts-player-rail" aria-label="Short actions" data-tour="shorts-actions">
                      <button
                        type="button"
                        className={`shorts-overlay-action ${shared !== 'idle' ? 'shorts-shared' : ''}`}
                        onClick={() => {
                          void (async () => {
                            const outcome = await shareContent(`${short.title} · The PubCrawl`, shortShareText(short.title, short.channel, short.id));
                            session.current.shares += 1;
                            if (outcome === 'copied' || outcome === 'failed') {
                              setShared(outcome);
                              window.setTimeout(() => setShared('idle'), 1600);
                            }
                          })();
                        }}
                        aria-label={shared === 'copied' ? 'Link copied' : shared === 'failed' ? 'Share blocked' : 'Share'}
                        title={shared === 'copied' ? 'Link copied' : 'Share'}
                      >
                        {shared === 'copied' ? <Check size={20} /> : <Share size={20} />}
                      </button>
                      {short.recipeQuery && (
                        <button type="button" className="shorts-action shorts-make" onClick={() => openRecipeOverlay(short)}>
                          MAKE THIS <ArrowRight size={13} />
                        </button>
                      )}
                    </div>
                  )}
                </div>

              </div>
            </article>
          );
        })}
      </div>

      {recipeOverlay && (
        <div
          className="shorts-recipe-backdrop"
          onMouseDown={(event) => event.target === event.currentTarget && closeRecipeOverlay(true)}
          onWheel={(event) => {
            if (event.target === event.currentTarget) event.preventDefault();
          }}
        >
          <div
            className="shorts-recipe-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shorts-recipe-title"
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closeRecipeOverlay(true);
              }
            }}
          >
            <header className="shorts-recipe-dialog-head">
              <div>
                <span className="k-label">MAKE THIS</span>
                <h2 id="shorts-recipe-title">{recipeOverlay.short.recipeQuery}</h2>
              </div>
              <button ref={recipeCloseRef} className="shorts-recipe-close" type="button" onClick={() => closeRecipeOverlay(true)} aria-label="Close recipes">
                <X size={20} />
              </button>
            </header>

            {recipesLoading ? (
              <div className="shorts-recipe-loading" aria-label="Loading recipes">
                <span /><span /><span />
              </div>
            ) : recipesError ? (
              <div className="shorts-recipe-empty" role="alert">
                <p className="empty-big">THE BAR IS WAKING.</p>
                <p className="k-label dim">CLOSE THIS CARD OR CONTINUE TO THE FULL MENU.</p>
              </div>
            ) : recipes.length ? (
              <div className="shorts-recipe-track" aria-label="Related recipes">
                {recipes.map((recipe, index) => (
                  <ShortRecipeCard
                    key={recipe.id}
                    recipe={recipe}
                    index={index}
                    vibe={recipeVibe(recipe)}
                    onToggleTab={onToggleRecipeTab}
                    inTab={recipeTabIds.has(recipe.id)}
                    likes={recipeLikes[recipe.id] || 0}
                    liked={recipeLikedIds.has(recipe.id)}
                    onToggleLike={onToggleRecipeLike}
                    onKeep={onKeepRecipe}
                  />
                ))}
              </div>
            ) : (
              <div className="shorts-recipe-empty">
                <p className="empty-big">NO MATCHES YET.</p>
                <p className="k-label dim">THE FULL BAR MAY HAVE A POUR FOR THIS SHORT.</p>
              </div>
            )}

            <footer className="shorts-recipe-dialog-foot">
              <button type="button" className="btn btn-solid" onClick={continueToBar}>
                CONTINUE TO THE BAR <ArrowRight size={14} />
              </button>
              <span className="k-label dim">YOUR SHORT IS PAUSED · CLOSE TO KEEP SCROLLING</span>
            </footer>
          </div>
        </div>
      )}

      {configError && !recipeOverlay && (
        <div className="shorts-config-toast" role="status">
          PLAYER CONNECTION INTERRUPTED · TRY AGAIN WHEN THE CONNECTION RETURNS
        </div>
      )}
    </section>
  );
}

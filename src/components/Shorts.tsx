import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { fetchRecipes, fetchShorts, postShortSession } from '../api';
import type { Recipe, ShortLibrary, ShortsReturnState, ShortVideo, Vibe, WatchLane } from '../types';
import { applySound, createYouTubePlayer, YT_PLAYER_STATES, type YouTubePlayer } from '../shortsPlayer';
import { ArrowLeft, ArrowRight, Check, GlassIcon, Play, Share, X } from '../icons';
import { shareContent, shortShareText } from '../share';
import { formatMeasure } from '../measure';
import { SHORTS_SEED, thumbnailForShort } from '../shortsData';
import { RecipeCardActions } from './RecipeCard';
import {
  createShortsControllerState,
  leaseMatches,
  shortsPreparationPriority,
  shortsContentWindow,
  shortsPlayerWindow,
  transitionShortsController,
  type PlayerLease,
  type ShortsControllerPhase,
  type ShortsControllerState,
} from '../shortsController';

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

function shortLabel(duration: number) {
  const mins = Math.floor(duration / 60);
  const secs = Math.round(duration % 60).toString().padStart(2, '0');
  return mins ? `${mins}:${secs}` : `0:${secs}`;
}

const SHORTS_SNAPSHOT_VERSION = 2 as const;
const SHORTS_SNAPSHOT_KEY = 'pubcrawl.shorts.overlay.v2';

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

interface ShortsTeaserProps {
  active?: boolean;
}

/** Six randomized build-time facades for the landing page; never creates an iframe. */
export function ShortsTeaser({ active = true }: ShortsTeaserProps) {
  const [seed, setSeed] = useState(randomSeed);
  const wasActive = useRef(active);
  const trackRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (active && !wasActive.current) setSeed(randomSeed());
    wasActive.current = active;
  }, [active]);
  useLayoutEffect(() => {
    trackRef.current?.scrollTo({ left: 0, behavior: 'auto' });
  }, [seed]);
  const picks = useMemo(() => shuffleWithSeed(SHORTS_SEED, seed).slice(0, 6), [seed]);
  if (!picks.length) return null;
  return (
    <section className="shorts-teaser" aria-labelledby="shorts-teaser-title">
      <div className="shorts-teaser-head">
        <span id="shorts-teaser-title" className="k-label">SHORTS / QUICK POURS</span>
        <a className="text-btn" href="#/shorts?src=landing">SEE ALL <ArrowRight size={12} /></a>
      </div>
      <div className="shorts-teaser-track" ref={trackRef}>
        {picks.map((short, index) => (
          <a className="shorts-teaser-card" href={`#/shorts?v=${encodeURIComponent(short.id)}&src=landing`} key={short.id}>
            <span className="shorts-teaser-image">
              <img src={thumbnailForShort(short)} alt="" loading={index < 2 ? 'eager' : 'lazy'} decoding="async" />
              <span className="shorts-teaser-play" aria-hidden="true"><Play size={16} /></span>
              <span className="k-label shorts-teaser-duration">{shortLabel(short.durationSeconds)}</span>
            </span>
            <span className="shorts-teaser-copy">
              <strong>{short.title}</strong>
              <span className="k-label dim">{short.channel}</span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
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

interface ShortPlayerHostProps {
  index: number;
  short: ShortVideo;
  enabled: boolean;
  initPriority: number;
  shouldPlay: boolean;
  manualMode: boolean;
  manualToken: number;
  playLeaseGeneration: number | null;
  muted: boolean;
  volume: number;
  online: boolean;
  failed: boolean;
  onManual: (index: number) => void;
  onRegister: (index: number, player: YouTubePlayer) => void;
  onUnregister: (index: number, player: YouTubePlayer) => void;
  onPlaying: (index: number, generation: number | null, startupMs: number, player: YouTubePlayer) => void;
  onCued: (index: number, generation: number | null, player: YouTubePlayer) => void;
  onBuffering: (index: number, generation: number | null) => void;
  onError: (index: number, generation: number | null, code: number) => void;
  onAutoplayBlocked: (index: number, generation: number | null) => void;
  onPlaybackRateChange: (index: number, generation: number | null, rate: number) => void;
  onRequestInitialize: (index: number, priority: number, start: () => Promise<void>) => InitializationLease;
}

type InitializationLease = (() => void) & { updatePriority: (priority: number) => void };

type ShortPlayerPhase = 'initializing' | 'cued' | 'starting' | 'confirming' | 'playing' | 'blocked' | 'stalled';

const STARTUP_REVEAL_DELAY_MS = 220;
const STARTUP_REVEAL_TIME_SECONDS = 0.08;
const STARTUP_REBUFFER_CUTOFF_SECONDS = 0.75;

/** A slide owns its player shell; the parent decides which directional pool slots stay mounted. */
function ShortPlayerHost({
  index,
  short,
  enabled,
  initPriority,
  shouldPlay,
  manualMode,
  manualToken,
  playLeaseGeneration,
  muted,
  volume,
  online,
  failed,
  onManual,
  onRegister,
  onUnregister,
  onPlaying,
  onCued,
  onBuffering,
  onError,
  onAutoplayBlocked,
  onPlaybackRateChange,
  onRequestInitialize,
}: ShortPlayerHostProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const initializationLeaseRef = useRef<InitializationLease | null>(null);
  const shouldPlayRef = useRef(shouldPlay);
  const leaseGenerationRef = useRef<number | null>(playLeaseGeneration);
  const mutedRef = useRef(muted);
  const volumeRef = useRef(volume);
  const onRegisterRef = useRef(onRegister);
  const onUnregisterRef = useRef(onUnregister);
  const onPlayingRef = useRef(onPlaying);
  const onCuedRef = useRef(onCued);
  const onBufferingRef = useRef(onBuffering);
  const onErrorRef = useRef(onError);
  const onAutoplayBlockedRef = useRef(onAutoplayBlocked);
  const onPlaybackRateChangeRef = useRef(onPlaybackRateChange);
  const onRequestInitializeRef = useRef(onRequestInitialize);
  const requestStartedAt = useRef<number | null>(null);
  const startupTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const confirmPlaybackRef = useRef<(player: YouTubePlayer, generation: number | null) => void>(() => {});
  const playRequestRef = useRef(false);
  const cueIssuedRef = useRef(false);
  const cuedRef = useRef(false);
  const playbackConfirmedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [cued, setCued] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [phase, setPhase] = useState<ShortPlayerPhase>('initializing');

  shouldPlayRef.current = shouldPlay;
  leaseGenerationRef.current = playLeaseGeneration;
  mutedRef.current = muted;
  volumeRef.current = volume;
  onRegisterRef.current = onRegister;
  onUnregisterRef.current = onUnregister;
  onPlayingRef.current = onPlaying;
  onCuedRef.current = onCued;
  onBufferingRef.current = onBuffering;
  onErrorRef.current = onError;
  onAutoplayBlockedRef.current = onAutoplayBlocked;
  onPlaybackRateChangeRef.current = onPlaybackRateChange;
  onRequestInitializeRef.current = onRequestInitialize;

  useEffect(() => {
    initializationLeaseRef.current?.updatePriority(initPriority);
  }, [initPriority]);

  useEffect(() => {
    let disposed = false;
    const clearStartupTimer = () => {
      if (startupTimerRef.current != null) {
        window.clearTimeout(startupTimerRef.current);
        startupTimerRef.current = null;
      }
    };
    const clearRetryTimer = () => {
      if (retryTimerRef.current != null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
    const clearRevealTimer = () => {
      if (revealTimerRef.current != null) {
        window.clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };

    const confirmPlayback = (player: YouTubePlayer, generation: number | null) => {
      clearRevealTimer();
      revealTimerRef.current = window.setTimeout(() => {
        revealTimerRef.current = null;
        if (disposed || !shouldPlayRef.current || leaseGenerationRef.current !== generation) return;
        try {
          const state = player.getPlayerState();
          const currentTime = Math.max(0, player.getCurrentTime() || 0);
          if (state === YT_PLAYER_STATES.PLAYING && currentTime >= STARTUP_REVEAL_TIME_SECONDS) {
            playbackConfirmedRef.current = true;
            setPhase('playing');
            setRevealed(true);
            return;
          }
          if (state === YT_PLAYER_STATES.PLAYING) confirmPlayback(player, generation);
        } catch {
          // A later state event retries confirmation while the iframe settles.
        }
      }, STARTUP_REVEAL_DELAY_MS);
    };
    confirmPlaybackRef.current = confirmPlayback;

    if (!enabled || !online || failed || !hostRef.current) {
      clearStartupTimer();
      clearRetryTimer();
      clearRevealTimer();
      const old = playerRef.current;
      if (old) {
        onUnregisterRef.current(index, old);
        old.destroy();
        playerRef.current = null;
      }
      setReady(false);
      setCued(false);
      setRevealed(false);
      setPhase('initializing');
      playRequestRef.current = false;
      cueIssuedRef.current = false;
      cuedRef.current = false;
      playbackConfirmedRef.current = false;
      return;
    }

    let created: YouTubePlayer | null = null;
    let cancelQueued: InitializationLease | null = null;
    let releaseInitialization = () => {};
    // YouTube mutates the element passed to YT.Player. Give it a DOM shell
    // React does not reconcile so StrictMode/effect teardown cannot race the
    // iframe API's own child removal.
    const mount = document.createElement('div');
    hostRef.current.appendChild(mount);
    setReady(false);
    setCued(false);
    setRevealed(false);
    setAutoplayBlocked(false);
    setPhase('initializing');
    playRequestRef.current = false;
    cueIssuedRef.current = false;
    cuedRef.current = false;
    playbackConfirmedRef.current = false;

    const start = async () => {
      const initialized = new Promise<void>((resolve) => {
        releaseInitialization = resolve;
      });
      try {
        // Build a shell first. The reviewed id is cued exactly once from
        // onReady; this avoids YouTube racing an implicit loadVideoById call.
        await createYouTubePlayer(mount, undefined, {
          onReady: (player) => {
            if (disposed) {
              releaseInitialization();
              player.destroy();
              return;
            }
            created = player;
            playerRef.current = player;
            const iframe = mount.querySelector('iframe');
            iframe?.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
            onRegisterRef.current(index, player);
            // All automatic starts are muted. The parent restores the session
            // preference only after YouTube confirms PLAYING.
            try {
              player.setVolume(volumeRef.current);
              player.mute();
            } catch {}
            if (!cueIssuedRef.current) {
              cueIssuedRef.current = true;
              player.cueVideoById(short.id);
            }
            setReady(true);
            releaseInitialization();
          },
          onStateChange: (player, state) => {
            if (state === YT_PLAYER_STATES.PLAYING) {
              clearStartupTimer();
              clearRetryTimer();
              playRequestRef.current = true;
              const generation = leaseGenerationRef.current;
              if (playbackConfirmedRef.current) {
                setPhase('playing');
                setRevealed(true);
              } else {
                setPhase('confirming');
                confirmPlayback(player, generation);
              }
              const startedAt = requestStartedAt.current;
              requestStartedAt.current = null;
              onPlayingRef.current(index, generation, startedAt == null ? 0 : Math.max(0, Math.round(performance.now() - startedAt)), player);
            } else if (state === YT_PLAYER_STATES.BUFFERING) {
              clearRevealTimer();
              try {
                const currentTime = Math.max(0, player.getCurrentTime() || 0);
                if (!playbackConfirmedRef.current || currentTime < STARTUP_REBUFFER_CUTOFF_SECONDS) {
                  playbackConfirmedRef.current = false;
                  setRevealed(false);
                }
              } catch {
                if (!playbackConfirmedRef.current) setRevealed(false);
              }
              // Buffering is progress, not a retry condition. Never interrupt
              // this player with a second play command.
              setPhase('starting');
              onBufferingRef.current(index, leaseGenerationRef.current);
            } else if (state === YT_PLAYER_STATES.CUED) {
              cuedRef.current = true;
              setCued(true);
              setPhase('cued');
              onCuedRef.current(index, leaseGenerationRef.current, player);
            } else if (state === YT_PLAYER_STATES.PAUSED && !shouldPlayRef.current) {
              // YouTube can emit PAUSED after the parent has already revoked
              // a lease. Keep the DOM phase honest so a stopped neighbour is
              // never mistaken for a second concurrently playing player.
              setPhase(cuedRef.current ? 'cued' : 'initializing');
              setRevealed(false);
            } else if (state === YT_PLAYER_STATES.ENDED && shouldPlayRef.current && leaseGenerationRef.current != null && cuedRef.current) {
              player.seekTo(0, true);
              player.playVideo();
            }
          },
          onError: (_player, code) => {
            releaseInitialization();
            clearStartupTimer();
            clearRetryTimer();
            clearRevealTimer();
            setRevealed(false);
            if (code === 153) setPhase('blocked');
            onErrorRef.current(index, leaseGenerationRef.current, code);
          },
          onAutoplayBlocked: () => {
            releaseInitialization();
            clearStartupTimer();
            clearRetryTimer();
            clearRevealTimer();
            setAutoplayBlocked(true);
            setPhase('blocked');
            onAutoplayBlockedRef.current(index, leaseGenerationRef.current);
          },
          onPlaybackRateChange: (_player, rate) => onPlaybackRateChangeRef.current(index, leaseGenerationRef.current, rate),
        }, () => disposed);
        // Do not let the queue launch another shell until this one has
        // actually fired onReady (or a terminal callback). The constructor
        // promise resolves before that event in the IFrame API.
        await initialized;
      } catch {
        // A failed API bootstrap is a configuration/network problem, not a
        // dead video. Keep the facade and expose tap-to-play rather than
        // cycling the whole visit into manual mode.
        if (!disposed) {
          setAutoplayBlocked(true);
          setPhase('blocked');
          onErrorRef.current(index, leaseGenerationRef.current, 153);
        }
      }
    };

    cancelQueued = onRequestInitializeRef.current(index, initPriority, start);
    initializationLeaseRef.current = cancelQueued;

    return () => {
      disposed = true;
      cancelQueued?.();
      releaseInitialization();
      clearStartupTimer();
      clearRetryTimer();
      clearRevealTimer();
      playRequestRef.current = false;
      const player = created || playerRef.current;
      if (player) {
        onUnregisterRef.current(index, player);
        player.destroy();
      }
      if (playerRef.current === player) playerRef.current = null;
      initializationLeaseRef.current = null;
      if (mount.parentNode) mount.parentNode.removeChild(mount);
      if (confirmPlaybackRef.current === confirmPlayback) confirmPlaybackRef.current = () => {};
    };
  }, [enabled, failed, index, online, short.id]);

  // Revoking a lease is an imperative boundary: clear delayed commands even
  // before the next state event arrives from the iframe.
  useEffect(() => {
    if (playLeaseGeneration != null) return;
    playRequestRef.current = false;
    if (startupTimerRef.current != null) {
      window.clearTimeout(startupTimerRef.current);
      startupTimerRef.current = null;
    }
    if (retryTimerRef.current != null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (revealTimerRef.current != null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    try {
      playerRef.current?.pauseVideo();
    } catch {}
    setPhase(cuedRef.current ? 'cued' : 'initializing');
  }, [playLeaseGeneration]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !ready) return;
    if (startupTimerRef.current != null) {
      window.clearTimeout(startupTimerRef.current);
      startupTimerRef.current = null;
    }
    if (retryTimerRef.current != null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (!shouldPlay || playLeaseGeneration == null) {
      player.pauseVideo();
      setRevealed(false);
      playbackConfirmedRef.current = false;
      playRequestRef.current = false;
      setPhase(cuedRef.current ? 'cued' : 'initializing');
      return;
    }
    const generation = playLeaseGeneration;
    if (autoplayBlocked && manualToken === 0) return;
    if (manualToken > 0 && autoplayBlocked) setAutoplayBlocked(false);
    // Activation may beat the asynchronous CUED event. Keep the request
    // pending; only CUED is allowed to transition into playVideo.
    playRequestRef.current = true;
    if (!cued) return;
    try {
      const state = player.getPlayerState();
      if (state === YT_PLAYER_STATES.PLAYING) {
        // A harmless lease refresh can happen while YouTube is already
        // playing. Re-arm first-frame confirmation for the current generation
        // instead of waiting for another PLAYING event that may never arrive.
        if (playbackConfirmedRef.current) {
          setPhase('playing');
          setRevealed(true);
        } else {
          setPhase('confirming');
          confirmPlaybackRef.current(player, generation);
        }
        return;
      }
      if (state === YT_PLAYER_STATES.BUFFERING) return;
      // A muted command is autoplay-safe; the parent applies the chosen
      // session sound once PLAYING is confirmed.
      player.setVolume(Math.max(0, Math.min(100, Math.round(volume))));
      player.mute();
    } catch {}
    requestStartedAt.current = performance.now();
    setPhase('starting');
    player.playVideo();
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      if (leaseGenerationRef.current !== generation || !shouldPlayRef.current || !playRequestRef.current || !cuedRef.current) return;
      try {
        const state = player.getPlayerState();
        if (state === YT_PLAYER_STATES.PLAYING || state === YT_PLAYER_STATES.BUFFERING) return;
        if (state === YT_PLAYER_STATES.CUED || state === YT_PLAYER_STATES.PAUSED || state === YT_PLAYER_STATES.UNSTARTED) {
          player.playVideo();
        }
      } catch {}
    }, 1500);
    startupTimerRef.current = window.setTimeout(() => {
      startupTimerRef.current = null;
      if (leaseGenerationRef.current !== generation || !shouldPlayRef.current || revealed || !playRequestRef.current) return;
      try {
        const state = player.getPlayerState();
        if (state === YT_PLAYER_STATES.PLAYING || state === YT_PLAYER_STATES.BUFFERING) return;
      } catch {}
      setPhase('stalled');
      // Keep the facade calm during normal startup, but do not leave a stalled
      // active card in an indefinite waiting state. Six seconds gives the
      // queued iframe and a slow mobile connection room to reach PLAYING while
      // still offering an explicit tap when startup is genuinely stuck.
    }, 6000);
    return () => {
      if (startupTimerRef.current != null) {
        window.clearTimeout(startupTimerRef.current);
        startupTimerRef.current = null;
      }
      if (retryTimerRef.current != null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [autoplayBlocked, cued, manualToken, playLeaseGeneration, ready, shouldPlay, volume]);

  const waitingForAutoplay = shouldPlay && !autoplayBlocked && phase !== 'blocked' && phase !== 'stalled';
  const interactiveFacade = shouldPlay || manualMode || failed || autoplayBlocked || phase === 'blocked' || phase === 'stalled' || !online;
  const facadeLabel = !interactiveFacade
    ? ''
    : !online
      ? 'OFFLINE · RECONNECT TO PLAY'
      : failed
        ? 'SKIPPED'
        : manualMode && !shouldPlay
          ? 'TAP TO PLAY'
          : autoplayBlocked || phase === 'blocked'
            ? 'TAP TO PLAY'
            : phase === 'stalled'
              ? 'TAP TO PLAY · SWIPE TO SKIP'
              : waitingForAutoplay
                ? ''
                : 'TAP TO PLAY';
  const showPlayControl = interactiveFacade && !waitingForAutoplay && !failed;

  return (
    <div
      className={`shorts-player-layer ${revealed ? 'is-revealed' : ''}`}
      data-player-phase={phase}
      data-player-ready={ready ? 'true' : 'false'}
      data-player-cued={cued ? 'true' : 'false'}
    >
      {enabled && online && !failed && <div ref={hostRef} className="shorts-player-host" aria-hidden={!revealed} />}
      {!revealed && (
        <button
          className={`shorts-facade ${online ? '' : 'is-offline'} ${waitingForAutoplay ? 'is-waiting' : ''}`}
          onClick={() => onManual(index)}
          aria-label={online && !failed ? (waitingForAutoplay ? short.title : `Play ${short.title}`) : `${short.title}. ${facadeLabel}`}
          disabled={!online || failed}
        >
          <img src={thumbnailForShort(short)} alt="" loading="eager" decoding="async" />
          {showPlayControl && <span className="shorts-facade-play"><Play size={24} /></span>}
          {facadeLabel && <span className="k-label shorts-tap">{facadeLabel}</span>}
        </button>
      )}
    </div>
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
  const [soundPromptIndex, setSoundPromptIndex] = useState<number | null>(null);
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
  const soundRef = useRef({ muted: true, volume: 100 });
  const soundSyncedRef = useRef(false);
  const soundSyncTokenRef = useRef(0);
  const soundSyncTimersRef = useRef<number[]>([]);
  const playersRef = useRef(new Map<number, YouTubePlayer>());
  const initQueueRef = useRef<Array<{
    index: number;
    priority: number;
    start: () => Promise<void>;
    cancelled: boolean;
    started: boolean;
    released: boolean;
    sequence: number;
  }>>([]);
  const initInFlightRef = useRef(0);
  const initSequenceRef = useRef(0);
  const initDrainScheduledRef = useRef(false);
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
  const setActiveRef = useRef<(next: number, countAdvance?: boolean) => void>(() => {});
  const orderedLengthRef = useRef(0);

  overlayRef.current = recipeOverlay;
  activeRef.current = active;
  activeIndexRef.current = activeIndex;
  prepareIndexRef.current = prepareIndex;
  visibleIndexRef.current = visibleIndex;

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
    () => new Set(shortsPlayerWindow(activeIndex, orderedShorts.length, playbackMode === 'manual' ? 1 : 5)),
    [activeIndex, orderedShorts.length, playbackMode]
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

  const cancelSoundSync = useCallback(() => {
    soundSyncTokenRef.current += 1;
    soundSyncTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    soundSyncTimersRef.current = [];
    soundSyncedRef.current = false;
  }, []);

  const applySoundToPlayers = useCallback(() => {
    const { muted, volume } = soundRef.current;
    playersRef.current.forEach((player) => applySound(player, muted, volume));
  }, []);

  const beginSoundSync = useCallback((index: number, player: YouTubePlayer) => {
    cancelSoundSync();
    const token = soundSyncTokenRef.current;
    const desired = { ...soundRef.current };
    setSoundPromptIndex(null);
    applySound(player, desired.muted, desired.volume);

    const verify = (attempt: number) => {
      if (token !== soundSyncTokenRef.current || index !== activeIndexRef.current) return;
      let observedMuted = desired.muted;
      let observedVolume = desired.volume;
      try {
        observedMuted = Boolean(player.isMuted());
        observedVolume = Math.max(0, Math.min(100, Math.round(player.getVolume())));
      } catch {
        observedMuted = !desired.muted;
      }
      const muteMatches = observedMuted === desired.muted;
      const volumeMatches = desired.muted || Math.abs(observedVolume - desired.volume) <= 2;
      if (muteMatches && volumeMatches) {
        soundSyncedRef.current = true;
        setSoundPromptIndex(null);
        return;
      }
      if (attempt < 3) {
        applySound(player, desired.muted, desired.volume);
        const timer = window.setTimeout(() => verify(attempt + 1), 140 + attempt * 140);
        soundSyncTimersRef.current.push(timer);
        return;
      }
      // A blocked unmute is a per-player browser policy result, not a user
      // decision. Preserve the visit-wide preference and request one gesture.
      if (!desired.muted && observedMuted) {
        soundSyncedRef.current = false;
        setSoundPromptIndex(index);
        return;
      }
      // Volume can be clamped by the native player. Once mute state matches,
      // accept the audible native level and resume normal user-change polling.
      if (muteMatches) {
        soundRef.current = {
          muted: observedMuted,
          volume: observedMuted ? desired.volume : observedVolume,
        };
        soundSyncedRef.current = true;
      }
    };

    const timer = window.setTimeout(() => verify(0), 100);
    soundSyncTimersRef.current.push(timer);
  }, [cancelSoundSync]);

  // Keep iframe bootstrap work bounded. The settled card and the next card in
  // the direction of travel get the first two slots; neighbouring shells wait
  // in this queue and remain facades until a slot is free.
  const drainPlayerInitializations = useCallback(() => {
    initQueueRef.current.sort((a, b) => a.priority - b.priority || a.sequence - b.sequence);
    while (initInFlightRef.current < 2 && initQueueRef.current.length) {
      const task = initQueueRef.current.shift();
      if (!task || task.cancelled) continue;
      task.started = true;
      initInFlightRef.current += 1;
      Promise.resolve(task.start())
        .catch(() => {})
        .finally(() => {
          if (task.released) return;
          task.released = true;
          initInFlightRef.current = Math.max(0, initInFlightRef.current - 1);
          drainPlayerInitializations();
        });
    }
  }, []);

  const requestPlayerInitialization = useCallback(
    (index: number, priority: number, start: () => Promise<void>): InitializationLease => {
      const task = {
        index,
        priority,
        start,
        cancelled: false,
        started: false,
        released: false,
        sequence: initSequenceRef.current++,
      };
      initQueueRef.current.push(task);
      initQueueRef.current.sort((a, b) => a.priority - b.priority || a.sequence - b.sequence);
      if (!initDrainScheduledRef.current) {
        initDrainScheduledRef.current = true;
        queueMicrotask(() => {
          initDrainScheduledRef.current = false;
          drainPlayerInitializations();
        });
      }
      const cancel = (() => {
        task.cancelled = true;
        initQueueRef.current = initQueueRef.current.filter((entry) => entry !== task);
        // A host can disappear while the YouTube API is still loading. Free
        // its scheduler slot immediately; the cancelled start is guarded by
        // the host's disposed flag and will never construct a late iframe.
        if (task.started && !task.released) {
          task.released = true;
          initInFlightRef.current = Math.max(0, initInFlightRef.current - 1);
          drainPlayerInitializations();
        }
      }) as InitializationLease;
      cancel.updatePriority = (nextPriority: number) => {
        if (task.cancelled) return;
        task.priority = Number.isFinite(nextPriority) ? nextPriority : task.priority;
        initQueueRef.current.sort((a, b) => a.priority - b.priority || a.sequence - b.sequence);
        if (!initDrainScheduledRef.current) {
          initDrainScheduledRef.current = true;
          queueMicrotask(() => {
            initDrainScheduledRef.current = false;
            drainPlayerInitializations();
          });
        }
      };
      return cancel;
    },
    [drainPlayerInitializations]
  );

  const pausePlayersExcept = useCallback((keepIndex: number | null = null) => {
    playersRef.current.forEach((player, index) => {
      if (index !== keepIndex) {
        try {
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
    (next: number, countAdvance = true) => {
      // Shorts stays mounted behind every route so its visit can be restored,
      // but no delayed scroll/player callback may mutate the URL after the
      // user has left the route.
      if (!activeRef.current || next < 0 || next >= orderedShorts.length) return;
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
          return;
        }
        const card = feedRef.current?.querySelector<HTMLElement>(`[data-short-index="${target}"]`);
        if (card) feedRef.current?.scrollTo({ top: card.offsetTop, behavior: 'smooth' });
      }
      const previous = activeIndexRef.current;
      const direction: ShortsScrollDirection = target < previous ? 'backward' : 'forward';
      transitionController({ type: 'scroll-settle', index: target });
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
      setSoundPromptIndex(null);
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
    },
    [cancelSoundSync, orderedShorts, pausePlayersExcept, replaceShortHash, transitionController]
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
        // Seek while muted; a playing snapshot restores sound in
        // handlePlaying after the PLAYING event arrives.
        applySound(player, true, snapshot.volume);
        if (snapshot.currentTime > 0) player.seekTo(snapshot.currentTime, true);
        if (phase === 'playing') {
          applySound(player, snapshot.muted, snapshot.volume);
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
          setSoundPromptIndex(null);
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
            if (!player || activeIndexRef.current !== index) return;
            try {
              if (player.getPlayerState() !== YT_PLAYER_STATES.BUFFERING) player.playVideo();
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
          setSoundPromptIndex(null);
          setPlayingIndex(null);
        }
        if (index !== activeIndexRef.current) return;
        const next = findNextPlayable(index);
        if (next >= 0) {
          const card = feedRef.current?.querySelector<HTMLElement>(`[data-short-index="${next}"]`);
          if (card) feedRef.current?.scrollTo({ top: card.offsetTop, behavior: 'smooth' });
          setActive(next);
        } else {
          setError(true);
        }
      }
    },
    [cancelSoundSync, findNextPlayable, orderedShorts, setActive]
  );

  const handleAutoplayBlocked = useCallback((index: number, generation: number | null) => {
    if (index !== activeIndexRef.current) return;
    if (generation != null && !leaseMatches(controllerRef.current, index, generation)) return;
    setBlockedIndex(index);
    session.current.autoplayFailures += 1;
  }, []);

  const handlePlaying = useCallback((index: number, generation: number | null, startupMs: number, player: YouTubePlayer) => {
    if (!leaseMatches(controllerRef.current, index, generation)) {
      // A late PLAYING callback from a previous lease is never allowed to
      // reclaim the feed. It is safe to pause that iframe immediately.
      try { player.pauseVideo(); } catch {}
      return;
    }
    restorePlayerState(index, player, 'playing');
    beginSoundSync(index, player);
    setPlayingIndex(index);
    wasPlayingRef.current = true;
    const short = orderedShorts[index];
    if (!short) return;
    if (!started.current.has(short.id)) {
      started.current.add(short.id);
      session.current.videosStarted += 1;
      session.current.startupMsTotal += Math.min(30000, startupMs);
    }
  }, [beginSoundSync, orderedShorts, restorePlayerState]);

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
    if (leaseMatches(controllerRef.current, index, generation)) session.current.bufferingEvents += 1;
  }, []);

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
    (snapshot: ShortsReturnState) => {
      if (!isShortsReturnState(snapshot)) return;
      const index = orderedShorts.findIndex((short) => short.id === snapshot.videoId);
      if (index < 0) return;
      soundRef.current = { muted: snapshot.muted, volume: snapshot.volume };
      pendingRestoreRef.current = snapshot;
      const shouldResume = snapshot.resumeIntent ? snapshot.resumeIntent === 'autoplay' : snapshot.wasPlaying;
      overlayResumeRef.current = shouldResume;
      if (activeIndexRef.current === index) {
        transitionController({ type: 'overlay-close', resume: shouldResume });
        visibleIndexRef.current = index;
        setVisibleIndex(index);
        const player = playersRef.current.get(index);
        if (player) {
          try {
            if (snapshot.currentTime > 0) player.seekTo(snapshot.currentTime, true);
            applySound(player, true, snapshot.volume);
            if (shouldResume) player.playVideo();
          } catch {}
        }
      } else {
        setActive(index, false);
      }
      requestAnimationFrame(() => {
        const card = feedRef.current?.querySelector<HTMLElement>(`[data-short-index="${index}"]`);
        if (card && feedRef.current) feedRef.current.scrollTo({ top: card.offsetTop, behavior: 'auto' });
      });
    },
    [applySound, orderedShorts, setActive, transitionController]
  );

  const openRecipeOverlay = useCallback(
    (short: ShortVideo) => {
      if (!activeRef.current || !short.recipeQuery || openingOverlayRef.current || overlayRef.current) return;
      openingOverlayRef.current = true;
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
      fetchRecipes({ q: short.recipeQuery, limit: 3, seed: short.id })
        .then((result) => setRecipes(result.recipes))
        .catch(() => setRecipesError(true))
        .finally(() => {
          openingOverlayRef.current = false;
          setRecipesLoading(false);
        });
    },
    [captureSnapshot, pausePlayersExcept, transitionController]
  );

  const closeRecipeOverlay = useCallback(() => {
    const snapshot = overlayRef.current?.snapshot;
    if (!snapshot || overlayRestoredRef.current) return;
    overlayRestoredRef.current = true;
    openingOverlayRef.current = false;
    setRecipeOverlay(null);
    clearShortsOverlaySnapshot();
    if (typeof window !== 'undefined' && window.location.hash.includes('make=1')) {
      const rest = window.history.state && typeof window.history.state === 'object' ? { ...(window.history.state as Record<string, unknown>) } : {};
      delete rest.pubcrawlShortsOverlay;
      window.history.replaceState(rest, '', overlayBaseHash.current || window.location.hash.replace(/[?&]make=1(?=&|$)/, '').replace(/[?&]$/, ''));
    }
    restoreSnapshot(snapshot);
    window.setTimeout(() => { overlayRestoredRef.current = false; }, 0);
  }, [restoreSnapshot]);

  const continueToBar = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay || !onContinueToBar) return;
    const snapshot = overlay.snapshot;
    setRecipeOverlay(null);
    openingOverlayRef.current = false;
    overlayRestoredRef.current = true;
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
        soundRef.current = { muted: capturedState.muted, volume: capturedState.volume };
        pendingRestoreRef.current = capturedState;
        overlayResumeRef.current = persistedOverlay ? false : (capturedState.resumeIntent === 'autoplay' || capturedState.wasPlaying);
        setOrderRevision((revision) => revision + 1);
        if (!persistedOverlay) onReturnConsumed?.();
      } else {
        pendingRestoreRef.current = null;
        overlayResumeRef.current = null;
        const nextSeed = randomSeed();
        orderIdsRef.current = shuffleWithSeed(data.shorts, nextSeed).map((short) => short.id);
        setOrderSeed(nextSeed);
        setOrderRevision((revision) => revision + 1);
      }
      visitStarted.current = true;
      sourceRef.current = sourceLabel(source);
      sent.current = false;
      session.current = blankSession();
      started.current.clear();
      failedIdsRef.current.clear();
      retryCountsRef.current.clear();
      setError(false);
      setConfigError(false);
      cancelSoundSync();
      setSoundPromptIndex(null);
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
        if (card && feedRef.current) feedRef.current.scrollTo({ top: card.offsetTop, behavior: 'auto' });
      });
    }
  }, [active, cancelSoundSync, data.shorts, initialId, onReturnConsumed, orderedShorts, returnState, source, transitionController]);

  // Route exit is the only passive transition that pauses the whole pool.
  // Keep its dependency list intentionally narrow: a hidden Shorts instance
  // may still receive catalogue/API enrichment, and that must never replay a
  // global pause or flush the visit as though the user just navigated away.
  useEffect(() => {
    if (active) return;
    visitStarted.current = false;
    overlayLoadedRef.current = false;
    transitionController({ type: 'route-inactive' });
    pausePlayersExcept(null);
    flushSession();
    wasPlayingRef.current = false;
    setPlayingIndex(null);
  }, [active, flushSession, pausePlayersExcept, transitionController]);

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
    if (currentIds.length !== restoredOrder.length || currentIds.some((id, index) => id !== restoredOrder[index])) {
      orderIdsRef.current = restoredOrder;
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
    transitionController({ type: 'overlay-open' });
    overlayBaseHash.current = window.location.hash.replace(/[?&]make=1(?=&|$)/, '').replace(/[?&]$/, '');
    pendingRestoreRef.current = snapshot;
    soundRef.current = { muted: snapshot.muted, volume: snapshot.volume };
    overlayLoadedRef.current = true;
    setRecipeOverlay({ short, snapshot });
    setRecipes([]);
    setRecipesLoading(true);
    setRecipesError(false);
    fetchRecipes({ q: short.recipeQuery || short.title, limit: 3, seed: short.id })
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
      if (card && feedRef.current) feedRef.current.scrollTo({ top: card.offsetTop, behavior: 'auto' });
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
  // the current lease in the same task and pauses every player; only the
  // nearest card after scrollend (or 100ms of quiet) receives a new lease.
  useEffect(() => {
    const root = feedRef.current;
    if (!active || !root || !orderedShorts.length) return;
    let frame = 0;
    let lastTop = root.scrollTop;
    let touchActive = false;
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
    const beginScroll = (direction: ShortsScrollDirection) => {
      if (controllerRef.current.phase === 'scrolling') return;
      transitionController({ type: 'scroll-start', direction });
      // This is deliberately imperative: React's next render must not be the
      // first opportunity for the outgoing iframe to stop playing.
      pausePlayersExcept(null);
      cancelSoundSync();
      setSoundPromptIndex(null);
      setPlayingIndex(null);
      setVisibleIndex(-1);
      visibleIndexRef.current = -1;
      gestureStartTopRef.current = root.scrollTop;
      pendingActivationRef.current = null;
      if (activationTimerRef.current != null) {
        window.clearTimeout(activationTimerRef.current);
        activationTimerRef.current = null;
      }
    };
    const updateIntent = () => {
      const top = root.scrollTop;
      const delta = top - lastTop;
      if (Math.abs(delta) > 1) {
        const start = gestureStartTopRef.current ?? lastTop;
        const displacement = top - start;
        const direction: ShortsScrollDirection = displacement < -8 ? 'backward' : displacement > 8 ? 'forward' : delta < 0 ? 'backward' : 'forward';
        beginScroll(direction);
        // Direction is based on the gesture displacement, not the tiny
        // reverse correction emitted by mandatory snapping.
        if (Math.abs(displacement) > 8 && direction !== scrollDirectionRef.current) {
          scrollDirectionRef.current = direction;
          setScrollDirection(direction);
          transitionController({ type: 'scroll-intent', index: prepareIndexRef.current, direction });
        }
      }
      lastTop = top;
      const viewport = Math.max(1, root.clientHeight);
      const intent = Math.max(0, Math.min(orderedLengthRef.current - 1, Math.round(top / viewport)));
      if (intent !== prepareIndexRef.current) {
        prepareIndexRef.current = intent;
        setPrepareIndex(intent);
        transitionController({ type: 'scroll-intent', index: intent, direction: scrollDirectionRef.current });
      }
    };
    const settle = () => {
      if (overlayRef.current || (typeof window !== 'undefined' && window.location.hash.includes('make=1'))) return;
      clearSettle();
      const target = cardIndexAtRest();
      pendingActivationRef.current = target;
      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = null;
        const finalTarget = cardIndexAtRest();
        pendingActivationRef.current = null;
        if (finalTarget !== activeIndexRef.current || controllerRef.current.phase === 'scrolling') setActiveRef.current(finalTarget);
        else {
          transitionController({ type: 'scroll-settle', index: finalTarget });
          visibleIndexRef.current = finalTarget;
          setVisibleIndex(finalTarget);
        }
        gestureStartTopRef.current = null;
      }, 100);
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
        // Do not let the quiet-scroll fallback commit a temporary card while
        // a finger is still down. Mobile browsers can pause scroll events for
        // more than 100ms during a slow swipe, which previously minted a
        // short-lived lease and broke the following autoplay handoff.
        if (!touchActive) settle();
        else {
          // Some mobile engines omit the final touchend/touchcancel when a
          // second fling begins before the first momentum scroll completes.
          // Retain a longer scroll-quiet safety net so the controller cannot
          // remain permanently in `scrolling` with every player paused.
          clearSettle();
          settleTimerRef.current = window.setTimeout(() => {
            settleTimerRef.current = null;
            settle();
          }, 350);
        }
      });
    };
    const onScrollEnd = () => {
      if (touchActive || !active || overlayRef.current || (typeof window !== 'undefined' && window.location.hash.includes('make=1'))) return;
      settle();
    };
    const onTouchStart = () => {
      touchActive = true;
      clearSettle();
    };
    const onTouchEnd = () => {
      touchActive = false;
      settle();
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
  }, [active, cancelSoundSync, pausePlayersExcept, transitionController]);

  // YouTube has no volumechange event. Poll only after programmatic sound
  // synchronization is confirmed so a blocked unmute cannot erase the visit
  // preference and make every subsequent Short silent.
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      const player = playersRef.current.get(activeIndexRef.current);
      if (!player) return;
      try {
        const muted = Boolean(player.isMuted());
        const volume = Math.max(0, Math.min(100, Math.round(player.getVolume())));
        if (!soundSyncedRef.current) {
          if (soundPromptIndex === activeIndexRef.current && !muted) {
            soundRef.current = { muted: false, volume };
            soundSyncedRef.current = true;
            setSoundPromptIndex(null);
            applySoundToPlayers();
          }
          return;
        }
        if (muted !== soundRef.current.muted || (!muted && volume !== soundRef.current.volume)) {
          soundRef.current = { muted, volume: muted ? soundRef.current.volume : volume };
          setSoundPromptIndex(null);
          applySoundToPlayers();
        }
      } catch {
        // Ignore calls while the active iframe is being replaced.
      }
    }, 150);
    return () => window.clearInterval(timer);
  }, [active, applySoundToPlayers, soundPromptIndex]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        transitionController({ type: 'hidden' });
        gestureStartTopRef.current = null;
        cancelSoundSync();
        setSoundPromptIndex(null);
        pausePlayersExcept(null);
        wasPlayingRef.current = false;
        setPlayingIndex(null);
        setVisibleIndex(-1);
      } else if (active && !overlayRef.current) {
        const next = transitionController({ type: 'visible' });
        if (next.phase === 'idle') {
          visibleIndexRef.current = next.settledIndex;
          setVisibleIndex(next.settledIndex);
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
  }, [active, cancelSoundSync, closeRecipeOverlay, flushSession, pausePlayersExcept, transitionController]);

  // Only final unmount is allowed to tear down every iframe. Metadata/API
  // enrichment and callback changes must not pause a healthy active player.
  useEffect(() => () => {
    pausePlayersExcept(null);
    cancelSoundSync();
    flushSession();
  }, [cancelSoundSync, flushSession, pausePlayersExcept]);

  useEffect(() => {
    if (!recipeOverlay) return;
    recipeCloseRef.current?.focus();
  }, [recipeOverlay]);

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
          if (card && feedRef.current) feedRef.current.scrollTo({ top: card.offsetTop, behavior: 'smooth' });
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
            <article className={`shorts-card ${isVisible ? 'is-active' : ''}`} data-short-index={index} key={short.id}>
              <div className={`shorts-stage ${short.recipeQuery ? 'has-recipe' : ''}`}>
                <div
                  className="shorts-visual"
                  style={isVisible ? { '--shorts-backdrop': `url("${thumbnailForShort(short)}")` } as CSSProperties : undefined}
                >
                  {isVisible && <div className="shorts-media-backdrop" aria-hidden="true" />}
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
                      muted={soundRef.current.muted}
                      volume={soundRef.current.volume}
                      online={online}
                      failed={failed}
                      onManual={(target) => {
                        if (!online) return;
                        const card = feedRef.current?.querySelector<HTMLElement>(`[data-short-index="${target}"]`);
                        if (card && target !== activeIndexRef.current) feedRef.current?.scrollTo({ top: card.offsetTop, behavior: 'smooth' });
                        setActive(target, false);
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
                      onRequestInitialize={requestPlayerInitialization}
                    />
                  </div>
                  {isVisible && (
                    <div className="shorts-top-overlay" aria-label="Short navigation">
                      <button type="button" className="shorts-overlay-action" onClick={onBack} aria-label="Back" title="Back">
                        <ArrowLeft size={20} />
                      </button>
                    </div>
                  )}
                  {isVisible && (
                    <ShortsSpeedHold
                      enabled={active && playingIndex === index && !recipeOverlay}
                      rate={playbackRate}
                      player={playersRef.current.get(index) || null}
                    />
                  )}
                  {isVisible && soundPromptIndex === index && !recipeOverlay && (
                    <button
                      type="button"
                      className="shorts-sound-prompt"
                      onClick={() => {
                        const player = playersRef.current.get(index);
                        if (player) beginSoundSync(index, player);
                      }}
                    >
                      TAP FOR SOUND
                    </button>
                  )}
                  {isVisible && (
                    <div className="shorts-player-rail" aria-label="Short actions">
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
          onMouseDown={(event) => event.target === event.currentTarget && closeRecipeOverlay()}
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
                closeRecipeOverlay();
              }
            }}
          >
            <header className="shorts-recipe-dialog-head">
              <div>
                <span className="k-label">MAKE THIS</span>
                <h2 id="shorts-recipe-title">{recipeOverlay.short.recipeQuery}</h2>
              </div>
              <button ref={recipeCloseRef} className="shorts-recipe-close" type="button" onClick={closeRecipeOverlay} aria-label="Close recipes">
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

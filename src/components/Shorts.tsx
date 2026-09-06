import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent, type KeyboardEvent } from 'react';
import { fetchShorts, postShortSession } from '../api';
import type { ShortLibrary, ShortVideo } from '../types';
import { YT_PLAYER_STATES, type YouTubePlayer } from '../shortsPlayer';
import { ArrowLeft, ArrowRight, Share } from '../icons';
import { shareContent, shortShareText } from '../share';
import { SHORTS_SEED } from '../shortsData';
import {
  readShortsRatePreference,
  readShortsSoundPreference,
  writeShortsRatePreference,
  writeShortsSoundPreference,
} from '../shortsSoundPolicy';
import { overlayGate } from '../overlayGate';
import { ContextualHelp } from './ContextualHelp';
import { ShortPlayerHost, type ShortPlayerHostHandle } from './shorts/ShortPlayerHost';

const FALLBACK_LANES = [
  { id: 'craft', label: 'The Craft', color: '#8A5A24' },
  { id: 'education', label: 'Learn It', color: '#5C7A3B' },
  { id: 'comedy', label: 'For The Laugh', color: '#4A4E7A' },
  { id: 'people', label: 'People & Drink', color: '#8E4A5B' },
] as const;

const staticLibrary: ShortLibrary = {
  shorts: SHORTS_SEED,
  lanes: FALLBACK_LANES.map((lane) => ({ ...lane })),
  hasNumbers: false,
  updatedAt: null,
};

function randomSeed() {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 0x100000000);
}

/** Keep one visit's order stable while optional API enrichment arrives. */
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
    const swap = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled;
}

function sourceLabel(source: string): 'landing' | 'nav' | 'deep-link' | 'direct' {
  return source === 'landing' || source === 'nav' || source === 'deep-link' ? source : 'direct';
}

function contentWindow(activeIndex: number, length: number, radius = 5): number[] {
  if (!length || activeIndex < 0 || activeIndex >= length) return [];
  const start = Math.max(0, activeIndex - radius);
  const end = Math.min(length - 1, activeIndex + radius);
  return Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
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

export interface ShortsProps {
  active: boolean;
  initialId?: string;
  source?: string;
  onBack: () => void;
}

interface GestureStart {
  pointerId: number;
  x: number;
  y: number;
  ignored: boolean;
}

/**
 * A controls-first Shorts route. There is one persistent YouTube iframe for
 * the active visit; adjacent catalogue entries are local metadata shells only.
 */
export function Shorts({ active, initialId, source = 'direct', onBack }: ShortsProps) {
  const [data, setData] = useState<ShortLibrary>(staticLibrary);
  const [orderSeed] = useState(randomSeed);
  const orderIdsRef = useRef<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [generation, setGeneration] = useState(0);
  const [routeReady, setRouteReady] = useState(false);
  const [phase, setPhase] = useState<'inactive' | 'initializing' | 'loading' | 'playing' | 'paused' | 'buffering' | 'blocked' | 'offline' | 'error'>('inactive');
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [shared, setShared] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [soundPreference, setSoundPreference] = useState(() => readShortsSoundPreference());
  const [ratePreference, setRatePreference] = useState(() => readShortsRatePreference());
  const [startAudible, setStartAudible] = useState(false);
  const [overlayOwner, setOverlayOwner] = useState<string | null>(overlayGate.active);
  const activeIndexRef = useRef(0);
  const generationRef = useRef(0);
  const gestureRef = useRef<GestureStart | null>(null);
  const wheelTimerRef = useRef<number | null>(null);
  const wheelDirectionRef = useRef<'forward' | 'backward' | null>(null);
  const initializedRef = useRef(false);
  const visitedRef = useRef(false);
  const sentRef = useRef(false);
  const sessionRef = useRef<SessionCounters>(blankSession());
  const startedRef = useRef(new Set<string>());
  const sourceRef = useRef(sourceLabel(source));
  const soundPreferenceRef = useRef(soundPreference);
  const playerHostRef = useRef<ShortPlayerHostHandle | null>(null);

  activeIndexRef.current = activeIndex;
  generationRef.current = generation;
  sourceRef.current = sourceLabel(source);
  soundPreferenceRef.current = soundPreference;

  const orderedShorts = useMemo(() => {
    const byId = new Map(data.shorts.map((short) => [short.id, short]));
    const shuffled = shuffleWithSeed(data.shorts, orderSeed).map((short) => short.id);
    const existing = orderIdsRef.current.filter((id) => byId.has(id));
    const seen = new Set(existing);
    const next = [...existing, ...shuffled.filter((id) => !seen.has(id))];
    orderIdsRef.current = next;
    return next.map((id) => byId.get(id)).filter((short): short is ShortVideo => Boolean(short));
  }, [data.shorts, orderSeed]);

  const activeShort = orderedShorts[activeIndex] || null;
  const windowIndexes = useMemo(() => contentWindow(activeIndex, orderedShorts.length, 5), [activeIndex, orderedShorts.length]);

  const flushSession = useCallback(() => {
    if (!visitedRef.current || sentRef.current) return;
    sentRef.current = true;
    const counters = sessionRef.current;
    void postShortSession({
      source: sourceRef.current,
      videosStarted: counters.videosStarted,
      advances: counters.advances,
      shares: counters.shares,
      recipeClicks: 0,
      autoplayFailures: counters.autoplayFailures,
      unavailableSkips: counters.unavailableSkips,
      bufferingEvents: counters.bufferingEvents,
      startupMsTotal: counters.startupMsTotal,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!active) {
      initializedRef.current = false;
      setRouteReady(false);
      setPhase('inactive');
      flushSession();
      return;
    }
    if (initializedRef.current || !orderedShorts.length) return;
    initializedRef.current = true;
    visitedRef.current = true;
    sentRef.current = false;
    sessionRef.current = blankSession();
    startedRef.current.clear();
    const requested = initialId ? orderedShorts.findIndex((short) => short.id === initialId) : -1;
    const nextIndex = requested >= 0 ? requested : 0;
    activeIndexRef.current = nextIndex;
    setActiveIndex(nextIndex);
    generationRef.current += 1;
    setGeneration(generationRef.current);
    setStartAudible(false);
    setPhase(online ? 'initializing' : 'offline');
    setRouteReady(true);
  }, [active, flushSession, initialId, online, orderedShorts]);

  useEffect(() => {
    if (active) return;
    return () => flushSession();
  }, [active, flushSession]);

  useEffect(() => {
    let cancelled = false;
    void fetchShorts().then((next) => {
      if (!cancelled && next?.shorts?.length) setData(next);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => overlayGate.subscribe(() => setOverlayOwner(overlayGate.active)), []);

  useEffect(() => {
    const update = () => setOverlayOwner(overlayGate.active);
    window.addEventListener('pubcrawl:replay-tour', update);
    return () => window.removeEventListener('pubcrawl:replay-tour', update);
  }, []);

  useEffect(() => () => {
    if (wheelTimerRef.current != null) window.clearTimeout(wheelTimerRef.current);
  }, []);

  const navigate = useCallback((requestedIndex: number, directGesture: boolean) => {
    if (!orderedShorts.length) return;
    const nextIndex = Math.max(0, Math.min(orderedShorts.length - 1, requestedIndex));
    const current = activeIndexRef.current;
    if (nextIndex === current) return;
    const nextShort = orderedShorts[nextIndex];
    if (!nextShort) return;
    // YouTube does not expose a volume-change event to the parent document.
    // Read the active iframe synchronously while the swipe/click is still the
    // user gesture, then use the updated ref below instead of a stale React
    // state closure. This is what keeps a native unmute/volume choice when a
    // user swipes immediately afterward.
    playerHostRef.current?.syncNativeSound();
    const desired = soundPreferenceRef.current.desiredAudible;
    const audible = Boolean(directGesture && desired);
    activeIndexRef.current = nextIndex;
    generationRef.current += 1;
    setActiveIndex(nextIndex);
    setGeneration(generationRef.current);
    setStartAudible(audible);
    setPhase(online ? 'loading' : 'offline');
    sessionRef.current.advances += 1;
    const params = new URLSearchParams();
    params.set('v', nextShort.id);
    params.set('src', sourceLabel(source));
    window.history.replaceState(window.history.state, '', `#/shorts?${params.toString()}`);
  }, [online, orderedShorts, source]);

  const onSidePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const target = event.target as Element | null;
    const ignored = Boolean(target?.closest('button'));
    gestureRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, ignored };
    if (!ignored) event.currentTarget.setPointerCapture?.(event.pointerId);
  }, []);

  const onSidePointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const start = gestureRef.current;
    gestureRef.current = null;
    if (!start || start.pointerId !== event.pointerId || start.ignored) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dy) < 40 || Math.abs(dy) <= Math.abs(dx) * 1.25) return;
    navigate(activeIndexRef.current + (dy < 0 ? 1 : -1), true);
  }, [navigate]);

  const onSidePointerCancel = useCallback(() => { gestureRef.current = null; }, []);

  const onFeedKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    let destination: number | null = null;
    if (event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === ' ') destination = activeIndexRef.current + 1;
    else if (event.key === 'ArrowUp' || event.key === 'PageUp') destination = activeIndexRef.current - 1;
    else if (event.key === 'Home') destination = 0;
    else if (event.key === 'End') destination = orderedShorts.length - 1;
    if (destination == null) return;
    event.preventDefault();
    navigate(destination, true);
  }, [navigate, orderedShorts.length]);

  const onFeedWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    if ((event.target as Element | null)?.closest('.shorts-player-frame')) return;
    const raw = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * window.innerHeight : event.deltaY;
    if (Math.abs(raw) < 12) return;
    event.preventDefault();
    wheelDirectionRef.current = raw > 0 ? 'forward' : 'backward';
    if (wheelTimerRef.current != null) window.clearTimeout(wheelTimerRef.current);
    wheelTimerRef.current = window.setTimeout(() => {
      wheelTimerRef.current = null;
      const direction = wheelDirectionRef.current;
      wheelDirectionRef.current = null;
      if (direction) navigate(activeIndexRef.current + (direction === 'forward' ? 1 : -1), true);
    }, 120);
  }, [navigate]);

  const onNativeSound = useCallback((muted: boolean, volume: number) => {
    const previous = soundPreferenceRef.current;
    const desiredAudible = !muted;
    const normalizedVolume = Math.max(0, Math.min(100, Math.round(Number.isFinite(volume) ? volume : previous.volume)));
    if (previous.desiredAudible === desiredAudible && previous.volume === normalizedVolume) return;
    const next = writeShortsSoundPreference({ version: 1, desiredAudible, volume: normalizedVolume });
    // Keep the ref current in the same task as the native gesture. React may
    // batch the visible state update until after navigate() has read it.
    soundPreferenceRef.current = next;
    setSoundPreference(next);
  }, []);

  const onPlaybackRateChange = useCallback((rate: number) => {
    setRatePreference((previous) => {
      if (previous.preferredRate === rate) return previous;
      return writeShortsRatePreference({ version: 1, preferredRate: rate });
    });
  }, []);

  const handleShare = useCallback(async () => {
    if (!activeShort) return;
    const result = await shareContent(activeShort.title, shortShareText(activeShort.title, activeShort.channel, activeShort.id));
    if (result === 'shared' || result === 'copied') {
      sessionRef.current.shares += 1;
      setShared(result === 'shared' ? 'idle' : 'copied');
    } else if (result === 'failed') setShared('failed');
    window.setTimeout(() => setShared('idle'), 1800);
  }, [activeShort]);

  const onPlaying = useCallback((startupMs: number) => {
    const key = `${activeShort?.id || ''}:${generationRef.current}`;
    if (startedRef.current.has(key)) return;
    startedRef.current.add(key);
    sessionRef.current.videosStarted += 1;
    sessionRef.current.startupMsTotal += startupMs;
    setPhase('playing');
  }, [activeShort?.id]);

  const onBuffering = useCallback(() => {
    sessionRef.current.bufferingEvents += 1;
    setPhase('buffering');
  }, []);

  const onStateChange = useCallback((state: number) => {
    if (state === YT_PLAYER_STATES.PLAYING) setPhase('playing');
    else if (state === YT_PLAYER_STATES.BUFFERING) setPhase('buffering');
    else if (state === YT_PLAYER_STATES.PAUSED) setPhase('paused');
  }, []);

  const onAutoplayBlocked = useCallback(() => {
    sessionRef.current.autoplayFailures += 1;
  }, []);

  const onPlayerError = useCallback((code: number) => {
    if (code === 100 || code === 101 || code === 150) sessionRef.current.unavailableSkips += 1;
    setPhase('error');
  }, []);

  if (!active) return null;

  const suspended = Boolean(overlayOwner);
  return (
    <section className="shorts-page" aria-label="Shorts">
      <div
        className="shorts-feed"
        tabIndex={0}
        role="region"
        aria-label="Shorts feed"
        data-tour="shorts-feed"
        data-controller-phase={phase}
        data-controller-active={activeIndex}
        data-controller-visible={activeIndex}
        data-controller-lease={`${activeIndex}:${generation}`}
        data-content-window={windowIndexes.join(',')}
        onKeyDown={onFeedKeyDown}
        onWheel={onFeedWheel}
      >
        {routeReady && activeShort ? (
          <article
            className="shorts-card is-active"
            data-short-index={activeIndex}
            data-short-id={activeShort.id}
            data-lease-generation={generation}
            aria-label={activeShort.title}
          >
            <div className="shorts-stage">
              <div
                className="shorts-nav-zone shorts-nav-zone-left"
                data-swipe-zone="previous"
                data-tour="shorts-actions"
                onPointerDown={onSidePointerDown}
                onPointerUp={onSidePointerUp}
                onPointerCancel={onSidePointerCancel}
              >
                <button type="button" className="shorts-overlay-action" aria-label="Back" title="Back" onClick={onBack}>
                  <ArrowLeft size={26} />
                </button>
                <ContextualHelp tour="shorts" className="shorts-help" />
                <button
                  type="button"
                  className="shorts-overlay-action"
                  aria-label="Previous Short"
                  title="Previous Short"
                  disabled={activeIndex <= 0}
                  onClick={() => navigate(activeIndex - 1, true)}
                >
                  <ArrowLeft size={22} />
                </button>
              </div>

              <div className="shorts-player-frame">
                <ShortPlayerHost
                  ref={playerHostRef}
                  active={routeReady}
                  short={activeShort}
                  index={activeIndex}
                  generation={generation}
                  startAudible={startAudible}
                  desiredAudible={soundPreference.desiredAudible}
                  volume={soundPreference.volume}
                  preferredRate={ratePreference.preferredRate}
                  online={online}
                  suspended={suspended}
                  onStateChange={onStateChange}
                  onPlaying={onPlaying}
                  onBuffering={onBuffering}
                  onError={onPlayerError}
                  onAutoplayBlocked={onAutoplayBlocked}
                  onPlaybackRateChange={onPlaybackRateChange}
                  onNativeSound={onNativeSound}
                />
              </div>

              <div
                className="shorts-nav-zone shorts-nav-zone-right"
                data-swipe-zone="next"
                onPointerDown={onSidePointerDown}
                onPointerUp={onSidePointerUp}
                onPointerCancel={onSidePointerCancel}
              >
                <button type="button" className="shorts-overlay-action" aria-label="Share" title="Share" onClick={handleShare}>
                  <Share size={24} />
                </button>
                <button
                  type="button"
                  className="shorts-overlay-action"
                  aria-label="Next Short"
                  title="Next Short"
                  disabled={activeIndex >= orderedShorts.length - 1}
                  onClick={() => navigate(activeIndex + 1, true)}
                >
                  <ArrowRight size={22} />
                </button>
              </div>
            </div>
            <div className="shorts-meta">
              <span className="k-label">{activeShort.lane}</span>
              <h1>{activeShort.title}</h1>
              <p className="k-label dim">{activeShort.channel}</p>
              {shared !== 'idle' && <span className="k-label shorts-share-status" role="status">{shared === 'copied' ? 'LINK COPIED' : 'SHARE FAILED'}</span>}
            </div>
          </article>
        ) : (
          <div className="shorts-route-loading" role="status">LOADING..</div>
        )}

        <div className="shorts-queue" aria-hidden="true">
          {windowIndexes.filter((index) => index !== activeIndex).map((index) => {
            const short = orderedShorts[index];
            return short ? <article key={`${short.id}-${index}`} className="shorts-card shorts-card-placeholder" data-short-index={index} data-short-id={short.id} /> : null;
          })}
        </div>
      </div>
    </section>
  );
}

export type { YouTubePlayer };

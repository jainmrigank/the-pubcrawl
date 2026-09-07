import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type CSSProperties } from 'react';
import { fetchShorts, postShortSession } from '../api';
import { ArrowLeft, Share } from '../icons';
import { shareContent, shortShareText } from '../share';
import { SHORTS_SEED } from '../shortsData';
import type { ShortsSnapshot } from '../shortsController';
import { ShortPlayerHost, type ShortPlayerHostHandle } from './shorts/ShortPlayerHost';

export interface ShortsProps { active: boolean; initialId?: string; source?: string; onBack: () => void }

function visitOrder() {
  const list = [...SHORTS_SEED];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

const emptyMetrics = () => ({ videosStarted: 0, advances: 0, shares: 0, recipeClicks: 0,
  autoplayFailures: 0, unavailableSkips: 0, bufferingEvents: 0, startupMsTotal: 0 });

/** Native scrolling owns movement; one persistent player owns media. */
export function Shorts({ active, initialId, source = 'direct', onBack }: ShortsProps) {
  const [shorts, setShorts] = useState(visitOrder);
  const [selected, setSelected] = useState(0);
  const [ready, setReady] = useState(false);
  const [height, setHeight] = useState(0);
  const [snapshot, setSnapshot] = useState<ShortsSnapshot | null>(null);
  const [shareStatus, setShareStatus] = useState('');
  const feed = useRef<HTMLDivElement>(null);
  const floating = useRef<HTMLDivElement>(null);
  const host = useRef<ShortPlayerHostHandle>(null);
  const indexRef = useRef(0);
  const heightRef = useRef(0);
  const entered = useRef(false);
  const realigning = useRef(false);
  const metrics = useRef(emptyMetrics());
  const sent = useRef(true);
  const shareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const catalogueRef = useRef(shorts);
  catalogueRef.current = shorts;
  const handledLink = useRef(initialId);
  const mountedEpoch = useRef(0);
  const selectedShort = shorts[selected];
  const selection = useMemo(() => ({ videoId: selectedShort.id, index: selected }), [selectedShort.id, selected]);
  const queue = useMemo(() => shorts.slice(Math.max(0, selected - 5), selected + 6), [shorts, selected]);

  const flush = useCallback(() => {
    if (sent.current) return;
    sent.current = true;
    const source = sourceRef.current;
    void postShortSession({ ...metrics.current,
      source: source === 'nav' || source === 'landing' || source === 'deep-link' ? source : 'direct',
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchShorts().then((library) => {
      if (cancelled) return;
      const metadata = new Map(library.shorts.map((short) => [short.id, short]));
      // Enrich existing slots only. Never shift the selected video's index or
      // reshuffle a visit while a remote response arrives.
      setShorts((list) => list.map((short) => metadata.get(short.id) ?? short));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!active) {
      entered.current = false;
      setReady(false);
      flush();
      return;
    }
    if (entered.current) return;
    entered.current = true;
    handledLink.current = initialId;
    sent.current = false;
    metrics.current = emptyMetrics();
    const requested = shorts.findIndex((short) => short.id === initialId);
    indexRef.current = Math.max(0, requested);
    setSelected(indexRef.current);
    setSnapshot(null);
    setReady(true);
  }, [active, initialId, shorts, flush]);

  useEffect(() => {
    const epoch = ++mountedEpoch.current;
    return () => {
      if (shareTimer.current) clearTimeout(shareTimer.current);
      // StrictMode's simulated unmount must not flush the real visit early.
      queueMicrotask(() => { if (mountedEpoch.current === epoch) flush(); });
    };
  }, [flush]);

  const commit = useCallback(() => {
    const root = feed.current;
    if (!root || !heightRef.current || realigning.current) return;
    const catalogue = catalogueRef.current;
    const next = Math.max(0, Math.min(catalogue.length - 1, Math.round(root.scrollTop / heightRef.current)));
    if (next !== indexRef.current) {
      indexRef.current = next;
      // Place the SAME iframe at its destination before issuing a load. No
      // portal/key/parent changes and no stale "direct gesture" boolean.
      if (floating.current) floating.current.style.top = `${next * heightRef.current}px`;
      setSelected(next);
      host.current?.select({ videoId: catalogue[next].id, index: next });
      metrics.current.advances += 1;
      const params = new URLSearchParams({ v: catalogue[next].id, src: sourceRef.current });
      window.history.replaceState(window.history.state, '', `#/shorts?${params}`);
    }
    host.current?.suspend('scroll', false);
  }, []);

  useEffect(() => {
    if (!active || !ready || initialId === handledLink.current) return;
    handledLink.current = initialId;
    const requested = catalogueRef.current.findIndex(short => short.id === initialId);
    if (requested >= 0 && requested !== indexRef.current && feed.current) {
      // A new hash deep-link within the already mounted route uses the same
      // native scroll/settlement path, not another iframe or command owner.
      feed.current.scrollTo({ top: requested * heightRef.current, behavior: 'instant' });
    }
  }, [active, ready, initialId]);

  useLayoutEffect(() => {
    const root = feed.current;
    if (!active || !ready || !root) return;
    let frame = 0;
    let correction = 0;
    let quiet: ReturnType<typeof setTimeout> | null = null;
    let touching = false;
    const hasScrollEnd = 'onscrollend' in root;
    const clearQuiet = () => { if (quiet) clearTimeout(quiet); quiet = null; };
    const measure = () => {
      const nextHeight = root.clientHeight;
      if (!nextHeight || nextHeight === heightRef.current) return;
      clearQuiet();
      realigning.current = true;
      root.dataset.layoutReady = 'false';
      heightRef.current = nextHeight;
      setHeight(nextHeight);
      root.scrollTop = indexRef.current * nextHeight;
      if (floating.current) floating.current.style.top = `${indexRef.current * nextHeight}px`;
      cancelAnimationFrame(correction);
      correction = requestAnimationFrame(() => {
        root.scrollTop = indexRef.current * nextHeight;
        correction = requestAnimationFrame(() => {
          realigning.current = false;
          root.dataset.layoutReady = 'true';
        });
      });
    };
    const onScroll = () => {
      if (realigning.current) return;
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        const displacement = Math.abs(root.scrollTop - indexRef.current * heightRef.current);
        // Keep tiny snap adjustments playing. Pause only once the current
        // card is genuinely leaving; same-card settle resumes without reload.
        if (displacement > heightRef.current * 0.35) host.current?.suspend('scroll', true);
      });
      if (!hasScrollEnd && !touching) {
        clearQuiet();
        quiet = setTimeout(commit, 120);
      }
    };
    const onEnd = () => { clearQuiet(); if (!touching) commit(); };
    const touchStart = () => { touching = true; clearQuiet(); };
    const touchEnd = () => {
      touching = false;
      if (!hasScrollEnd) { clearQuiet(); quiet = setTimeout(commit, 120); }
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(root);
    root.addEventListener('scroll', onScroll, { passive: true });
    root.addEventListener('scrollend', onEnd);
    root.addEventListener('touchstart', touchStart, { passive: true });
    root.addEventListener('touchend', touchEnd, { passive: true });
    root.addEventListener('touchcancel', touchEnd, { passive: true });
    return () => {
      clearQuiet();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(correction);
      resize.disconnect();
      root.removeEventListener('scroll', onScroll);
      root.removeEventListener('scrollend', onEnd);
      root.removeEventListener('touchstart', touchStart);
      root.removeEventListener('touchend', touchEnd);
      root.removeEventListener('touchcancel', touchEnd);
      heightRef.current = 0;
      realigning.current = false;
    };
  }, [active, ready, commit]);

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || !feed.current) return;
    const direction = ['ArrowDown', 'PageDown'].includes(event.key) ? 1 : ['ArrowUp', 'PageUp'].includes(event.key) ? -1 : 0;
    const destination = direction ? indexRef.current + direction : event.key === 'Home' ? 0 : event.key === 'End' ? shorts.length - 1 : null;
    if (destination == null) return;
    event.preventDefault();
    feed.current.scrollTo({ top: Math.max(0, Math.min(shorts.length - 1, destination)) * heightRef.current,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };

  const share = async () => {
    const result = await shareContent(selectedShort.title, shortShareText(selectedShort.title, selectedShort.channel, selectedShort.id));
    if (result === 'shared' || result === 'copied') metrics.current.shares += 1;
    setShareStatus(result === 'copied' ? 'LINK COPIED' : result === 'failed' ? 'SHARE FAILED' : '');
    if (shareTimer.current) clearTimeout(shareTimer.current);
    shareTimer.current = setTimeout(() => setShareStatus(''), 1800);
  };

  if (!active) return null;
  const status = snapshot?.phase === 'offline' ? 'OFFLINE · RECONNECT TO PLAY'
    : snapshot?.phase === 'blocked' ? 'AUTOPLAY BLOCKED · USE THE VIDEO CONTROLS'
      : snapshot?.phase === 'error' ? 'VIDEO UNAVAILABLE'
        : snapshot && ['loading', 'buffering', 'initializing'].includes(snapshot.phase) ? 'LOADING..' : '';
  const mediaWidth = Math.max(200, Math.floor(height * 9 / 16));

  return (
    <section className="shorts-page" aria-label="Shorts" style={{ '--shorts-media-width': `${mediaWidth}px` } as CSSProperties}>
      <div className="shorts-chrome" data-tour="shorts-actions">
        <button className="shorts-overlay-action" type="button" aria-label="Back" title="Back" onClick={onBack}><ArrowLeft size={24} /></button>
        <span className="shorts-status" role="status">{shareStatus || status}</span>
        <button className="shorts-overlay-action" type="button" aria-label="Share" title="Share" onClick={share}><Share size={22} /></button>
      </div>
      <div ref={feed} className="shorts-feed" tabIndex={0} role="region" aria-label="Shorts feed" data-tour="shorts-feed"
        data-controller-active={selected} data-controller-phase={snapshot?.phase ?? 'initializing'}
        data-controller-lease={`${selected}:${snapshot?.generation ?? 0}`} data-queue-size={queue.length}
        onKeyDown={onKey}>
        <div className="shorts-track" style={{ height: height ? shorts.length * height : '100%' }}>
          {shorts.map((short, index) => (
            <article key={short.id} className={`shorts-card ${selected === index ? 'is-active' : ''}`}
              style={{ height: height || '100%' }} data-short-index={index} data-short-id={short.id}
              aria-hidden={index !== selected} aria-label={index === selected ? `Short ${index + 1}` : undefined}>
              {index !== selected && Math.abs(index - selected) <= 5 && <span className="shorts-card-loading" aria-hidden="true">LOADING..</span>}
            </article>
          ))}
          <div ref={floating} className="shorts-player-frame" style={{ top: selected * height, height: height || '100%' }}
            data-short-id={selectedShort.id} data-short-index={selected} data-lease-generation={snapshot?.generation ?? 0}>
            {ready && <ShortPlayerHost ref={host} selection={selection} onSnapshot={setSnapshot}
              onMotion={(sample) => {
                metrics.current.videosStarted += 1;
                metrics.current.startupMsTotal += sample.startupMs;
                // Preview-only, identity-free bounded samples for physical QA.
                if (import.meta.env.DEV || import.meta.env.VITE_API_BASE === '') {
                  const diagnostic = window as Window & { __PUBCRAWL_SHORTS_STARTS__?: typeof sample[] };
                  diagnostic.__PUBCRAWL_SHORTS_STARTS__ = [...(diagnostic.__PUBCRAWL_SHORTS_STARTS__ ?? []), sample].slice(-30);
                }
              }}
              onFailure={() => { metrics.current.autoplayFailures += 1; }}
              onBuffering={() => { metrics.current.bufferingEvents += 1; }} />}
          </div>
        </div>
      </div>
    </section>
  );
}

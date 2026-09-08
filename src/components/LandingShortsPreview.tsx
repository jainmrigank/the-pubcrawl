import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Pause, Play } from '../icons';
import { LandingPreviewController, type LandingPreviewPhase } from '../landingPreviewController';
import { nextEligiblePreview, previewVisibilityRatio, selectLandingShorts, type Rectangle } from '../landingPreviewPolicy';
import { EASE, LOADED_HIDDEN } from '../motion';
import { overlayGate } from '../overlayGate';
import { createYouTubePlayer, type YouTubePlayer } from '../shortsPlayer';
import { SHORTS_SEED, thumbnailForShort } from '../shortsData';
import type { ShortVideo } from '../types';

interface LandingShortsPreviewProps {
  active: boolean;
  onNavigate: () => void;
}

interface PreviewPlayerProps {
  short: ShortVideo;
  token: number;
  controller: LandingPreviewController;
  phase: LandingPreviewPhase;
}

function rect(value: DOMRect): Rectangle {
  return {
    top: value.top,
    right: value.right,
    bottom: value.bottom,
    left: value.left,
    width: value.width,
    height: value.height,
  };
}

function dataSavingEnabled() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return Boolean(connection?.saveData);
}

function PreviewPlayer({ short, token, controller, phase }: PreviewPlayerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let cancelled = false;
    let destroyed = false;
    let player: YouTubePlayer | null = null;
    const mount = document.createElement('div');
    root.appendChild(mount);
    void createYouTubePlayer(mount, short.id, {
      onReady: (created) => {
        if (cancelled) return;
        player = created;
        created.getIframe?.()?.setAttribute('title', `Preview: ${short.title}`);
        setReady(true);
        controller.attach(token, created);
      },
      onStateChange: (created, state) => controller.handleState(token, created, state),
      onAutoplayBlocked: (created) => controller.handleAutoplayBlocked(token, created),
      onError: (created) => controller.handleError(token, created),
    }, () => cancelled).then((created) => {
      player = created;
      if (cancelled && !destroyed) {
        destroyed = true;
        created.destroy();
      }
    }).catch(() => {
      if (!cancelled) controller.handleCreationFailure(token);
    });
    return () => {
      cancelled = true;
      if (player) controller.detach(token, player);
      if (player && !destroyed) {
        destroyed = true;
        player.destroy();
      }
      root.replaceChildren();
    };
  }, [controller, short.id, short.title, token]);

  return (
    <>
      <div className="landing-short-media landing-preview-player" data-preview-player={short.id}>
        <div className="landing-preview-player-host" ref={rootRef} />
        {!ready && <span className="landing-preview-loading k-label">LOADING..</span>}
      </div>
      {ready && phase === 'loading' && (
        <span className="landing-preview-adjacent k-label dim" aria-hidden="true">LOADING..</span>
      )}
    </>
  );
}

/** A static-first, one-player-at-a-time teaser; full Shorts stays untouched. */
export function LandingShortsPreview({ active, onNavigate }: LandingShortsPreviewProps) {
  const reducedMotion = useReducedMotion();
  const shorts = useMemo(() => selectLandingShorts(SHORTS_SEED), []);
  const sectionRef = useRef<HTMLElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const progressRef = useRef(new Map<string, number>());
  const completedRef = useRef(new Set<string>());
  const activeIdRef = useRef<string | null>(null);
  const scrollTimerRef = useRef(0);
  const calculateFrameRef = useRef(0);
  const [nearViewport, setNearViewport] = useState(false);
  const [eligibleIds, setEligibleIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [token, setToken] = useState(0);
  const [phase, setPhase] = useState<LandingPreviewPhase>('idle');
  const [documentVisible, setDocumentVisible] = useState(() => !document.hidden);
  const [overlayClear, setOverlayClear] = useState(() => !overlayGate.active);
  const [railMoving, setRailMoving] = useState(false);
  const [manualPaused, setManualPaused] = useState(false);
  const [explicitMotion, setExplicitMotion] = useState(false);
  const systemRestricted = Boolean(reducedMotion) || dataSavingEnabled();

  activeIdRef.current = activeId;

  const controllerRef = useRef<LandingPreviewController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new LandingPreviewController({
      onStatus: (snapshot) => setPhase(snapshot.phase),
      onProgress: (id, playedMs) => progressRef.current.set(id, playedMs),
      onComplete: (id) => {
        completedRef.current.add(id);
        progressRef.current.delete(id);
        if (activeIdRef.current === id) {
          setToken(0);
          setActiveId(null);
        }
      },
      onFailure: (id) => {
        completedRef.current.add(id);
        progressRef.current.delete(id);
        if (activeIdRef.current === id) {
          setToken(0);
          setActiveId(null);
        }
      },
      onManualPause: () => setManualPaused(true),
    });
  }
  const controller = controllerRef.current;

  const calculateEligibility = useCallback(() => {
    const rail = railRef.current;
    if (!rail || !active) {
      setEligibleIds([]);
      return;
    }
    const railBox = rect(rail.getBoundingClientRect());
    const headerBottom = document.querySelector('.nav')?.getBoundingClientRect().bottom ?? 0;
    const bottomNav = document.querySelector<HTMLElement>('.mobile-bottom-nav');
    const bottomNavVisible = bottomNav && getComputedStyle(bottomNav).display !== 'none';
    const viewportBottom = bottomNavVisible ? bottomNav.getBoundingClientRect().top : window.innerHeight;
    const viewport: Rectangle = {
      top: Math.max(0, headerBottom),
      right: window.innerWidth,
      bottom: Math.max(headerBottom, viewportBottom),
      left: 0,
      width: window.innerWidth,
      height: Math.max(0, viewportBottom - headerBottom),
    };
    const current = activeIdRef.current;
    const next = shorts
      .filter((short) => {
        const element = cardRefs.current.get(short.id);
        const media = element?.querySelector<HTMLElement>('.landing-short-media');
        if (!media) return false;
        const ratio = previewVisibilityRatio(rect(media.getBoundingClientRect()), viewport, railBox);
        return ratio >= (short.id === current ? 0.55 : 0.75);
      })
      .map((short) => short.id);
    setEligibleIds((before) => before.length === next.length && before.every((id, index) => id === next[index]) ? before : next);
  }, [active, shorts]);

  const scheduleCalculation = useCallback(() => {
    cancelAnimationFrame(calculateFrameRef.current);
    calculateFrameRef.current = requestAnimationFrame(calculateEligibility);
  }, [calculateEligibility]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(
      ([entry]) => setNearViewport(entry.isIntersecting),
      { rootMargin: '400px 0px' },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const onRailScroll = () => {
      setRailMoving(true);
      controller.suspend();
      window.clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = window.setTimeout(() => {
        setRailMoving(false);
        calculateEligibility();
      }, 120);
    };
    rail.addEventListener('scroll', onRailScroll, { passive: true });
    window.addEventListener('scroll', scheduleCalculation, { passive: true });
    window.addEventListener('resize', scheduleCalculation);
    window.addEventListener('orientationchange', scheduleCalculation);
    scheduleCalculation();
    return () => {
      rail.removeEventListener('scroll', onRailScroll);
      window.removeEventListener('scroll', scheduleCalculation);
      window.removeEventListener('resize', scheduleCalculation);
      window.removeEventListener('orientationchange', scheduleCalculation);
      window.clearTimeout(scrollTimerRef.current);
      cancelAnimationFrame(calculateFrameRef.current);
    };
  }, [calculateEligibility, controller, scheduleCalculation]);

  useEffect(() => {
    const syncVisibility = () => setDocumentVisible(!document.hidden);
    const syncOverlay = () => setOverlayClear(!overlayGate.active);
    const unsubscribe = overlayGate.subscribe(syncOverlay);
    document.addEventListener('visibilitychange', syncVisibility);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', syncVisibility);
    };
  }, []);

  useEffect(() => {
    const onWindowBlur = () => {
      window.setTimeout(() => {
        const focused = document.activeElement;
        if (focused instanceof HTMLIFrameElement && focused.closest('.landing-preview-player')) {
          setManualPaused(true);
        }
      }, 0);
    };
    window.addEventListener('blur', onWindowBlur);
    return () => window.removeEventListener('blur', onWindowBlur);
  }, []);

  const mayCycle = active
    && nearViewport
    && documentVisible
    && overlayClear
    && !railMoving
    && !manualPaused
    && (!systemRestricted || explicitMotion);

  useEffect(() => {
    if (!mayCycle) {
      controller.suspend();
      return;
    }
    if (activeId) {
      if (eligibleIds.includes(activeId)) controller.resume();
      else {
        setToken(0);
        setActiveId(null);
      }
      return;
    }
    const next = nextEligiblePreview(eligibleIds, completedRef.current);
    if (next) setActiveId(next);
  }, [activeId, controller, eligibleIds, mayCycle]);

  useEffect(() => {
    if (!activeId) return;
    const nextToken = controller.activate(activeId, progressRef.current.get(activeId) || 0);
    setToken(nextToken);
    return () => {
      const progress = controller.deactivate();
      if (!completedRef.current.has(activeId)) progressRef.current.set(activeId, progress);
    };
  }, [activeId, controller]);

  useEffect(() => {
    if (active) {
      scheduleCalculation();
      return;
    }
    controller.destroy();
    setToken(0);
    setActiveId(null);
    setEligibleIds([]);
  }, [active, controller, scheduleCalculation]);

  useEffect(() => () => controller.destroy(), [controller]);

  const toggleMotion = () => {
    if (previewsPaused) {
      setExplicitMotion(true);
      setManualPaused(false);
      return;
    }
    setManualPaused(true);
  };
  const previewsPaused = manualPaused || (systemRestricted && !explicitMotion);
  const initial = reducedMotion || LOADED_HIDDEN ? false : { opacity: 0, y: 12 };

  return (
    <motion.section
      ref={sectionRef}
      className="landing-discovery-section"
      data-tour="landing-discovery"
      initial={initial}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-48px' }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      <div className="landing-section-toolbar">
        <h2>SHORTS</h2>
        <div className="landing-section-actions">
          <button
            className="landing-preview-toggle"
            type="button"
            onClick={toggleMotion}
            aria-label={previewsPaused ? 'Play Shorts previews' : 'Pause Shorts previews'}
            title={previewsPaused ? 'Play Shorts previews' : 'Pause Shorts previews'}
          >
            {previewsPaused ? <Play size={17} /> : <Pause size={17} />}
          </button>
          <a className="btn landing-open" href="#/shorts?src=landing" onClick={onNavigate}>
            OPEN SHORTS <ArrowRight size={14} />
          </a>
        </div>
      </div>
      <div ref={railRef} className="landing-media-rail landing-shorts-rail" aria-label="Shorts previews">
        {shorts.map((short) => {
          const isActive = activeId === short.id && token > 0;
          return (
            <article
              className={`landing-short-card ${isActive ? 'is-previewing' : ''}`}
              key={short.id}
              ref={(element) => {
                if (element) cardRefs.current.set(short.id, element);
                else cardRefs.current.delete(short.id);
              }}
              data-preview-id={short.id}
            >
              {isActive ? (
                <PreviewPlayer short={short} token={token} controller={controller} phase={phase} />
              ) : (
                <a
                  className="landing-preview-thumb-link"
                  href={`#/shorts?v=${encodeURIComponent(short.id)}&src=landing`}
                  aria-label={`Open ${short.title} in Shorts`}
                  onClick={onNavigate}
                >
                  <span className="landing-short-media">
                    <img src={thumbnailForShort(short)} alt="" loading="lazy" />
                  </span>
                </a>
              )}
              <a
                className="landing-card-title"
                href={`#/shorts?v=${encodeURIComponent(short.id)}&src=landing`}
                onClick={onNavigate}
              >
                {short.title}
              </a>
            </article>
          );
        })}
      </div>
    </motion.section>
  );
}

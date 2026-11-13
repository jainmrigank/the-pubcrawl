import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from '../icons';
import { LandingPreviewController, type LandingPreviewPhase } from '../landingPreviewController';
import { nextEligiblePreview, previewVisibilityRatio, type Rectangle } from '../landingPreviewPolicy';
import { EASE, LOADED_HIDDEN } from '../motion';
import { overlayGate } from '../overlayGate';
import { createYouTubePlayer, type YouTubePlayer } from '../shortsPlayer';
import { thumbnailForShort } from '../shortsData';
import type { ShortVideo } from '../types';

interface LandingShortsPreviewProps {
  active: boolean;
  animateEntrance: boolean;
  shorts: ShortVideo[];
  visitId: string;
}

interface PreviewVisitState {
  completed: Set<string>;
  progress: Map<string, number>;
  railLeft: number;
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
        {!ready && <span className="landing-preview-loading k-label">Loading…</span>}
      </div>
      {ready && phase === 'loading' && (
        <span className="landing-preview-adjacent k-label dim" aria-hidden="true">Loading…</span>
      )}
    </>
  );
}

/** A static-first, one-player-at-a-time teaser; full Shorts stays untouched. */
export function LandingShortsPreview({ active, animateEntrance, shorts, visitId }: LandingShortsPreviewProps) {
  const reducedMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const progressRef = useRef(new Map<string, number>());
  const completedRef = useRef(new Set<string>());
  const visitStates = useRef(new Map<string, PreviewVisitState>());
  const visitRef = useRef(visitId);
  const routeActiveRef = useRef(active);
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
  const systemRestricted = Boolean(reducedMotion) || dataSavingEnabled();

  activeIdRef.current = activeId;
  routeActiveRef.current = active;

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

  useLayoutEffect(() => {
    const previousId = visitRef.current;
    if (previousId && !visitStates.current.has(previousId)) {
      visitStates.current.set(previousId, {
        completed: completedRef.current,
        progress: progressRef.current,
        railLeft: railRef.current?.scrollLeft ?? 0,
      });
    }
    if (!visitId) return;
    if (previousId === visitId) {
      // WebKit resets the scroll offset of an element while an ancestor is
      // hidden. Reapply the current visit's position when Home becomes active
      // again, without treating the return as a fresh visit.
      if (active && railRef.current) {
        const frame = requestAnimationFrame(() => {
          if (routeActiveRef.current && railRef.current) {
            const saved = visitStates.current.get(visitId)?.railLeft ?? 0;
            railRef.current.scrollLeft = saved;
          }
        });
        return () => cancelAnimationFrame(frame);
      }
      return;
    }

    controller.destroy();
    const restored = visitStates.current.get(visitId) ?? {
      completed: new Set<string>(),
      progress: new Map<string, number>(),
      railLeft: 0,
    };
    visitStates.current.set(visitId, restored);
    completedRef.current = restored.completed;
    progressRef.current = restored.progress;
    visitRef.current = visitId;
    activeIdRef.current = null;
    setActiveId(null);
    setEligibleIds([]);
    setToken(0);
    setPhase('idle');
    setManualPaused(false);
    requestAnimationFrame(() => {
      if (railRef.current) railRef.current.scrollLeft = restored.railLeft;
    });
  }, [active, controller, visitId]);

  const calculateEligibility = useCallback(() => {
    const rail = railRef.current;
    if (!rail || !active) {
      setEligibleIds([]);
      return;
    }
    const railBox = rect(rail.getBoundingClientRect());
    const headerBottom = document.querySelector('.house-nav')?.getBoundingClientRect().bottom ?? 0;
    const bottomNav = document.querySelector<HTMLElement>('.house-mobile-links');
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
    setNearViewport(false);
    const observer = new IntersectionObserver(
      ([entry]) => setNearViewport(entry.isIntersecting),
      { rootMargin: '400px 0px' },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [visitId]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const onRailScroll = () => {
      // WebKit may emit a zero-offset scroll when a hidden ancestor collapses.
      // It is not a user movement and must not overwrite the visit snapshot.
      if (!routeActiveRef.current) return;
      const state = visitStates.current.get(visitRef.current);
      if (state) {
        state.railLeft = rail.scrollLeft;
      }
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
    const captureBeforeRouteChange = () => {
      if (!routeActiveRef.current || !railRef.current) return;
      const state = visitStates.current.get(visitRef.current);
      if (state) {
        state.railLeft = railRef.current.scrollLeft;
      }
    };
    // hashchange listeners finish before React commits the newly hidden route,
    // while capture-phase clicks cover WebKit builds that flush the parent
    // route update before later hash listeners observe the old layout.
    document.addEventListener('click', captureBeforeRouteChange, true);
    window.addEventListener('hashchange', captureBeforeRouteChange);
    return () => {
      document.removeEventListener('click', captureBeforeRouteChange, true);
      window.removeEventListener('hashchange', captureBeforeRouteChange);
    };
  }, []);

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
    && !systemRestricted;

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
    const visitProgress = progressRef.current;
    const visitCompleted = completedRef.current;
    const nextToken = controller.activate(activeId, visitProgress.get(activeId) || 0);
    setToken(nextToken);
    return () => {
      const progress = controller.deactivate();
      if (!visitCompleted.has(activeId)) visitProgress.set(activeId, progress);
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

  const initial = reducedMotion || LOADED_HIDDEN || !animateEntrance ? false : { opacity: 0, y: 8 };

  return (
    <motion.section
      key={visitId}
      ref={sectionRef}
      className="landing-discovery-section"
      data-tour="landing-discovery"
      initial={initial}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-48px' }}
      transition={{ duration: 0.32, ease: EASE }}
    >
      <div className="landing-section-toolbar">
        <h2>Shorts</h2>
        <div className="landing-section-actions">
          <a className="landing-open" aria-label="Open Shorts" title="Open Shorts"
            href={activeId && token > 0 ? '#/shorts?v=' + encodeURIComponent(activeId) + '&src=landing' : '#/shorts?src=landing'}>
            <ArrowRight size={24} />
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
                >
                  <span className="landing-short-media">
                    <img src={thumbnailForShort(short)} alt="" loading="lazy" />
                  </span>
                </a>
              )}
            </article>
          );
        })}
      </div>
    </motion.section>
  );
}

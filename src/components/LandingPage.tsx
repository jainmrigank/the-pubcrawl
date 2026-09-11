import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from '../icons';
import { EASE, LOADED_HIDDEN } from '../motion';
import { sampleUnique } from '../random';
import type { ShortVideo, WatchVideo } from '../types';
import { LANDING_WATCH_SEED, thumbnailForWatch } from '../watchData';
import { LandingShortsPreview } from './LandingShortsPreview';

interface LandingPageProps {
  active: boolean;
  visitId: string;
  shorts: ShortVideo[];
}

const sectionMotion = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0 },
};

let completeWatchLibrary: Promise<WatchVideo[]> | null = null;

function loadCompleteWatchLibrary() {
  completeWatchLibrary ??= import('../watchLibrary').then(({ STATIC_WATCH_LIBRARY }) => {
    if (!STATIC_WATCH_LIBRARY.videos.length) throw new Error('The reviewed Watch catalogue is empty');
    return STATIC_WATCH_LIBRARY.videos;
  });
  return completeWatchLibrary;
}

/**
 * Home is deliberately independent from Menu. Its media is sourced from the
 * reviewed, build-time catalogues so the first useful paint never waits for
 * an API or mounts the full recipe grid.
 */
export function LandingPage({ active, visitId, shorts }: LandingPageProps) {
  const reducedMotion = useReducedMotion();
  const watchByVisit = useRef(new Map<string, WatchVideo[]>());
  const watchRailRef = useRef<HTMLDivElement>(null);
  const watchRailByVisit = useRef(new Map<string, number>());
  const activeWatchVisit = useRef(visitId);
  const routeActiveRef = useRef(active);
  const animatedVisits = useRef(new Set<string>());
  const [watchState, setWatchState] = useState<{ visitId: string; videos: WatchVideo[] }>({ visitId: '', videos: [] });
  const watch = watchState.visitId === visitId ? watchState.videos : [];
  const shouldAnimate = Boolean(active && visitId && !animatedVisits.current.has(visitId));
  const initial = reducedMotion || LOADED_HIDDEN || !shouldAnimate ? false : 'hidden';
  routeActiveRef.current = active;

  useLayoutEffect(() => {
    if (active && visitId) animatedVisits.current.add(visitId);
  }, [active, visitId]);

  useLayoutEffect(() => {
    activeWatchVisit.current = visitId;
    if (!active || !visitId) return;
    requestAnimationFrame(() => {
      if (watchRailRef.current) watchRailRef.current.scrollLeft = watchRailByVisit.current.get(visitId) ?? 0;
    });
  }, [active, visitId]);

  useEffect(() => {
    if (!active || !visitId) return;
    const remembered = watchByVisit.current.get(visitId);
    if (remembered) {
      setWatchState({ visitId, videos: remembered });
      return;
    }
    let current = true;
    setWatchState({ visitId, videos: [] });
    void loadCompleteWatchLibrary()
      .catch(() => LANDING_WATCH_SEED)
      .then((videos) => {
        const selected = watchByVisit.current.get(visitId)
          ?? sampleUnique(videos, 3, (video) => video.id);
        watchByVisit.current.set(visitId, selected);
        if (current) setWatchState({ visitId, videos: selected });
      });
    return () => { current = false; };
  }, [active, visitId]);

  useEffect(() => {
    const captureBeforeRouteChange = () => {
      if (!routeActiveRef.current || !watchRailRef.current || !activeWatchVisit.current) return;
      watchRailByVisit.current.set(activeWatchVisit.current, watchRailRef.current.scrollLeft);
    };
    document.addEventListener('click', captureBeforeRouteChange, true);
    window.addEventListener('hashchange', captureBeforeRouteChange);
    return () => {
      document.removeEventListener('click', captureBeforeRouteChange, true);
      window.removeEventListener('hashchange', captureBeforeRouteChange);
    };
  }, []);

  return (
    <div className="landing-page" aria-hidden={!active} data-home-visit={visitId}>
      <section className="landing-hero">
        <motion.p
          key={`kicker-${visitId}`}
          className="landing-kicker k-label"
          initial={initial}
          animate="shown"
          variants={sectionMotion}
          transition={{ duration: 0.4, ease: EASE }}
        >
          Every bar, one kitchen
        </motion.p>
        <motion.h1
          key={`title-${visitId}`}
          className="landing-title"
          initial={initial}
          animate="shown"
          variants={sectionMotion}
          transition={{ duration: 0.4, delay: reducedMotion ? 0 : 0.06, ease: EASE }}
        >
          <span>What’s your</span>
          <span>poison?</span>
        </motion.h1>
        <motion.div
          key={`actions-${visitId}`}
          className="landing-actions"
          initial={initial}
          animate="shown"
          variants={sectionMotion}
          transition={{ duration: 0.36, delay: reducedMotion ? 0 : 0.14, ease: EASE }}
        >
          <a className="btn btn-solid" href="#/bar" data-tour="landing-make">
            What can I make? <ArrowRight size={14} />
          </a>
          <a className="btn" href="#/menu" data-tour="landing-browse">
            Browse all drinks <ArrowRight size={14} />
          </a>
        </motion.div>
      </section>

      <LandingShortsPreview
        active={active}
        animateEntrance={shouldAnimate}
        shorts={shorts}
        visitId={visitId}
      />

      <motion.section
        key={`watch-${visitId}`}
        className="landing-discovery-section"
        initial={initial}
        whileInView="shown"
        viewport={{ once: true, margin: '-48px' }}
        variants={sectionMotion}
        transition={{ duration: 0.32, ease: EASE }}
      >
        <div className="landing-section-toolbar">
          <h2>Watch</h2>
          <a className="btn landing-open" href="#/watch?src=landing">
            Open Watch <ArrowRight size={14} />
          </a>
        </div>
        <div
          ref={watchRailRef}
          className="landing-media-rail landing-watch-rail"
          aria-label="Watch previews"
          aria-busy={watch.length === 0}
          onScroll={(event) => watchRailByVisit.current.set(visitId, event.currentTarget.scrollLeft)}
        >
          {watch.map((video) => (
            <article className="landing-watch-card" key={video.id} data-preview-id={video.id}>
              <a href={`#/watch?v=${encodeURIComponent(video.id)}&src=landing`}>
                <span className="landing-watch-media">
                  <img src={thumbnailForWatch(video)} alt="" loading="lazy" />
                </span>
                <span className="landing-card-title">{video.title}</span>
                <span className="landing-card-by k-label dim">{video.channel}</span>
              </a>
            </article>
          ))}
        </div>
      </motion.section>

      <motion.nav
        key={`more-${visitId}`}
        className="landing-secondary-links"
        aria-label="More to explore"
        initial={initial}
        whileInView="shown"
        viewport={{ once: true, margin: '-48px' }}
        variants={sectionMotion}
        transition={{ duration: 0.32, ease: EASE }}
      >
        {[
          ['Pub Quiz', '#/quiz'],
          ['Bar Basics', '#/basics'],
          ['Your Tab', '#/tab'],
        ].map(([label, href]) => (
          <a href={href} key={href}>
            <span>{label}</span>
            <ArrowRight size={14} />
          </a>
        ))}
      </motion.nav>
    </div>
  );
}

// import { useEffect, useLayoutEffect, useRef, useState } from 'react';
// import { motion, useReducedMotion } from 'framer-motion';
// import { ArrowRight } from '../icons';
// import { EASE, LOADED_HIDDEN } from '../motion';
// import { sampleUnique } from '../random';
import type { ShortVideo /*, WatchVideo */ } from '../types';
import { lazy, Suspense, useEffect, useState } from 'react';
import { ArrowDown, ArrowRight } from '../icons';
import { EditorialLinks } from './landing/EditorialLinks';
import './landing/home.css';
// import { LANDING_WATCH_SEED, thumbnailForWatch } from '../watchData';
// import { LandingShortsPreview } from './LandingShortsPreview';
// Shelved at the user's request: SpritzHero, FlavourCompass and BarStories.
// Their components and artwork remain in ./landing for later use.
const LandingHighlights = lazy(() => import('./landing/LandingHighlights'));

interface LandingPageProps {
  active: boolean;
  visitId: string;
  shorts: ShortVideo[];
}

// const sectionMotion = {
//   hidden: { opacity: 0, y: 8 },
//   shown: { opacity: 1, y: 0 },
// };

// Temporarily paused with the Watch section; do not load its catalogue.
// let completeWatchLibrary: Promise<WatchVideo[]> | null = null;
//
// function loadCompleteWatchLibrary() {
//   completeWatchLibrary ??= import('../watchLibrary').then(({ STATIC_WATCH_LIBRARY }) => {
//     if (!STATIC_WATCH_LIBRARY.videos.length) throw new Error('The reviewed Watch catalogue is empty');
//     return STATIC_WATCH_LIBRARY.videos;
//   });
//   return completeWatchLibrary;
// }
//
/**
 * Home is deliberately independent from Menu. Its media is sourced from the
 * reviewed, build-time catalogues so the first useful paint never waits for
 * an API or mounts the full recipe grid.
 */
export function LandingPage({ active, visitId }: LandingPageProps) {
  // The analytical index is separate from the full recipe catalogue. Only load
  // it after visiting Home; keep it mounted afterwards for Back restoration.
  const [activated, setActivated] = useState(active);
  useEffect(() => { if (active) setActivated(true); }, [active]);
  // Temporarily paused: media preview state and loading.
//   const reducedMotion = useReducedMotion();
//   const watchByVisit = useRef(new Map<string, WatchVideo[]>());
//   const watchRailRef = useRef<HTMLDivElement>(null);
//   const watchRailByVisit = useRef(new Map<string, number>());
//   const activeWatchVisit = useRef(visitId);
//   const routeActiveRef = useRef(active);
//   const animatedVisits = useRef(new Set<string>());
//   const [watchState, setWatchState] = useState<{ visitId: string; videos: WatchVideo[] }>({ visitId: '', videos: [] });
//   const watch = watchState.visitId === visitId ? watchState.videos : [];
//   const shouldAnimate = Boolean(active && visitId && !animatedVisits.current.has(visitId));
//   const initial = reducedMotion || LOADED_HIDDEN || !shouldAnimate ? false : 'hidden';
//   routeActiveRef.current = active;
//
//   useLayoutEffect(() => {
//     if (active && visitId) animatedVisits.current.add(visitId);
//   }, [active, visitId]);
//
//   useLayoutEffect(() => {
//     activeWatchVisit.current = visitId;
//     if (!active || !visitId) return;
//     requestAnimationFrame(() => {
//       if (watchRailRef.current) watchRailRef.current.scrollLeft = watchRailByVisit.current.get(visitId) ?? 0;
//     });
//   }, [active, visitId]);
//
//   useEffect(() => {
//     if (!active || !visitId) return;
//     const remembered = watchByVisit.current.get(visitId);
//     if (remembered) {
//       setWatchState({ visitId, videos: remembered });
//       return;
//     }
//     let current = true;
//     setWatchState({ visitId, videos: [] });
//     void loadCompleteWatchLibrary()
//       .catch(() => LANDING_WATCH_SEED)
//       .then((videos) => {
//         const selected = watchByVisit.current.get(visitId)
//           ?? sampleUnique(videos, 3, (video) => video.id);
//         watchByVisit.current.set(visitId, selected);
//         if (current) setWatchState({ visitId, videos: selected });
//       });
//     return () => { current = false; };
//   }, [active, visitId]);
//
//   useEffect(() => {
//     const captureBeforeRouteChange = () => {
//       if (!routeActiveRef.current || !watchRailRef.current || !activeWatchVisit.current) return;
//       watchRailByVisit.current.set(activeWatchVisit.current, watchRailRef.current.scrollLeft);
//     };
//     document.addEventListener('click', captureBeforeRouteChange, true);
//     window.addEventListener('hashchange', captureBeforeRouteChange);
//     return () => {
//       document.removeEventListener('click', captureBeforeRouteChange, true);
//       window.removeEventListener('hashchange', captureBeforeRouteChange);
//     };
//   }, []);
//
  return (
    <div className="landing-page home-edition" aria-hidden={!active} data-home-visit={visitId}>
      <section className="home-opening" aria-labelledby="home-title">
        <div>
          <p className="house-eyebrow">GOOD TASTE. NO GUESSWORK.</p>
          <h1 id="home-title"><span>What’s your</span> <em>poison?</em></h1>
        </div>
        <div className="home-opening-note">
          <p>Find your drink.<br />Use what you have.</p>
          <div className="home-actions">
            <a href="#/bar" data-tour="landing-make">What can I make? <ArrowRight size={20} /></a>
            <a href="#/menu" data-tour="landing-browse">Browse all drinks <ArrowRight size={20} /></a>
            <a href="#/taste-map" data-tour="landing-taste">Taste Map <ArrowRight size={20} /></a>
          </div>
        </div>
        <span className="home-scroll-cue" aria-hidden="true">A better round starts below <ArrowDown size={17} /></span>
      </section>
      {(activated || active) && <Suspense fallback={<p className="home-loading" role="status">Loading studies…</p>}><LandingHighlights /></Suspense>}

      {/* Temporarily paused: landing Shorts previews. Uncomment to restore.
      <LandingShortsPreview
        active={active}
        animateEntrance={shouldAnimate}
        shorts={shorts}
        visitId={visitId}
      />
      */}

      {/* Temporarily paused: landing Watch previews. Uncomment to restore.
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
          <a className="landing-open" href="#/watch?src=landing" aria-label="Open Watch" title="Open Watch">
            <ArrowRight size={24} />
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
      */}

      <EditorialLinks />
    </div>
  );
}

import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from '../icons';
import { EASE, LOADED_HIDDEN } from '../motion';
import { LANDING_WATCH_SEED, thumbnailForWatch } from '../watchData';
import { LandingShortsPreview } from './LandingShortsPreview';

const WATCH_IDS = ['i1iqVGORUck', 'b0IuTL3Z-kk', 'GE8vyfKyZfQ'] as const;

interface LandingPageProps {
  active: boolean;
  onNavigate: () => void;
}

const sectionMotion = {
  hidden: { opacity: 0, y: 12 },
  shown: { opacity: 1, y: 0 },
};

/**
 * Home is deliberately independent from Menu. Its media is sourced from the
 * reviewed, build-time catalogues so the first useful paint never waits for
 * an API or mounts the full recipe grid.
 */
export function LandingPage({ active, onNavigate }: LandingPageProps) {
  const reducedMotion = useReducedMotion();
  const watch = WATCH_IDS
    .map((id) => LANDING_WATCH_SEED.find((video) => video.id === id))
    .filter((video): video is NonNullable<typeof video> => Boolean(video));
  const initial = reducedMotion || LOADED_HIDDEN ? false : 'hidden';

  return (
    <div className="landing-page" aria-hidden={!active}>
      <section className="landing-hero">
        <motion.p
          className="landing-kicker k-label"
          initial={initial}
          animate="shown"
          variants={sectionMotion}
          transition={{ duration: 0.4, ease: EASE }}
        >
          EVERY BAR, ONE KITCHEN
        </motion.p>
        <motion.h1
          className="landing-title"
          initial={initial}
          animate="shown"
          variants={sectionMotion}
          transition={{ duration: 0.45, delay: reducedMotion ? 0 : 0.08, ease: EASE }}
        >
          <span>WHAT’S YOUR</span>
          <span>POISON?</span>
        </motion.h1>
        <motion.div
          className="landing-actions"
          initial={initial}
          animate="shown"
          variants={sectionMotion}
          transition={{ duration: 0.4, delay: reducedMotion ? 0 : 0.18, ease: EASE }}
        >
          <a className="btn btn-solid" href="#/bar" data-tour="landing-make" onClick={onNavigate}>
            WHAT CAN I MAKE? <ArrowRight size={14} />
          </a>
          <a className="btn" href="#/menu" data-tour="landing-browse" onClick={onNavigate}>
            BROWSE ALL DRINKS <ArrowRight size={14} />
          </a>
        </motion.div>
      </section>

      <LandingShortsPreview active={active} onNavigate={onNavigate} />

      <motion.section
        className="landing-discovery-section"
        initial={initial}
        whileInView="shown"
        viewport={{ once: true, margin: '-48px' }}
        variants={sectionMotion}
        transition={{ duration: 0.4, ease: EASE }}
      >
        <div className="landing-section-toolbar">
          <h2>WATCH</h2>
          <a className="btn landing-open" href="#/watch?src=landing" onClick={onNavigate}>
            OPEN WATCH <ArrowRight size={14} />
          </a>
        </div>
        <div className="landing-media-rail landing-watch-rail" aria-label="Watch previews">
          {watch.map((video) => (
            <article className="landing-watch-card" key={video.id}>
              <a href={`#/watch?v=${encodeURIComponent(video.id)}&src=landing`} onClick={onNavigate}>
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
        className="landing-secondary-links"
        aria-label="More to explore"
        initial={initial}
        whileInView="shown"
        viewport={{ once: true, margin: '-48px' }}
        variants={sectionMotion}
        transition={{ duration: 0.4, ease: EASE }}
      >
        {[
          ['PUB QUIZ', '#/quiz'],
          ['BAR BASICS', '#/basics'],
          ['YOUR TAB', '#/tab'],
        ].map(([label, href]) => (
          <a href={href} key={href} onClick={onNavigate}>
            <span>{label}</span>
            <ArrowRight size={14} />
          </a>
        ))}
      </motion.nav>
    </div>
  );
}

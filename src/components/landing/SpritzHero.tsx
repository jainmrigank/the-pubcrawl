import { useLayoutEffect, useRef, useState, useId } from 'react';
import { motion, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform, type MotionValue } from 'framer-motion';
import { ArrowRight } from '../../icons';
import { EASE } from '../../motion';

const chapters = [
  ['Scroll to build a Spritz.', 'Find recipes, use your ingredients and save your favourites.'],
  ['Start with your ingredients.', 'Add what you have to My Shelf. We’ll find matching recipes.'],
  ['Learn as you go.', 'Recipes, short demonstrations and Bar Basics.'],
  ['Keep a few favourites.', 'Save drinks to Your Tab and come back when you’re ready.'],
  ['Find your next drink.', 'Explore the Taste Map or start with your ingredients.'],
];

function Ice({ progress, x, y, angle, delay }: { progress: MotionValue<number>; x: number; y: number; angle: number; delay: number }) {
  const drop = useTransform(progress, [delay, delay + 0.075], [-230, 0]);
  const opacity = useTransform(progress, [delay, delay + 0.018], [0, 1]);
  return <motion.g style={{ y: drop, opacity }}>
    <g transform={'translate(' + x + ' ' + y + ') rotate(' + angle + ')'}>
      <rect width="65" height="66" rx="12" fill="#fff" fillOpacity=".18" stroke="currentColor" strokeOpacity=".35" />
      <path d="M9 48V18Q9 9 18 9H43M14 56H46Q56 56 56 46V28" fill="none" stroke="#fff" strokeOpacity=".65" strokeWidth="2" />
      <path d="M22 13 35 26 25 43" fill="none" stroke="currentColor" strokeOpacity=".12" />
    </g>
  </motion.g>;
}

export function SpritzGlass({ progress }: { progress: MotionValue<number> }) {
  const id = useId().replace(/:/g, '');
  const level = useTransform(progress, [0, .28, .48, .66, .8, 1], [340, 340, 254, 198, 176, 176]);
  const liquidOpacity = useTransform(progress, [.28, .32], [0, .9]);
  const liquidColour = useTransform(progress, [.28, .48, .66], ['#d8b568', '#d8b568', '#ed6e24']);
  const prosecco = useTransform(progress, [.28, .30, .46, .48], [0, .6, .6, 0]);
  const aperol = useTransform(progress, [.48, .50, .64, .66], [0, .82, .82, 0]);
  const soda = useTransform(progress, [.66, .68, .77, .8], [0, .65, .65, 0]);
  const bubbleOpacity = useTransform(progress, [.66, .76, .84], [0, .8, .45]);
  const bubbleRise = useTransform(progress, [.66, .84], [80, 0]);
  const spoonOpacity = useTransform(progress, [.7, .72, .8, .84], [0, .65, .65, 0]);
  const stir = useTransform(progress, [.7, .74, .78, .82], [-12, 10, -7, 0]);
  const spoonTransform = useTransform(stir, (angle) => 'rotate(' + angle + ' 260 265)');
  const garnishY = useTransform(progress, [.84, .95], [-90, 0]);
  const garnishRotate = useTransform(progress, [.84, .95], [-24, 12]);
  const garnishOpacity = useTransform(progress, [.84, .88], [0, 1]);
  const garnishTransform = useTransform([garnishY, garnishRotate], ([y, angle]) => 'translate(0 ' + y + ') rotate(' + angle + ' 375 132)');
  return (
    <svg className="spritz-glass" viewBox="0 0 520 600" fill="none" aria-hidden="true">
      <defs>
        <clipPath id={id + 'bowl'}><path d="M140 108C128 158 127 234 160 279C185 315 218 334 260 334C302 334 335 315 360 279C393 234 392 158 380 108Z" /></clipPath>
        <linearGradient id={id + 'glass'} x1="120" y1="180" x2="400" y2="230" gradientUnits="userSpaceOnUse">
          <stop stopColor="currentColor" stopOpacity=".05" /><stop offset=".34" stopColor="currentColor" stopOpacity="0" />
          <stop offset=".84" stopColor="currentColor" stopOpacity=".025" /><stop offset="1" stopColor="currentColor" stopOpacity=".12" />
        </linearGradient>
      </defs>
      <ellipse cx="260" cy="565" rx="112" ry="13" fill="currentColor" fillOpacity=".045" />
      <path d="M252 334V495Q252 516 191 537Q165 546 167 551Q181 565 260 565Q339 565 353 551Q355 546 329 537Q268 516 268 495V334" fill={'url(#' + id + 'glass)'} stroke="currentColor" strokeOpacity=".5" strokeWidth="1.3" />
      <path d="M259 355V494M180 549Q260 560 340 549" stroke="currentColor" strokeOpacity=".2" />
      <g clipPath={'url(#' + id + 'bowl)'}>
        <path d="M140 108H380V340H140Z" fill={'url(#' + id + 'glass)'} />
        <motion.rect data-spritz-liquid="" x="122" width="276" height="330" style={{ y: level, fill: liquidColour, opacity: liquidOpacity }} />
        <motion.ellipse cx="260" rx="130" ry="13" style={{ cy: level, fill: liquidColour, opacity: liquidOpacity }} stroke="#fff" strokeOpacity=".35" />
        <Ice progress={progress} x={175} y={226} angle={-18} delay={.12} />
        <Ice progress={progress} x={264} y={240} angle={16} delay={.145} />
        <Ice progress={progress} x={219} y={179} angle={11} delay={.18} />
        <Ice progress={progress} x={291} y={178} angle={-16} delay={.205} />
        <motion.g style={{ opacity: bubbleOpacity, y: bubbleRise }} stroke="#fff" strokeWidth="1.4">
          {[[170,218,3],[190,277,2],[210,245,4],[247,302,2],[265,205,3],[283,286,2],[302,224,4],[333,263,3],[348,198,2],[242,259,2],[321,304,2]].map(([cx,cy,r], i) =>
            <circle key={i} cx={cx} cy={cy} r={r} />)}
        </motion.g>
      </g>
      <motion.path d="M212 -20C212 31 229 62 229 147V263" stroke="#cba85b" strokeWidth="8" strokeLinecap="round" style={{ opacity: prosecco }} />
      <motion.path d="M315 -20C315 44 285 74 285 147V206" stroke="#e76b29" strokeWidth="9" strokeLinecap="round" style={{ opacity: aperol }} />
      <motion.path d="M236 -20V185" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ opacity: soda }} />
      <motion.g transform={spoonTransform} style={{ opacity: spoonOpacity }}>
        <path d="M261 26V276" stroke="currentColor" strokeWidth="2" /><ellipse cx="261" cy="277" rx="7" ry="13" stroke="currentColor" />
      </motion.g>
      <path d="M140 108C128 158 127 234 160 279C185 315 218 334 260 334C302 334 335 315 360 279C393 234 392 158 380 108" stroke="currentColor" strokeOpacity=".64" strokeWidth="1.6" />
      <ellipse cx="260" cy="108" rx="120" ry="23" stroke="currentColor" strokeOpacity=".64" strokeWidth="1.4" />
      <path d="M150 143C143 202 156 254 181 278M365 151C372 202 359 264 336 282" stroke="#fff" strokeOpacity=".6" strokeWidth="3" strokeLinecap="round" />
      <motion.g data-spritz-garnish="" transform={garnishTransform} style={{ opacity: garnishOpacity }}>
        <path d="M329 132A49 49 0 0 1 427 132Z" fill="#e97229" fillOpacity=".86" stroke="#cf571e" strokeWidth="2" />
        <path d="M337 129A41 41 0 0 1 419 129Z" fill="#f5b665" fillOpacity=".55" stroke="#ffe0a8" strokeOpacity=".8" strokeWidth="2" />
        <path d="M378 126V93M378 126 351 101M378 126 405 101M378 126 339 118M378 126 417 118" stroke="#ffe0a8" strokeWidth="1.4" />
      </motion.g>
      <path d="M147 379H198M322 379H373" stroke="currentColor" strokeOpacity=".17" />
      <text x="260" y="401" textAnchor="middle" fill="currentColor" opacity=".42" fontSize="9" letterSpacing="3">APERITIVO, ANYTIME</text>
    </svg>
  );
}

export function SpritzHero({ active, visitId }: { active: boolean; visitId: string }) {
  const reduced = useReducedMotion();
  const section = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const progress = useMotionValue(reduced ? 1 : 0);
  const [chapter, setChapter] = useState(reduced ? 4 : 0);
  const visited = useRef(new Set<string>());
  const entrance = !visited.current.has(visitId);
  useMotionValueEvent(progress, 'change', (p) => setChapter(p >= .84 ? 4 : p >= .66 ? 3 : p >= .28 ? 2 : p >= .12 ? 1 : 0));

  useLayoutEffect(() => {
    if (!active) return;
    visited.current.add(visitId);
    let frame = 0;
    const measure = () => {
      const el = section.current;
      const stage = stageRef.current;
      if (!el || !stage) return;
      const header = document.querySelector('.house-nav')?.getBoundingClientRect().height ?? 80;
      const nav = document.querySelector<HTMLElement>('.house-mobile-links');
      const bottom = nav && getComputedStyle(nav).display !== 'none' ? nav.getBoundingClientRect().height : 0;
      el.style.setProperty('--hero-top', header + 'px');
      el.style.setProperty('--hero-bottom', bottom + 'px');
      const top = el.getBoundingClientRect().top;
      const travel = el.offsetHeight - stage.offsetHeight;
      progress.set(reduced ? 1 : Math.max(0, Math.min(1, (header - top) / Math.max(1, travel))));
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    measure();
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); };
  }, [active, visitId, reduced, progress]);

  return <section ref={section} className={'landing-hero spritz-hero' + (reduced ? ' is-still' : '')} data-chapter={chapter} aria-label="Aperol Spritz, made as you scroll">
    <div className="spritz-stage" ref={stageRef}>
      <div className="spritz-topline">
        <p className="landing-kicker k-label">YOUR NEXT DRINK STARTS HERE</p>
        <a className="hero-skip" href="#/menu">Skip to drinks <ArrowRight size={14} /></a>
      </div>
      <motion.h1 className="landing-title spritz-title" key={visitId} data-tour="landing-ritual"
        initial={entrance && !reduced ? { opacity: 0, y: 12 } : false}
        animate={{ opacity: 1, y: 0 }} transition={{ duration: .65, ease: EASE }}>
        <span>What’s your</span>
        <span className="spritz-poison">poison?
          <svg className="peel-flourish" viewBox="0 0 470 70" fill="none" aria-hidden="true">
            <motion.path d="M7 49C92 5 315 12 414 34C461 45 461 11 426 10C395 9 403 59 459 59"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" initial={entrance && !reduced ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }} transition={{ duration: .65, delay: .1, ease: EASE }} />
          </svg>
        </span>
      </motion.h1>
      <div className="spritz-visual"><SpritzGlass progress={progress} /></div>
      <div className="spritz-copy-slot">
        <motion.div key={chapter} initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .22, ease: EASE }}>
          <p className="spritz-chapter k-label">0{chapter + 1} / 05</p>
          <h2>{chapters[chapter][0]}</h2>
          <p className="spritz-hint">{chapters[chapter][1]}</p>
        </motion.div>
      </div>
      <div className="spritz-actions-slot">
        <div className="landing-actions" hidden={chapter !== 4}>
          <a className="btn btn-solid" href="#/bar" data-tour="landing-make">What can I make? <ArrowRight size={16} /></a>
          <a className="btn landing-browse-link" href="#/menu">Browse All Drinks <ArrowRight size={16} /></a>
        </div>
      </div>
      <div className="spritz-foot"><span className="k-label">01 — THE HOUSE RITUAL</span>
        <span className="spritz-track" aria-hidden="true"><motion.i style={{ scaleX: progress }} /></span>
        <a href="#/menu?q=Aperol%20Spritz" className="k-label">Aperol Spritz ↗</a>
      </div>
    </div>
  </section>;
}

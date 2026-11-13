import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from '../../icons';
import { EASE } from '../../motion';

const flavours = [
  { label: 'Fresh & Citrus', hint: 'Something sharp.', id: 'refreshing', angle: 225 },
  { label: 'Spirit-forward', hint: 'Less small talk.', id: 'boozy', angle: 315 },
  { label: 'Tropical', hint: 'Out of office.', id: 'tropical', angle: 135 },
  { label: 'Sweet & Dessert', hint: 'One for after.', id: 'sweet', angle: 45 },
];

function arc(angle: number) {
  const point = (degrees: number) => [260 + 180 * Math.cos(degrees * Math.PI / 180), 260 + 180 * Math.sin(degrees * Math.PI / 180)];
  const start = point(angle - 40);
  const end = point(angle + 40);
  return 'M' + start.join(' ') + 'A180 180 0 0 1 ' + end.join(' ');
}

export function FlavourCompass() {
  const reduced = useReducedMotion();
  const [active, setActive] = useState<number | null>(null);
  return <section className="flavour-section landing-discovery-section" aria-labelledby="flavour-title">
    <div className="flavour-intro">
      <p className="k-label">Find your way in</p>
      <h2 id="flavour-title">Browse{' '}<br />by <em>flavour.</em></h2>
      <p>Choose a flavour to browse matching drinks.</p>
      <span className="compass-side-note k-label">A starting point, no tasting vocabulary needed.</span>
    </div>
    <div className="flavour-compass" onMouseLeave={() => setActive(null)}>
      <svg viewBox="0 0 520 520" fill="none" className="compass-rim" aria-hidden="true">
        <circle cx="260" cy="260" r="165" stroke="currentColor" strokeOpacity=".1" />
        <motion.circle cx="260" cy="260" r="189" stroke="currentColor" strokeOpacity=".16"
          initial={reduced ? false : { pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }}
          transition={{ duration: .75, ease: EASE }} />
        {flavours.map((flavour, i) => <path key={flavour.id} d={arc(flavour.angle)} className={active === i ? 'is-highlighted' : ''} />)}
        <path d="M260 53V68M260 452V467M53 260H68M452 260H467" stroke="currentColor" strokeOpacity=".4" />
        <motion.g animate={{ x: 180 * Math.cos(flavours[active ?? 0].angle * Math.PI / 180), y: 180 * Math.sin(flavours[active ?? 0].angle * Math.PI / 180) }}
          transition={{ duration: reduced ? 0 : .22, ease: EASE }}>
          <circle cx="260" cy="260" r="11" fill="var(--accent)" /><path d="M254 260H266M260 254V266" stroke="var(--paper)" strokeOpacity=".7" />
        </motion.g>
      </svg>
      {flavours.map((flavour, i) => <a key={flavour.id} className={'compass-choice compass-choice-' + i}
        href={'#/menu?filter=' + encodeURIComponent('category:' + flavour.id)}
        onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}>
        <span className="compass-choice-number k-label">0{i + 1} <ArrowRight size={14} /></span>
        <strong>{flavour.label}</strong><span>{flavour.hint}</span>
      </a>)}
      <a className="compass-centre" href="#/menu" aria-label="Browse all drinks" data-tour="landing-browse">
        <span className="k-label">The whole menu</span><span>Browse<br />all drinks</span><ArrowRight size={20} />
      </a>
    </div>
  </section>;
}

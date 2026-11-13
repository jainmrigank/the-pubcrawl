import { motion, useReducedMotion } from 'framer-motion';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { EASE } from '../../motion';

interface Props {
  id: string;
  number: string;
  label: string;
  title: string;
  intro: string;
  meta: string;
  defaultOpen?: boolean;
  className?: string;
  tour?: string;
  children: ReactNode;
}

/** An editorial chapter, with a persistent overview and a stateful reading panel. */
export function HomeStudy({ id, number, label, title, intro, meta, defaultOpen = false, className = '', tour, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [folded, setFolded] = useState(!defaultOpen);
  const reduced = useReducedMotion();
  const trigger = useRef<HTMLButtonElement>(null);
  const section = useRef<HTMLElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const returnToHeading = useRef(false);
  const currentOpen = useRef(open);
  currentOpen.current = open;
  const prefix = `home-${id}`;
  useLayoutEffect(() => { if (panel.current) panel.current.inert = !open; }, [open]);
  useLayoutEffect(() => {
    if (!folded || !returnToHeading.current) return;
    returnToHeading.current = false;
    // Wait for the closed panel's final layout. Scrolling while its height is
    // shrinking can be cancelled by native scroll anchoring in Chromium.
    const frame = requestAnimationFrame(() => {
      if (!section.current?.getClientRects().length) return;
      trigger.current?.focus({ preventScroll: true });
      const top = trigger.current?.getBoundingClientRect().top ?? 0;
      const navigationBottom = document.querySelector('.house-nav')?.getBoundingClientRect().bottom ?? 80;
      if (top < navigationBottom) section.current.scrollIntoView({ block: 'start', behavior: reduced ? 'instant' : 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [folded, reduced]);

  const toggle = () => {
    returnToHeading.current = false;
    if (!open) setFolded(false);
    setOpen(value => !value);
  };
  const foldFromEnd = () => {
    returnToHeading.current = true;
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };

  return <section ref={section} className={`home-story home-study ${className}`} id={prefix} data-home-story={id} data-open={open} data-tour={tour} aria-labelledby={`${prefix}-title`}>
    <header className="home-story-heading">
      <h3 className="home-study-heading">
        <button ref={trigger} type="button" className="home-study-toggle" id={`${prefix}-trigger`} aria-labelledby={`${prefix}-title`} aria-describedby={`${prefix}-intro`} aria-expanded={open} aria-controls={`${prefix}-panel`} onClick={toggle}>
          <span className="home-section-number" aria-hidden="true">{number}</span>
          <span className="home-study-copy">
            <span className="house-eyebrow">{label}</span>
            <span className="home-study-title" id={`${prefix}-title`}>{title}</span>
            <span className="home-story-intro" id={`${prefix}-intro`}>{intro}</span>
            <span className="home-study-meta">{meta}</span>
          </span>
          <span className="home-study-action" aria-hidden="true">
            <span className="home-study-mark"><svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M12 5v14" stroke="currentColor" strokeWidth="1.25" /></svg></span>
            <span>{open ? 'Fold study' : 'View study'}</span>
          </span>
        </button>
      </h3>
    </header>
    <motion.div
      className="home-study-panel"
      id={`${prefix}-panel`}
      role="region"
      aria-labelledby={`${prefix}-title`}
      aria-hidden={!open}
      hidden={folded}
      // Keep charts mounted so folding never resets their controls. Inert also
      // removes descendants from keyboard navigation during the closing motion.
      ref={panel}
      initial={false}
      animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
      transition={{ height: { duration: reduced ? 0 : .28, ease: EASE }, opacity: { duration: reduced ? 0 : .16 } }}
      onAnimationComplete={() => { if (!currentOpen.current) setFolded(true); }}
    >
      <div className="home-study-content">
        {children}
        <button type="button" className="home-study-fold" onClick={foldFromEnd}>Fold this study <span aria-hidden="true">↑</span></button>
      </div>
    </motion.div>
  </section>;
}

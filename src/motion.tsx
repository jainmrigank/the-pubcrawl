/**
 * Shared motion system — one easing, three speeds, mask reveals and counters.
 * All entrance motion runs once, on first scroll into view.
 */
import { motion, useInView, useReducedMotion, animate } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export const EASE: [number, number, number, number] = [0.22, 0.9, 0.3, 1];

/**
 * True when the page loaded in a hidden/background tab. requestAnimationFrame
 * doesn't tick there, so entrance animations would freeze content at its
 * invisible initial frame — in that case we skip entrances entirely.
 */
export const LOADED_HIDDEN =
  typeof document !== 'undefined' && document.visibilityState === 'hidden';

/** Fade-and-rise reveal for blocks. */
export function Reveal({
  children,
  delay = 0,
  y = 26,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={LOADED_HIDDEN ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Line-by-line masked heading reveal. Pass each visual line as a string.
 * The observer sits on the (un-clipped) heading; the clipped inner spans
 * animate as variant children — observing them directly never fires because
 * overflow:hidden clips them out of the intersection rect.
 */
const MOTION_TAGS = { h1: motion.h1, h2: motion.h2, p: motion.p, div: motion.div } as const;

export function Lines({
  lines,
  as = 'h1',
  className,
  stagger = 0.12,
}: {
  lines: string[];
  as?: keyof typeof MOTION_TAGS;
  className?: string;
  stagger?: number;
}) {
  const Tag = MOTION_TAGS[as];
  return (
    <Tag
      className={className}
      initial={LOADED_HIDDEN ? false : 'hidden'}
      whileInView="show"
      viewport={{ once: true, margin: '-40px' }}
      transition={{ staggerChildren: stagger }}
    >
      {lines.map((line, i) => (
        <span className="mask" key={i}>
          <motion.span
            className="mask-inner"
            variants={{
              hidden: { y: '112%' },
              show: { y: '0%', transition: { duration: 0.8, delay: i * stagger, ease: EASE } },
            }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}

/** Horizontal rule that draws itself in. */
export function Rule({ delay = 0 }: { delay?: number }) {
  return (
    <motion.div
      className="rule"
      initial={LOADED_HIDDEN ? false : { scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.9, delay, ease: EASE }}
      style={{ transformOrigin: 'left' }}
    />
  );
}

/**
 * Counts up when scrolled into view. Always lands on the final number —
 * if the animation can't run (reduced motion, hidden/background tab, or it
 * gets interrupted) the value snaps to `to` instead of freezing mid-count.
 */
export function Counter({ to, duration = 1.4 }: { to: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduced = useReducedMotion();
  const [val, setVal] = useState(0);
  const current = useRef(0);
  useEffect(() => {
    if (!inView) return;
    if (reduced || document.visibilityState === 'hidden') {
      current.current = to;
      setVal(to);
      return;
    }
    // continue from wherever the count already is — when the live number
    // arrives mid-animation the counter glides on instead of restarting at 0
    const from = current.current;
    const controls = animate(from, to, {
      duration: from > 0 ? Math.min(0.6, duration) : duration,
      ease: EASE,
      onUpdate: (v) => {
        current.current = Math.round(v);
        setVal(current.current);
      },
      onComplete: () => {
        current.current = to;
        setVal(to);
      },
    });
    const snap = () => {
      if (document.visibilityState === 'hidden') {
        controls.stop();
        current.current = to;
        setVal(to);
      }
    };
    document.addEventListener('visibilitychange', snap);
    const safety = setTimeout(() => {
      current.current = to;
      setVal(to);
    }, duration * 1000 + 400);
    return () => {
      controls.stop();
      clearTimeout(safety);
      document.removeEventListener('visibilitychange', snap);
    };
  }, [inView, to, duration, reduced]);

  // Last-resort net, independent of the observer: if nothing has moved the
  // value off 0 shortly after mount (observer never fired, animation dead),
  // show the real number rather than a stuck zero.
  useEffect(() => {
    const t = setTimeout(() => setVal((v) => (v === 0 && to !== 0 ? to : v)), 2500);
    return () => clearTimeout(t);
  }, [to]);

  return <span ref={ref}>{val}</span>;
}

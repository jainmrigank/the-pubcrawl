/**
 * Shared motion system — one easing, three speeds, mask reveals and counters.
 * All entrance motion runs once, on first scroll into view.
 */
import { motion, useInView, useReducedMotion, animate } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export const EASE: [number, number, number, number] = [0.22, 0.9, 0.3, 1];

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
      initial={{ opacity: 0, y }}
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
      initial="hidden"
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
      initial={{ scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.9, delay, ease: EASE }}
      style={{ transformOrigin: 'left' }}
    />
  );
}

/** Counts up when scrolled into view. */
export function Counter({ to, duration = 1.4 }: { to: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduced = useReducedMotion();
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setVal(to);
      return;
    }
    const controls = animate(0, to, {
      duration,
      ease: EASE,
      onUpdate: (v) => setVal(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, to, duration, reduced]);
  return <span ref={ref}>{val}</span>;
}

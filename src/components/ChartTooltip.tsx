import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './chart-tooltip.css';

export function ChartTooltip({ label, children, className = '', style, focusable = false }: {
  label: string; children: ReactNode; className?: string; style?: CSSProperties; focusable?: boolean;
}) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const show = () => {
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;
    const below = rect.top < 128;
    setPosition({ x: Math.max(124, Math.min(innerWidth - 124, rect.left + rect.width / 2)), y: below ? rect.bottom + 9 : rect.top - 9, below });
  };
  useEffect(() => {
    if (!position) return;
    const close = () => setPosition(null);
    const scroll = () => {
      // Native keyboard focus can scroll the key into view after onFocus.
      // Keep that tooltip attached; pointer-only tips dismiss on scrolling.
      const element = anchor.current;
      const rect = element?.getBoundingClientRect();
      if (element === document.activeElement && rect && rect.bottom > 0 && rect.top < innerHeight) show();
      else close();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', close);
    window.addEventListener('hashchange', close);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('hashchange', close);
      window.removeEventListener('keydown', escape);
    };
  }, [position]);
  return <>
    <span ref={anchor} className={`chart-tooltip-anchor ${className}`} style={style} tabIndex={focusable ? 0 : undefined} role={focusable ? 'img' : undefined} aria-label={focusable ? label : undefined} aria-describedby={position ? id : undefined} onPointerEnter={show} onPointerLeave={() => setPosition(null)} onFocus={show} onBlur={() => setPosition(null)}>{children}</span>
    {position && createPortal(<span role="tooltip" id={id} className={`chart-tooltip ${position.below ? 'is-below' : ''}`} style={{ left: position.x, top: position.y }}>{label}</span>, document.body)}
  </>;
}

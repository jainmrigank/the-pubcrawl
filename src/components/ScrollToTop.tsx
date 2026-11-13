import { useEffect, useState } from 'react';
import { ArrowDown } from '../icons';
import { overlayGate } from '../overlayGate';

/** Follows the page scroller, including the native Shorts feed. */
export function ScrollToTop({ routeKey }: { routeKey: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const feed = document.querySelector<HTMLElement>('.shorts-route:not([hidden]) .shorts-feed');
      const position = feed ? feed.scrollTop : window.scrollY;
      setVisible(!overlayGate.active && position > Math.min(480, window.innerHeight * .6));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    document.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    const unsubscribe = overlayGate.subscribe(schedule);
    schedule();
    return () => {
      document.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      unsubscribe(); cancelAnimationFrame(frame);
    };
  }, [routeKey]);

  const goUp = () => {
    const feed = document.querySelector<HTMLElement>('.shorts-route:not([hidden]) .shorts-feed');
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
    if (feed) feed.scrollTo({ top: 0, behavior });
    else window.scrollTo({ top: 0, behavior });
    (feed || document.getElementById('main-content'))?.focus({ preventScroll: true });
  };
  return <button className="scroll-to-top" type="button" hidden={!visible} onClick={goUp} aria-label="Scroll to top" title="Scroll to top"><ArrowDown size={22} /></button>;
}

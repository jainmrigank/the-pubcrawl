import { useCallback, useEffect, useRef, useState } from 'react';
import { CONTENT_RETURN_KEY, historyRecord, readContentReturn } from './contentHistory';

interface Origin {
  hash: string;
  scrollY: number;
  trigger: HTMLElement | null;
  homeId?: string;
  label: string;
}

const routeNames: Record<string, string> = {
  '': 'Home', menu: 'Drinks', bar: 'Shelf', 'taste-map': 'Taste Map', tab: 'Tab',
  basics: 'Bar Basics', quiz: 'Pub Quiz', watch: 'Watch', shorts: 'Shorts', atlas: 'Atlas',
};
const currentHash = () => window.location.hash || '#/';

/** Content links get a real history entry; Back skips only their own filter entries. */
export function useContentNavigation(homeId: string | undefined, restoreHome: (id?: string) => void) {
  const origins = useRef(new Map<string, Origin>());
  const [backLabel, setBackLabel] = useState<string | null>(null);
  const pending = useRef<Origin | null>(null);
  const frame = useRef(0);
  const home = useRef(homeId);
  home.current = homeId;

  const navigate = useCallback((hash: string, trigger: HTMLElement | null) => {
    if (!/^#\/(?:menu|bar|taste-map|tab|basics|quiz|watch|shorts|atlas)?(?:\?.*)?$/.test(hash) || hash === currentHash()) return;
    const source = currentHash();
    const study = trigger?.closest('[data-home-story]')?.querySelector('.home-study-title')?.textContent?.trim().replace(/\.$/, '');
    const token = crypto.randomUUID();
    origins.current.set(token, {
      hash: source, scrollY: window.scrollY, trigger, homeId: home.current,
      label: study || routeNames[source.replace(/^#\//, '').split('?')[0]] || 'previous page',
    });
    pending.current = null;
    const oldURL = window.location.href;
    window.history.pushState({ ...historyRecord(window.history.state), [CONTENT_RETURN_KEY]: { token, depth: 0 } }, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL, newURL: window.location.href }));
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => {
        if (readContentReturn(window.history.state)?.token !== token) return;
        document.querySelector<HTMLButtonElement>('.page-return button')?.focus({ preventScroll: true });
      });
    });
  }, []);

  useEffect(() => {
    const sync = () => {
      const marker = readContentReturn(window.history.state);
      setBackLabel(marker ? origins.current.get(marker.token)?.label ?? null : null);
      const origin = pending.current;
      if (!origin || currentHash() !== origin.hash) return;
      pending.current = null;
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        frame.current = requestAnimationFrame(() => {
          if (currentHash() !== origin.hash) return;
          if (origin.trigger?.isConnected && origin.trigger.getClientRects().length) origin.trigger.focus({ preventScroll: true });
          window.scrollTo({ top: origin.scrollY, behavior: 'instant' as ScrollBehavior });
        });
      });
    };
    const follow = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('main a[href]') : null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname || !/^#\/(?:menu|bar|taste-map|tab|basics|quiz|watch|shorts|atlas)?(?:\?.*)?$/.test(url.hash) || url.hash === currentHash()) return;
      event.preventDefault();
      navigate(url.hash, anchor);
    };
    sync();
    document.addEventListener('click', follow);
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      document.removeEventListener('click', follow);
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
      cancelAnimationFrame(frame.current);
    };
  }, [navigate]);

  const goBack = useCallback(() => {
    const marker = readContentReturn(window.history.state);
    const origin = marker ? origins.current.get(marker.token) : null;
    if (!marker || !origin) return;
    pending.current = origin;
    if (origin.homeId) restoreHome(origin.homeId);
    window.history.go(-marker.depth - 1);
  }, [restoreHome]);

  return { backLabel, goBack, navigate };
}

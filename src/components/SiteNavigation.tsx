import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MouseEvent } from 'react';
import type { Route } from '../navigation';
import type { Theme, TourId } from '../types';
import { ArrowRight, Clipboard, PubGlyph, TasteMapIcon, ThemeGlyph, ToolIcon, X } from '../icons';
import { ContextualHelp } from './ContextualHelp';
import { acquirePageScrollLock } from '../pageScrollLock';
import { overlayGate, OVERLAY_PRIORITY, setBackgroundInert } from '../overlayGate';

export const EXPLORE_LINKS = [
  { route: 'basics', label: 'Bar Basics', note: 'Techniques and tools.', href: '#/basics' },
  { route: 'quiz', label: 'Pub Quiz', note: 'Beat the house record.', href: '#/quiz' },
  // Bar Atlas is shelved. Keep its route, artwork and datasets available in code.
  { route: 'shorts', label: 'Shorts', note: 'Quick demonstrations.', href: '#/shorts?src=nav' },
  { route: 'watch', label: 'Watch', note: 'Lessons behind the bar.', href: '#/watch?src=nav' },
] as const;
const PRIMARY = [
  { route: 'menu', label: 'Drinks', href: '#/menu' },
  { route: 'taste-map', label: 'Taste Map', href: '#/taste-map' },
  { route: 'bar', label: 'Shelf', href: '#/bar' },
  { route: 'tab', label: 'Tab', href: '#/tab' },
] as const;
const GATE = 'site-navigation';

interface Props {
  active: Route | null;
  theme: Theme;
  preference: Theme | 'system';
  onPreference: (theme: Theme | 'system') => void;
  onToggleTheme: () => void;
  onHome: (event: MouseEvent<HTMLAnchorElement>) => void;
  tabCount: number;
  helpTour: TourId | null;
}

export function SiteNavigation({ active, theme, preference, onPreference, onToggleTheme, onHome, tabCount, helpTour }: Props) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const exploring = EXPLORE_LINKS.some(link => link.route === active);
  const close = useCallback((restore = true) => {
    setOpen(false);
    if (restore) requestAnimationFrame(() => {
      const target = opener.current;
      if (target?.isConnected && target.getClientRects().length) target.focus({ preventScroll: true });
      else document.querySelector<HTMLElement>('.house-brand')?.focus({ preventScroll: true });
    });
  }, []);
  const show = (event: MouseEvent<HTMLButtonElement>) => {
    if (!overlayGate.acquire(GATE, OVERLAY_PRIORITY.navigation)) return;
    opener.current = event.currentTarget;
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const unlock = acquirePageScrollLock(GATE);
    const restore = setBackgroundInert(true, '.explore-overlay');
    closeRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key !== 'Tab') return;
      const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button, a[href], select') || []).filter(el => !el.hasAttribute('disabled'));
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const leave = () => close(false);
    const unsubscribe = overlayGate.subscribe(() => {
      if (overlayGate.active !== GATE) close(false);
    });
    document.addEventListener('keydown', keydown);
    window.addEventListener('hashchange', leave);
    return () => {
      document.removeEventListener('keydown', keydown);
      window.removeEventListener('hashchange', leave);
      unsubscribe(); restore(); unlock(); overlayGate.release(GATE);
    };
  }, [open, close]);

  const links = (mobile: boolean) => <>
    {PRIMARY.map(item => <a className={`house-nav-link ${active === item.route ? 'active' : ''}`} href={item.href} key={item.route} aria-current={active === item.route ? 'page' : undefined} aria-label={item.route === 'tab' ? `Tab, ${tabCount} saved ${tabCount === 1 ? 'drink' : 'drinks'}` : undefined}>
      {mobile && (item.route === 'menu' ? <PubGlyph size={20} /> : item.route === 'taste-map' ? <TasteMapIcon size={20} /> : item.route === 'bar' ? <ToolIcon id="bottle" size={20} /> : <Clipboard size={20} />)}
      <span>{item.label}{item.route === 'tab' && tabCount > 0 && <span className="house-tab-count" aria-hidden="true">{tabCount}</span>}</span>
    </a>)}
    <button className={`house-nav-link ${exploring || open ? 'active' : ''}`} type="button" onClick={show} aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? 'explore-panel' : undefined}>
      {mobile && <span className="more-glyph" aria-hidden="true">···</span>}<span>Explore<span aria-hidden="true" className="explore-plus">+</span></span>
    </button>
  </>;
  return <>
    <a className="skip-content" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>Skip to content</a>
    <header className="house-nav">
      <a className="house-brand" href="#/" onClick={onHome} aria-label="PubCrawl home"><PubGlyph size={34} /><span>PubCrawl</span></a>
      <nav className="house-desktop-links" aria-label="Primary">{links(false)}</nav>
      <div className="house-nav-utilities">
        <button className="house-theme" type="button" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}><ThemeGlyph theme={theme} size={20} /></button>
        {helpTour && <ContextualHelp tour={helpTour} />}
      </div>
    </header>
    {createPortal(<nav className="house-mobile-links" aria-label="Primary">{links(true)}</nav>, document.body)}
    {open && createPortal(<div className="explore-overlay" onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <section className="explore-panel" ref={panelRef} id="explore-panel" role="dialog" aria-modal="true" aria-labelledby="explore-title">
        <header><div><span className="house-eyebrow">THE REST OF THE BAR</span><h2 id="explore-title">Explore PubCrawl</h2></div><button ref={closeRef} className="house-icon-button" type="button" onClick={() => close()} aria-label="Close explore menu"><X size={22} /></button></header>
        <nav aria-label="Explore">{EXPLORE_LINKS.map((link, i) => <a key={link.route} href={link.href} aria-current={active === link.route ? 'page' : undefined} onClick={() => close(false)}>
          <span className="house-link-number" aria-hidden="true">0{i + 1}</span><span><strong>{link.label}</strong><small>{link.note}</small></span><ArrowRight size={22} />
        </a>)}</nav>
        <div className="explore-appearance"><label htmlFor="appearance">Colour theme</label><select id="appearance" value={preference} onChange={event => onPreference(event.target.value as Theme | 'system')}><option value="system">Use device setting</option><option value="light">Light</option><option value="dark">Dark</option></select></div>
      </section>
    </div>, document.body)}
  </>;
}

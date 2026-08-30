import type { Route } from '../navigation';
import { Camera, Play, PubGlyph, ToolIcon } from '../icons';
import type { Theme } from '../types';

interface MobileNavigationProps {
  active: Route | null;
  tabCount: number;
  theme: Theme;
  onToggleTheme: () => void;
}

const items: { route: Route; label: string; href: string; icon: 'menu' | 'bar' | 'shorts' | 'watch' | 'quiz' }[] = [
  { route: 'menu', label: 'Menu', href: '#/menu', icon: 'menu' },
  { route: 'bar', label: 'Bar', href: '#/bar', icon: 'bar' },
  { route: 'shorts', label: 'Shorts', href: '#/shorts?src=nav', icon: 'shorts' },
  { route: 'watch', label: 'Watch', href: '#/watch?src=nav', icon: 'watch' },
  { route: 'quiz', label: 'Quiz', href: '#/quiz', icon: 'quiz' },
];

function ItemIcon({ icon }: { icon: (typeof items)[number]['icon'] }) {
  if (icon === 'menu') return <PubGlyph size={20} />;
  if (icon === 'bar') return <ToolIcon id="bottle" size={20} />;
  if (icon === 'shorts') return <Play size={20} />;
  if (icon === 'watch') return <Camera size={20} />;
  return <ToolIcon id="star" size={20} />;
}

export function MobileTopActions({ theme, onToggleTheme, tabCount, active }: MobileNavigationProps) {
  return (
    <div className="mobile-top-actions">
      <button
        className="mobile-theme-toggle text-btn header-icon-action"
        type="button"
        onClick={onToggleTheme}
        aria-pressed={theme === 'dark'}
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        data-tip={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        <ToolIcon id="citrus" size={18} />
      </button>
      <a
        className="mobile-secondary-action header-icon-action"
        href="#/basics"
        aria-current={active === 'basics' ? 'page' : undefined}
        aria-label="Bar Basics"
        title="Bar Basics"
        data-tip="Bar Basics"
      >
        <ToolIcon id="book" size={18} />
      </a>
      <a
        className="mobile-secondary-action tab-action header-icon-action"
        href="#/tab"
        aria-current={active === 'tab' ? 'page' : undefined}
        aria-label="Tab"
        title="Tab"
        data-tip="Tab"
      >
        <ToolIcon id="star" size={18} />
        {tabCount > 0 && <b className="tab-badge" aria-label={`${tabCount} saved`}>{tabCount}</b>}
      </a>
    </div>
  );
}

export function MobileNavigation({ active }: MobileNavigationProps) {
  return (
    <nav className="mobile-bottom-nav" aria-label="Primary">
      {items.map((item) => (
        <a
          key={item.route}
          href={item.href}
          className={`mobile-nav-item ${active === item.route ? 'active' : ''}`}
          aria-current={active === item.route ? 'page' : undefined}
        >
          <ItemIcon icon={item.icon} />
          <span>{item.label}</span>
        </a>
      ))}
    </nav>
  );
}

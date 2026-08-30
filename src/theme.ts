import type { Theme } from './types';

export const THEME_STORAGE_KEY = 'pubcrawl.theme';

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

export function readStoredTheme(storage?: Storage | null): Theme | null {
  try {
    const target = storage === undefined && typeof window !== 'undefined' ? window.localStorage : storage;
    const value = target?.getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

export function systemTheme(win?: Pick<Window, 'matchMedia'>): Theme {
  try {
    const target = win || (typeof window !== 'undefined' ? window : null);
    return target?.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function currentTheme(doc: Document = document): Theme {
  return doc.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: Theme, doc: Document = document): void {
  const root = doc.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  const meta = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#141310' : '#ECE9E0';
  const apple = doc.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (apple) apple.content = theme === 'dark' ? 'black-translucent' : 'default';
}

export function persistTheme(theme: Theme, storage?: Storage | null): void {
  try {
    const target = storage === undefined && typeof window !== 'undefined' ? window.localStorage : storage;
    target?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private browsing and embedded PWA contexts can deny storage. Theme still
    // applies for the current session in that case.
  }
}

export function bootstrapTheme(doc: Document = document, storage?: Storage | null): Theme {
  const stored = readStoredTheme(storage);
  // PubCrawl opens in its dark editorial treatment. An explicit local choice
  // remains authoritative, but an unset preference must not inherit a light
  // OS setting and unexpectedly change the first frame.
  const theme = stored || 'dark';
  applyTheme(theme, doc);
  return theme;
}

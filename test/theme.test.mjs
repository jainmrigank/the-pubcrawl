import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTheme, bootstrapTheme, readStoredTheme, persistTheme, systemTheme } from '../src/theme.ts';

function fakeDocument() {
  const root = { dataset: {}, style: {} };
  const metas = {
    'meta[name="theme-color"]': { content: '' },
    'meta[name="apple-mobile-web-app-status-bar-style"]': { content: '' },
  };
  return { documentElement: root, querySelector: (selector) => metas[selector] || null };
}

test('theme storage accepts only explicit light/dark values', () => {
  const values = new Map([['pubcrawl.theme', 'dark']]);
  const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  assert.equal(readStoredTheme(storage), 'dark');
  values.set('pubcrawl.theme', 'blue');
  assert.equal(readStoredTheme(storage), null);
  persistTheme('light', storage);
  assert.equal(values.get('pubcrawl.theme'), 'light');
});

test('applyTheme updates the document state and runtime metadata', () => {
  const doc = fakeDocument();
  applyTheme('dark', doc);
  assert.equal(doc.documentElement.dataset.theme, 'dark');
  assert.equal(doc.documentElement.style.colorScheme, 'dark');
  assert.equal(doc.querySelector('meta[name="theme-color"]').content, '#1d2521');
  assert.equal(doc.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]').content, 'black-translucent');
  applyTheme('light', doc);
  assert.equal(doc.querySelector('meta[name="theme-color"]').content, '#f0e9dc');
});

test('system theme is safe in browser-like and non-browser environments', () => {
  assert.equal(systemTheme({ matchMedia: () => ({ matches: true }) }), 'dark');
  assert.equal(systemTheme({ matchMedia: () => ({ matches: false }) }), 'light');
  assert.equal(systemTheme({ matchMedia: () => { throw new Error('storage unavailable'); } }), 'light');
});

test('unset preferences safely follow the device default', () => {
  const doc = fakeDocument();
  assert.equal(bootstrapTheme(doc, null), 'light');
  assert.equal(doc.documentElement.dataset.theme, 'light');
  assert.equal(doc.querySelector('meta[name="theme-color"]').content, '#f0e9dc');
});

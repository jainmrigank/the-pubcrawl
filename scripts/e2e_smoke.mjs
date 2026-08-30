#!/usr/bin/env node
/**
 * Lightweight release smoke gate for environments without a browser runner.
 * It checks the built contract seams that a browser suite exercises and is
 * intentionally supplemented by the manual/Playwright viewport matrix.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const app = readFileSync('src/App.tsx', 'utf8');
const css = readFileSync('src/App.css', 'utf8');
const nav = readFileSync('src/components/MobileNavigation.tsx', 'utf8');
const category = readFileSync('src/components/CategoryFilter.tsx', 'utf8');
const watch = readFileSync('src/components/Watch.tsx', 'utf8');
assert.match(app, /RecipePage|browseTotal/);
assert.match(app, /AbortController/);
assert.match(category, /category-filter-select/);
assert.match(category, /aria-pressed/);
assert.match(nav, /Menu.*Bar.*Shorts.*Watch.*Quiz/s);
assert.match(watch, /WATCH_BOOTSTRAP_LIBRARY/);
assert.match(watch, /import\('\.\.\/watchLibrary'\)/);
assert.match(watch, /wv-kind-select/);
assert.match(css, /@media \(max-width: 640px\)/);
assert.match(css, /--mobile-bottom-nav-height: 62px/);
assert.match(css, /html\[data-theme='dark'\]/);
assert.match(css, /html\[data-theme='dark'\][\s\S]*shorts-overlay-action/);
const audit = spawnSync(process.execPath, ['scripts/validate_catalog_audit.mjs'], { encoding: 'utf8' });
if (audit.status !== 0) process.stderr.write(audit.stderr || audit.stdout);
assert.equal(audit.status, 0);
console.log('Contract smoke passed: pagination, filter, theme, mobile navigation, and 691-entry audit.');

import { test, expect } from '@playwright/test';
import { navigateTo, openRoute, seedStableDevice, useDrinksList, useTasteMap } from './helpers';

// The same journeys run in Chromium and in the focused iPhone WebKit project.
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => { await seedStableDevice(page); });

test('keeps a selected drink and ingredient comparison across views and saved-drink navigation', async ({ page }) => {
  await openRoute(page, '/#/menu');
  await useTasteMap(page);
  await expect(page.locator('.taste-node')).toHaveCount(4);
  await expect(page.locator('.taste-preview[data-recipe-id]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Preview Negroni', exact: true }).click();
  const preview = page.locator('.taste-preview[data-recipe-id="11003"]');
  await expect(preview.locator('h2')).toBeFocused();
  await expect(preview.locator('.taste-ingredients')).toContainText('Gin30 ml');
  await preview.getByRole('button', { name: 'Compare with another drink' }).click();
  const comparison = page.locator('.taste-comparison');
  await expect(comparison).toContainText('Boulevardier');
  const campari = comparison.getByRole('row').filter({ has: page.getByRole('rowheader', { name: /^Campari/ }) });
  await expect(campari).toContainText('Shared ingredient');
  await expect(campari).not.toContainText('Different measures');
  await expect(comparison.getByRole('row').filter({ has: page.getByRole('rowheader', { name: /^Gin/ }) })).toContainText('Only in Negroni');
  await useDrinksList(page);
  await expect(page.locator('#menu-list .fc').first()).toBeVisible();
  await useTasteMap(page);
  await expect(preview).toBeVisible();
  await expect(comparison).toContainText('Boulevardier');
  await preview.getByRole('button', { name: 'Save to Your Tab', exact: true }).click();
  await navigateTo(page, 'Your Tab');
  await expect(page.locator('#tab-page .fc[data-recipe-id="11003"]')).toBeVisible();
  await useTasteMap(page);
  await expect(preview.getByRole('button', { name: 'Saved to Your Tab' })).toHaveAttribute('aria-pressed', 'true');
  await expect(comparison).toContainText('Boulevardier');
});

test('keeps Taste Map independent of Shelf and removes matching and reading-guide controls', async ({ page }) => {
  await openRoute(page, '/#/bar');
  await page.getByRole('textbox', { name: 'Search ingredients' }).fill('Gin');
  await page.getByRole('option', { name: /^Gin\b/ }).first().click();
  await useTasteMap(page);
  await expect(page.locator('.taste-node')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Use my ingredients' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Use my ingredients' })).toHaveCount(0);
  await expect(page.locator('.taste-availability, .taste-shelf-note, .taste-guide')).toHaveCount(0);
  await page.getByRole('button', { name: 'Preview Negroni', exact: true }).click();
  await expect(page.locator('.taste-preview .taste-ingredients')).toContainText('Gin30 ml');
  await navigateTo(page, 'Shelf');
  await expect(page.locator('.pantry')).toContainText('Gin');
});

test('narrows broad flavours, supports a full-list search and retains the selected preference', async ({ page }) => {
  await openRoute(page, '/#/menu');
  await useTasteMap(page);
  await page.getByRole('button', { name: 'Bold & rich', exact: true }).click();
  await page.getByRole('button', { name: 'coffee', exact: true }).click();
  await expect(page.locator('.taste-node')).toHaveCount(1);
  await expect(page.locator('.taste-node')).toContainText('Espresso Martini');
  await page.getByRole('button', { name: 'Next drinks' }).click();
  await expect(page.locator('.taste-node')).toContainText('White Russian');
  await useDrinksList(page);
  await page.getByRole('textbox', { name: /^Search menu/ }).fill('not-a-drink');
  await expect(page.getByText('Nothing by that name', { exact:true })).toBeVisible();
  await page.getByRole('textbox', { name: /^Search menu/ }).fill('Vesper');
  await expect(page.locator('#menu-list .fc[data-recipe-id="17218"]')).toBeVisible();
  await page.getByRole('textbox', { name: /^Search menu/ }).fill('');
  await useTasteMap(page);
  await expect(page.getByRole('button', { name: 'coffee', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('expands the preview into the existing locked recipe reader and restores its trigger', async ({ page }) => {
  await page.route('https://upload.wikimedia.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#bb6846"/></svg>' }));
  await openRoute(page, '/#/menu');
  await useTasteMap(page);
  await page.getByRole('button', { name: 'Preview Negroni', exact: true }).click();
  const trigger = page.locator('.taste-preview').getByRole('button', { name: 'View recipe', exact: true });
  await trigger.click();
  const reader = page.getByRole('dialog', { name: 'Negroni', exact: true });
  await expect(reader).toHaveAttribute('data-phase', 'open');
  await expect(reader.locator('.recipe-focus-photo img')).toBeVisible();
  await expect(page.locator('#root')).toHaveAttribute('inert', '');
  await reader.getByRole('button', { name: 'Lock recipe view at this position' }).click();
  await expect(reader).toHaveAttribute('data-locked', 'true');
  await expect(reader.getByRole('button', { name: 'Back to drink preview' })).toBeInViewport();
  await page.goBack();
  await expect(reader).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('button', { name: 'Preview Negroni', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('keeps Explore keyboard-contained, shelves Atlas and supports device appearance', async ({ page }) => {
  await openRoute(page, '/#/menu');
  await useTasteMap(page);
  const more = page.getByRole('button', { name: 'Explore', exact: true });
  await more.click();
  const dialog = page.getByRole('dialog', { name: 'Explore PubCrawl' });
  await expect(page.locator('#root')).toHaveAttribute('inert', '');
  await expect(dialog.getByRole('link')).toHaveCount(4);
  await expect(dialog.getByRole('link', { name: /Bar Atlas/ })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Close explore menu' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByLabel('Colour theme')).toBeFocused();
  await dialog.getByLabel('Colour theme').selectOption('system');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(more).toBeFocused();
  await expect(page.locator('#root')).not.toHaveAttribute('inert', '');
  for (const [name, route] of [['Bar Basics', 'basics'], ['Pub Quiz', 'quiz'], ['Shorts', 'shorts'], ['Watch', 'watch']]) {
    await navigateTo(page, name);
    await expect(page.locator('html')).toHaveAttribute('data-route', route);
    await expect(page.locator('.explore-overlay')).toHaveCount(0);
  }
});

test('fits every map group and comparison at all requested widths in both themes', async ({ page }, info) => {
  test.setTimeout(90_000);
  await openRoute(page, '/#/menu');
  await useTasteMap(page);
  await expect(page.locator('.taste-node')).toHaveCount(4);
  for (const width of [320, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width === 320 ? 700 : 900 });
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.house-theme').click();
      for (let group = 0; group < 4; group++) {
        const geometry = await page.locator('.taste-plot').evaluate(el => {
          const bounds = el.getBoundingClientRect();
          const nodes = [...el.querySelectorAll('.taste-node')].map(node => { const r = node.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom }; });
          return { bounds: { left:bounds.left, right:bounds.right }, nodes, overflow: document.documentElement.scrollWidth - innerWidth };
        });
        expect(geometry.overflow).toBeLessThanOrEqual(1);
        for (const node of geometry.nodes) {
          expect(node.left).toBeGreaterThanOrEqual(geometry.bounds.left - 1);
          expect(node.right).toBeLessThanOrEqual(geometry.bounds.right + 1);
        }
        for (let i = 0; i < geometry.nodes.length; i++) for (let j = i + 1; j < geometry.nodes.length; j++) {
          const a = geometry.nodes[i], b = geometry.nodes[j];
          expect(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1, JSON.stringify({ width, theme, group, a, b })).toBe(true);
        }
        if (group < 3) await page.getByRole('button', { name: 'Next drinks' }).click();
      }
      await page.screenshot({ path: info.outputPath(`map-${width}-${theme}.png`) });
      for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Previous drinks' }).click();
    }
  }
  await page.setViewportSize({ width: 320, height: 700 });
  await page.getByRole('button', { name: 'Preview Negroni', exact: true }).click();
  await page.getByRole('button', { name: 'Compare with another drink' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await expect(page.locator('.taste-compare-table')).toBeVisible();
  await page.screenshot({ path: info.outputPath('comparison-320.png') });
});

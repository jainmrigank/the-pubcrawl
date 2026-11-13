import { expect, test } from '@playwright/test';
import { navigateTo, openRoute, seedStableDevice, useTasteMap } from './helpers';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => { await seedStableDevice(page); });

test('Home offers Taste Map alongside browsing and in More at the bar without losing its other destinations', async ({ page }) => {
  await openRoute(page, '/#/');
  const hero = page.locator('.home-actions');
  await expect(hero.getByRole('link')).toHaveText(['What can I make?', 'Browse all drinks', 'Taste Map']);
  await expect(hero.getByRole('link', { name: 'Browse all drinks' })).toHaveAttribute('href', '#/menu');
  await hero.getByRole('link', { name: 'Taste Map', exact: true }).click();
  await expect(page).toHaveURL(/#\/taste-map$/);
  await expect(page.locator('.taste-node')).toHaveCount(4);
  await page.goBack();
  const editorial = page.getByRole('navigation', { name: 'More to explore' });
  await expect(editorial.getByRole('link')).toHaveCount(4);
  await expect(editorial.getByRole('link', { name: 'Pub Quiz', exact: true })).toHaveAttribute('href', '#/quiz');
  await expect(editorial.getByRole('link', { name: 'Bar Basics', exact: true })).toHaveAttribute('href', '#/basics');
  await expect(editorial.getByRole('link', { name: 'Your Tab', exact: true })).toHaveAttribute('href', '#/tab');
  await editorial.getByRole('link', { name: 'Taste Map', exact: true }).click();
  await expect(page.locator('#taste-page')).toBeVisible();
  await expect(page.locator('.house-mobile-links').getByRole('link', { name: 'Taste Map', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('Drinks shows keyword matches directly with filters and no map controls or card clutter', async ({ page }) => {
  await openRoute(page, '/#/menu');
  await page.getByRole('textbox', { name: /^Search menu/ }).fill('sour');
  await expect(page.locator('#menu-list .sec-note')).toContainText('Showing 12 of 55');
  await expect(page.locator('#menu-list .fc')).toHaveCount(12);
  await expect(page.locator('#menu-list .taste-finder, .drink-view-switch, .drink-search-summary, .fc-taste-control')).toHaveCount(0);
  await expect(page.locator('.taste-plot')).toBeHidden();
  await page.getByRole('button', { name: 'More filters', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Filter menu by category or collection' })).toBeVisible();
  await page.getByRole('button', { name: 'Hide filters', exact: true }).click();
  await page.getByRole('textbox', { name: /^Search menu/ }).fill('Vesper');
  await expect(page.locator('#menu-list .fc[data-recipe-id="17218"]')).toBeVisible();
});

test('Map keeps its page and preview across Drinks searches and browser Back', async ({ page }) => {
  await openRoute(page, '/#/taste-map');
  await expect(page.locator('.taste-node')).toHaveCount(4);
  await expect(page.locator('#taste-page input')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next drinks' }).click();
  await page.getByRole('button', { name: 'Preview Old Fashioned', exact: true }).click();
  await expect(page.locator('.taste-preview h2')).toHaveText('Old Fashioned');
  const position = await page.evaluate(() => scrollY);
  await navigateTo(page, 'Drinks');
  await page.getByRole('textbox', { name: /^Search menu/ }).fill('sour');
  await expect(page.locator('#menu-list .sec-note')).toContainText('of 55');
  await page.goBack();
  await expect(page).toHaveURL(/#\/taste-map$/);
  await expect(page.locator('.taste-preview h2')).toHaveText('Old Fashioned');
  await expect(page.locator('.taste-pagination')).toContainText('Page 2 / 4');
  await expect(page.getByRole('button', { name: 'Preview Old Fashioned', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(position, 0);
  await navigateTo(page, 'Drinks');
  await expect(page.getByRole('textbox', { name: /^Search menu/ })).toHaveValue('sour');
  await expect(page.locator('#menu-list .sec-note')).toContainText('of 55');
});

test('old map links redirect to the standalone page without carrying a library search into the map', async ({ page }) => {
  await openRoute(page, '/#/menu?q=sour&view=map');
  await expect(page).toHaveURL(/#\/taste-map$/);
  await expect(page.locator('.taste-node')).toHaveCount(4);
  await expect(page.locator('.taste-pagination')).toContainText('4 of 16 classics');
  await expect(page.locator('.taste-sweetness')).toHaveText('Less sweetSweeter');
  await page.getByRole('button', { name: /Browse all 691 recipes/ }).click();
  await expect(page).toHaveURL(/#\/menu$/);
  await expect(page.getByRole('textbox', { name: /^Search menu/ })).toHaveValue('');
});

test('five navigation choices and all Home actions fit phones, desktops and short landscape screens in both themes', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRoute(page, '/#/');
  for (const [width, height] of [[320,700], [390,844], [430,900], [768,1024], [1024,900], [1440,900], [926,428]]) {
    await page.setViewportSize({ width, height });
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.house-theme').click();
      const nav = page.locator('.house-desktop-links:visible, .house-mobile-links:visible');
      await expect(nav.locator('.house-nav-link')).toHaveCount(5);
      await expect(nav.getByRole('link', { name: 'Taste Map', exact: true })).toBeVisible();
      const sizes = await nav.locator('.house-nav-link').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return {width:r.width,height:r.height}; }));
      for (const size of sizes) { expect(size.width).toBeGreaterThanOrEqual(44); expect(size.height).toBeGreaterThanOrEqual(44); }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      const actions = await page.locator('.home-actions a').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); const parent = document.querySelector('.home-opening')!.getBoundingClientRect(); return r.top >= parent.top && r.bottom <= parent.bottom; }));
      expect(actions).toEqual([true, true, true]);
    }
  }
});

test('flavour controls and paging sit above the full-width graph and update it immediately', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openRoute(page, '/#/taste-map');
  await expect(page.locator('.taste-node')).toHaveCount(4);
  const graph = page.locator('.taste-plot');
  const layout = await page.evaluate(() => {
    const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
    const map = box('#taste-map'), plot = box('.taste-plot'), filters = box('.taste-filters'), paging = box('.taste-pagination');
    return { width:plot.width, mapWidth:map.width, filtersBottom:filters.bottom, pagingTop:paging.top, pagingBottom:paging.bottom, plotTop:plot.top };
  });
  expect(layout.width).toBeCloseTo(layout.mapWidth, 0);
  expect(layout.width).toBeGreaterThan(1100);
  expect(layout.filtersBottom).toBeLessThan(layout.pagingTop);
  expect(layout.pagingBottom).toBeLessThan(layout.plotTop);
  for (const name of ['Previous drinks', 'Next drinks']) {
    const bounds = await page.getByRole('button', { name, exact:true }).boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(48);
    expect(bounds!.height).toBeGreaterThanOrEqual(48);
  }
  await page.getByRole('button', { name: 'Next drinks', exact:true }).click();
  await expect(page.locator('.taste-pagination')).toContainText('Page 2 / 4');
  await expect(graph.getByRole('button', {name:'Preview Old Fashioned',exact:true})).toBeVisible();
  await page.getByRole('group', {name:'Flavour',exact:true}).getByRole('button', {name:'Bold & rich',exact:true}).click();
  await page.getByRole('group', {name:'More specific flavours',exact:true}).getByRole('button', {name:'coffee',exact:true}).click();
  await expect(page.locator('.taste-node')).toHaveCount(1);
  await expect(graph).toContainText('Espresso Martini');
  await expect(page.locator('.taste-pagination')).toContainText('1 of 2 classics');
  await expect(page.locator('.taste-pagination')).toContainText('Page 1 / 2');
});

test('fast page changes remain usable and reduced motion renders the final graph immediately', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openRoute(page, '/#/taste-map');
  await expect(page.locator('.taste-map-canvas')).toHaveAttribute('data-motion', 'animated');
  await page.getByRole('button', {name:'Next drinks',exact:true}).dblclick();
  await expect(page.locator('.taste-pagination')).toContainText('Page 3 / 4');
  await expect(page.locator('.taste-node')).toHaveCount(4);
  await expect(page.getByRole('button', {name:'Preview Espresso Martini',exact:true})).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', {name:'Next drinks',exact:true}).click();
  await expect(page.locator('.taste-map-canvas')).toHaveAttribute('data-motion', 'reduced');
  await expect(page.locator('.taste-page-points')).toHaveCSS('opacity', '1');
  await expect(page.getByRole('button', {name:'Preview White Russian',exact:true})).toBeVisible();
  await expect(page.locator('.taste-graph-axes-x')).toHaveCSS('opacity', '0.7');
  await expect(page.locator('.taste-graph-axes-x')).toHaveCSS('animation-name', 'none');
});

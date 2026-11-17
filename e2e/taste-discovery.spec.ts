import { expect, test } from '@playwright/test';
import { navigateTo, openRoute, seedStableDevice, swipePage, useTasteMap } from './helpers';

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
  await expect(page.locator('#menu-list .sec-note')).toContainText('Showing 12 of 209');
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
  await swipePage(page.locator('.taste-plot'));
  await page.getByRole('button', { name: 'Preview Old Fashioned', exact: true }).click();
  await expect(page.locator('.taste-preview h2')).toHaveText('Old Fashioned');
  const position = await page.evaluate(() => scrollY);
  await navigateTo(page, 'Drinks');
  await page.getByRole('textbox', { name: /^Search menu/ }).fill('sour');
  await expect(page.locator('#menu-list .sec-note')).toContainText('of 209');
  await page.goBack();
  await expect(page).toHaveURL(/#\/taste-map$/);
  await expect(page.locator('.taste-preview h2')).toHaveText('Old Fashioned');
  await expect(page.locator('.taste-pagination')).toContainText('Page 2 / 4');
  await expect(page.getByRole('button', { name: 'Preview Old Fashioned', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(position, 0);
  await navigateTo(page, 'Drinks');
  await expect(page.getByRole('textbox', { name: /^Search menu/ })).toHaveValue('sour');
  await expect(page.locator('#menu-list .sec-note')).toContainText('of 209');
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
    const control = page.getByRole('button', { name, exact:true });
    const touch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    const bounds = (await control.boundingBox())!;
    if (touch) {
      expect(bounds.width).toBeLessThanOrEqual(1);
      await expect(control).toHaveCSS('pointer-events', 'none');
    } else {
      expect(bounds.width).toBeGreaterThanOrEqual(48);
      expect(bounds.height).toBeGreaterThanOrEqual(48);
    }
  }
  await swipePage(page.locator('.taste-plot'));
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
  await swipePage(page.locator('.taste-plot'));
  await swipePage(page.locator('.taste-plot'));
  await expect(page.locator('.taste-pagination')).toContainText('Page 3 / 4');
  await expect(page.locator('.taste-node')).toHaveCount(4);
  await expect(page.getByRole('button', {name:'Preview Espresso Martini',exact:true})).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await swipePage(page.locator('.taste-plot'));
  await expect(page.locator('.taste-map-canvas')).toHaveAttribute('data-motion', 'reduced');
  await expect(page.locator('.taste-page-points')).toHaveCSS('opacity', '1');
  await expect(page.getByRole('button', {name:'Preview White Russian',exact:true})).toBeVisible();
  await expect(page.locator('.taste-graph-axes-x')).toHaveCSS('opacity', '0.7');
  await expect(page.locator('.taste-graph-axes-x')).toHaveCSS('animation-name', 'none');
});

test('mobile map gestures keep boundaries, filters, keyboard paging and drink taps intact', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRoute(page, '/#/taste-map');
  const plot = page.locator('.taste-plot');
  const position = page.locator('.taste-page-position');
  const gesture = async (dx: number, dy = 0, cancel = false) => {
    const box = (await plot.boundingBox())!;
    const start = { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
    await plot.dispatchEvent('pointerdown', start);
    await plot.dispatchEvent('pointermove', { ...start, clientX: start.clientX + dx, clientY: start.clientY + dy });
    await plot.dispatchEvent(cancel ? 'pointercancel' : 'pointerup', { ...start, clientX: start.clientX + dx, clientY: start.clientY + dy });
  };
  await gesture(100);
  await expect(position).toHaveText('Page 1 / 4');
  await gesture(-110);
  await expect(position).toHaveText('Page 2 / 4');
  await expect(page.locator('.taste-preview')).toHaveCount(0);
  await gesture(110);
  await expect(position).toHaveText('Page 1 / 4');
  await gesture(-8, -120);
  await expect(position).toHaveText('Page 1 / 4');
  await gesture(-110, 0, true);
  await expect(position).toHaveText('Page 1 / 4');
  await gesture(-20);
  await expect(position).toHaveText('Page 1 / 4');
  await page.getByRole('button', { name: 'Preview Negroni', exact: true }).tap();
  await expect(page.locator('.taste-preview h2')).toHaveText('Negroni');
  await gesture(-110);
  await expect(position).toHaveText('Page 2 / 4');
  await expect(page.locator('.taste-preview h2')).toHaveText('Negroni');
  await page.getByRole('button', { name: 'Next drinks', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(position).toHaveText('Page 3 / 4');
  await gesture(-110);
  await gesture(-110);
  await expect(position).toHaveText('Page 4 / 4');
  await expect(page.getByRole('button', { name: 'Next drinks', exact: true })).toBeDisabled();
  await page.getByRole('group', { name: 'Flavour', exact: true }).getByRole('button', { name: 'Bold & rich', exact: true }).click();
  await page.getByRole('group', { name: 'More specific flavours', exact: true }).getByRole('button', { name: 'coffee', exact: true }).click();
  await expect(position).toHaveText('Page 1 / 2');
  await gesture(-110);
  await expect(position).toHaveText('Page 2 / 2');
  await page.getByRole('group', { name: 'Flavour', exact: true }).getByRole('button', { name: 'All flavours', exact: true }).click();
  await page.getByRole('button', { name: 'Close drink preview', exact: true }).click();
  await page.getByRole('navigation', { name: 'Map pages', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('taste-map-mobile-controls.png') });
});

test('native touch swipes change pages while vertical swipes scroll without selecting a glass', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Real touch dispatch uses Chromium CDP; cross-browser gesture handling is covered separately.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRoute(page, '/#/taste-map');
  const cdp = await page.context().newCDPSession(page);
  const stroke = async (x: number, y: number, dx: number, dy = 0) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / 8, y: y + dy * i / 8, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const plot = page.locator('.taste-plot');
  await plot.scrollIntoViewIfNeeded();
  const node = (await page.getByRole('button', { name: 'Preview Negroni', exact: true }).boundingBox())!;
  await stroke(node.x + node.width / 2, node.y + node.height / 2, -100);
  await expect(page.locator('.taste-page-position')).toHaveText('Page 2 / 4');
  await expect(page.locator('.taste-preview')).toHaveCount(0);
  const box = (await plot.boundingBox())!;
  await stroke(box.x + box.width * .3, box.y + box.height / 2, 110);
  await expect(page.locator('.taste-page-position')).toHaveText('Page 1 / 4');
  const y = await page.evaluate(() => scrollY);
  await stroke(box.x + box.width / 2, box.y + box.height * .7, 3, -150);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(y + 40);
  await expect(page.locator('.taste-page-position')).toHaveText('Page 1 / 4');
  await page.getByRole('button', { name: 'Preview Negroni', exact: true }).tap();
  await expect(page.locator('.taste-preview h2')).toHaveText('Negroni');
  await cdp.detach();
});

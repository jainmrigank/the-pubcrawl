import { expect, test, type Locator } from '@playwright/test';
import { openRoute, seedStableDevice, swipePage, navigateTo } from './helpers';
import { addFinderIngredients } from './fixtures/studyRecipes';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  await seedStableDevice(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function settled(surface: Locator) {
  await expect.poll(() => surface.locator('.paged-carousel').first().evaluate(el =>
    !(el as HTMLElement & { swiper: { animating: boolean } }).swiper.animating
  )).toBe(true);
  const boxes = await surface.locator('.paged-carousel').first().evaluate(el => ({
    viewport: el.getBoundingClientRect().left,
    slide: el.querySelector('.swiper-slide-active')!.getBoundingClientRect().left,
  }));
  expect(Math.abs(boxes.viewport - boxes.slide)).toBeLessThan(2);
}

test('Swiper moves real adjacent pages with the drag and completes its own slide animation', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openRoute(page, '/#/');
  const study = page.locator('#home-calories');
  await study.locator('.home-study-toggle').click();
  await expect(study.locator('.home-study-panel')).toHaveAttribute('style', /height: auto/);
  const position = study.getByRole('navigation', { name: 'Calorie servings' });
  const row = study.locator('.swiper-slide-active .calorie-row:not(.swiper-slide[aria-hidden=true] *)').first();
  await row.hover();
  const box = (await row.boundingBox())!, counterX = (await position.boundingBox())!.x;
  await page.mouse.move(box.x + box.width * .8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .15, box.y + box.height / 2, { steps: 8 });
  const motion = await study.locator('.swiper-wrapper').evaluate(el => ({
    x: new DOMMatrixReadOnly(getComputedStyle(el).transform).m41,
    followingPage: el.querySelector('.swiper-slide-next .calorie-name')!.textContent,
  }));
  expect(motion.x).toBeLessThan(-60);
  expect(motion.followingPage).not.toBe('Bamboo');
  expect((await position.boundingBox())!.x).toBe(counterX);
  await page.screenshot({ path: info.outputPath('swiper-adjacent-pages.png') });
  await page.mouse.up();
  await expect(position).toContainText('5–8 of 20');
  await settled(study);
  await expect(study.locator('.calorie-recipe')).toHaveCount(0);
  await swipePage(study.locator('.calorie-group:not(.swiper-slide[aria-hidden=true] *)'), 'previous');
  await expect(position).toContainText('1–4 of 20');
  await settled(study);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await swipePage(study.locator('.calorie-group:not(.swiper-slide[aria-hidden=true] *)'));
  await expect(position).toContainText('5–8 of 20');
  await settled(study);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('horizontal trackpad paging works in phone preview while vertical wheel input scrolls the page', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Mobile WebKit does not expose mouse.wheel; actual drag paging is covered separately.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openRoute(page, '/#/');
  const study = page.locator('#home-calories');
  await study.locator('.home-study-toggle').click();
  const position = study.getByRole('navigation', { name: 'Calorie servings' });
  await study.locator('.swiper-slide-active .calorie-row:not(.swiper-slide[aria-hidden=true] *)').first().hover();
  await page.mouse.wheel(450, 0);
  await expect(position).toContainText('5–8 of 20');
  await settled(study);
  await study.locator('.swiper-slide-active .calorie-row:not(.swiper-slide[aria-hidden=true] *)').first().hover();
  await page.mouse.wheel(-450, 0);
  await expect(position).toContainText('1–4 of 20');
  await settled(study);
  const y = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, 120);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(y + 30);
  await expect(position).toContainText('1–4 of 20');
  for (const arrow of await position.locator('.pagination-arrow').all()) {
    await expect(arrow).toHaveCSS('pointer-events', 'none');
    expect((await arrow.boundingBox())!.width).toBeLessThanOrEqual(1);
  }
});

test.describe('desktop pagination', () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });
  test('keeps arrow clicks available and leaves text dragging alone', async ({ page }) => {
    await openRoute(page, '/#/');
    const study = page.locator('#home-calories');
    await study.locator('.home-study-toggle').click();
    const next = study.getByRole('button', { name: 'Next calorie servings' });
    await expect(next).toHaveCSS('pointer-events', 'auto');
    expect((await next.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    await expect(study.locator('.pagination-swipe-hint')).toBeHidden();
    await next.click();
    await expect(study.locator('.study-pagination')).toContainText('5–8 of 20');
    await settled(study);
    const row = study.locator('.swiper-slide-active .calorie-row:not(.swiper-slide[aria-hidden=true] *)').first();
    const box = (await row.boundingBox())!;
    await page.mouse.move(box.x + box.width * .8, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .2, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(study.locator('.study-pagination')).toContainText('5–8 of 20');
  });
});

for (const reducedMotion of ['reduce', 'no-preference'] as const) test(`native finger input pages every calorie category with ${reducedMotion} motion`, async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Native touch dispatch uses Chromium CDP; browser input and layout also run in WebKit.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion });
  await openRoute(page, '/#/');
  const study = page.locator('#home-calories');
  await study.locator('.home-study-toggle').click();
  await expect(study.locator('.home-study-panel')).toHaveAttribute('style', /height: auto/);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const stroke = async (dx: number, dy = 0) => {
    const row = study.locator('.swiper-slide-active .calorie-row:not(.swiper-slide[aria-hidden=true] *)').nth(1);
    await row.scrollIntoViewIfNeeded();
    const box = (await row.boundingBox())!, x = box.x + box.width * (dx < 0 ? .75 : .25), y = box.y + box.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / 6, y: y + dy * i / 6, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const position = study.getByRole('navigation', { name: 'Calorie servings' });
  for (const category of ['Cocktails', 'Beer', 'Wine', 'Shots']) {
    await study.getByRole('button', { name: category, exact: true }).click();
    await stroke(-110, 4);
    await expect(position).toContainText('5–8 of');
    await settled(study);
    await stroke(110, 4);
    await expect(position).toContainText('1–4 of');
    await settled(study);
    await expect(study.locator('.calorie-recipe')).toHaveCount(0);
  }
  const before = await page.evaluate(() => scrollY);
  await stroke(2, -130);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 30);
  await expect(position).toContainText('1–4 of');
  await cdp.detach();
});

test('Atlas story paging leaves sliders and wide charts in control of their own gestures', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRoute(page, '/#/atlas?story=beer');
  const chooser = page.getByLabel('Choose a visual story');
  await swipePage(page.locator('.swiper-slide-active .atlas-story-heading h2'));
  await expect(chooser).toHaveValue('scotch');
  await swipePage(page.locator('.swiper-slide-active .atlas-story-heading h2'), 'previous');
  await expect(chooser).toHaveValue('beer');
  await chooser.selectOption('dilution');
  const slider = page.getByRole('slider', { name: 'Meltwater added' });
  await slider.press('End');
  await expect(page.locator('.swiper-slide-active .atlas-insight-number')).toContainText('13.5');
  await expect(chooser).toHaveValue('dilution');
  await chooser.selectOption('pairings');
  const plot = page.locator('.swiper-slide-active .atlas-chart-stage .atlas-plot');
  await settled(page.locator('.atlas-reader'));
  await plot.scrollIntoViewIfNeeded();
  expect(await plot.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  if (browserName === 'webkit') return; // Mobile WebKit cannot dispatch wheel input.
  const box = (await plot.boundingBox())!;
  await page.mouse.move(box.x + box.width * .7, Math.min(box.y + box.height / 2, 550));
  await page.mouse.wheel(120, 0);
  await expect.poll(() => plot.evaluate(el => el.scrollLeft)).toBeGreaterThan(30);
  await expect(chooser).toHaveValue('pairings');
});

for (const width of [320, 390, 430, 768, 1024, 1440]) {
  test(`Focus & Return fits ${width}px in both themes`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await openRoute(page, '/#/');
    const pair = page.locator('#home-pairings');
    await pair.locator('.home-study-toggle').click();
    await expect(pair.locator('.pairing-matrix-cell')).toHaveCount(144);
    await expect(pair.locator('.pairing-selected-pair p')).toHaveText('11 shared recipes');
    await pair.getByRole('button', { name: 'View all 11 recipes', exact: true }).click();
    await expect(pair.locator('.study-recipe-list button')).toHaveCount(11);
    // Every result is available, including the last; no three-recipe hard cap.
    await pair.locator('.study-recipe-list button').last().click();
    await expect(pair.locator('.study-recipe-preview > h4')).toHaveText('Vodka Nimbu Soda');
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.house-theme').click();
      await pair.locator('.study-recipe-preview').screenshot({ path: info.outputPath(`pairing-recipe-${width}-${theme}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
    await pair.getByRole('button', { name: 'Back to 11 drinks', exact: true }).click();
    await pair.getByRole('button', { name: 'Hide recipes', exact: true }).click();
    const finder = page.locator('#home-pantry');
    await finder.locator('.home-study-toggle').click();
    await addFinderIngredients(finder);
    await expect(finder.locator('.finder-result-tabs button')).toHaveText(['Can make2', 'Need 129', 'Need 2202']);
    await finder.locator('.study-recipe-list button').filter({ hasText: 'Negroni' }).click();
    await expect(finder.locator('.study-recipe-preview > h4')).toHaveText('Negroni');
    const list = finder.locator('.study-recipe-results');
    if (width <= 900) await expect(list).toBeHidden();
    else {
      await expect(list).toBeVisible();
      const boxes = await finder.evaluate(el => ({ list: el.querySelector('.study-recipe-choices')!.getBoundingClientRect().right, recipe: el.querySelector('.study-recipe-focus')!.getBoundingClientRect().left }));
      expect(boxes.list).toBeLessThan(boxes.recipe);
    }
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.house-theme').click();
      const preview = finder.locator('.study-recipe-preview');
      await preview.screenshot({ path: info.outputPath(`finder-${width}-${theme}.png`) });
      const framing = await preview.locator('img').evaluate(el => ({ fit: getComputedStyle(el).objectFit, height: el.getBoundingClientRect().height, frame: el.parentElement!.getBoundingClientRect().height, transform: getComputedStyle(el).transform }));
      expect(framing.fit).toBe('contain'); expect(framing.height).toBeCloseTo(framing.frame, 0); expect(framing.transform).toBe('none');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
  });
}

test('beer and wine are separate, browse every style with a stable scale and only two sorts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRoute(page, '/#/');
  const study = page.locator('#home-calories');
  await study.locator('.home-study-toggle').click();
  await expect(study.getByLabel('Calorie sort').locator('option')).toHaveText(['Lowest first', 'Highest first']);
  await expect(study.locator('.calorie-reference-key, .calorie-reference-line')).toHaveCount(0);
  await expect(study.getByLabel('Reference serving')).toHaveCount(0);
  for (const [label, count, volume] of [['Beer', 14, '568 ml'], ['Wine', 29, '150 ml']] as const) {
    await study.getByRole('button', { name: label, exact: true }).click();
    await expect(study.locator('.calorie-serving')).toContainText(volume);
    await expect(study.locator('.calorie-axis, .study-note')).toHaveCount(0);
    const seen: string[] = [];
    while (true) {
      seen.push(...await study.locator('[data-calorie-drink]:not(.swiper-slide[aria-hidden=true] *)').evaluateAll(els => els.map(el => el.getAttribute('data-calorie-drink')!)));
      const next = study.getByRole('button', { name: 'Next calorie servings' });
      if (await next.isDisabled()) break;
      await swipePage(study.locator('.calorie-group:not(.swiper-slide[aria-hidden=true] *)'));
    }
    expect(new Set(seen).size).toBe(count);
    await study.getByLabel('Calorie sort').selectOption('high');
    await expect(study.getByRole('navigation', { name: 'Calorie servings' })).toContainText(`1–4 of ${count}`);
    await study.locator('.calorie-row:not(.swiper-slide[aria-hidden=true] *)').first().click();
    await expect(study.locator('.calorie-profile a')).toHaveAttribute('href', /^https:\/\//);
    await study.getByLabel('Calorie sort').selectOption('kcal');
  }
});

test('full matrix supports precision expansion, keyboard selection and rotation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRoute(page, '/#/');
  const study = page.locator('#home-pairings');
  await study.locator('.home-study-toggle').click();
  await study.getByRole('button', { name: /^Gin and Lemon Juice:/ }).click();
  await expect(study.locator('.pairing-selected-pair p')).toHaveText('24 shared recipes');
  await study.locator('.pairing-matrix-cell[aria-pressed="true"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(study.getByLabel('Second ingredient', { exact: true })).toHaveValue('lime juice');
  await expect(study.locator('.pairing-matrix-cell[aria-pressed="true"]')).toBeFocused();
  await study.getByRole('button', { name: 'Expand grid', exact: true }).click();
  await expect(study.locator('.pairing-matrix-cell')).toHaveCount(144);
  const cell = await study.locator('.pairing-matrix-cell').first().boundingBox();
  expect(cell!.width).toBeGreaterThanOrEqual(44); expect(cell!.height).toBeGreaterThanOrEqual(44);
  await study.getByRole('button', { name: 'Fit grid', exact: true }).click();
  await expect(study.getByRole('group', { name: 'Pairing measure' })).toHaveCount(0);
  await study.getByLabel('Second ingredient', { exact: true }).selectOption('lemon juice');
  await expect(study.locator('.pairing-selected-pair p')).toHaveText('24 shared recipes');
  for (const size of [{width:1024,height:430}, {width:390,height:844}]) {
    await page.setViewportSize(size);
    await expect(study.locator('.pairing-matrix-cell')).toHaveCount(144);
    await expect(study.getByLabel('First ingredient', { exact: true })).toHaveValue('gin');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
});

test('mobile study controls stay reachable during scrolling and stop pinning in short landscape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRoute(page, '/#/');
  const study = page.locator('#home-calories');
  await study.locator('.home-study-toggle').click();
  await expect.poll(() => study.locator('.home-study-panel').evaluate(el => (el as HTMLElement).style.height)).toBe('auto');
  await study.locator('.calorie-controls').evaluate(el => scrollTo(0, el.getBoundingClientRect().top + scrollY + 70));
  await expect.poll(() => study.locator('.calorie-controls').evaluate(el => Math.abs(el.getBoundingClientRect().top - document.querySelector('.house-nav')!.getBoundingClientRect().bottom))).toBeLessThan(2);
  const pinned = await study.locator('.calorie-controls').evaluate(el => ({ top: el.getBoundingClientRect().top, nav: document.querySelector('.house-nav')!.getBoundingClientRect().bottom, position: getComputedStyle(el).position }));
  expect(pinned.position).toBe('sticky');
  expect(Math.abs(pinned.top - pinned.nav)).toBeLessThan(2);
  await study.getByRole('button', { name: 'Beer', exact: true }).click();
  await expect(study.locator('.calorie-serving')).toContainText('568 ml');
  await page.setViewportSize({ width: 844, height: 390 });
  expect(await study.locator('.calorie-controls').evaluate(el => getComputedStyle(el).position)).toBe('static');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 390, height: 844 });
  const pair = page.locator('#home-pairings');
  await pair.locator('.home-study-toggle').click();
  await expect.poll(() => pair.locator('.home-study-panel').evaluate(el => (el as HTMLElement).style.height)).toBe('auto');
  const controls = pair.locator('.pairing-toolbar');
  const gridTop = (await pair.locator('.pairing-matrix').boundingBox())!.y;
  expect((await pair.locator('.pairing-matrix-caption').boundingBox())!.y).toBeLessThan(gridTop);
  expect((await pair.locator('.pairing-view-recipes').boundingBox())!.y).toBeLessThan(gridTop);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const layout = await pair.evaluate(el => {
      const bar = el.querySelector('.pairing-view-recipes')!.getBoundingClientRect();
      const count = el.querySelector('.pairing-selected-pair p')!.getBoundingClientRect();
      const study = el.getBoundingClientRect();
      return { width: bar.width, expectedWidth: study.width, top: bar.top, countBottom: count.bottom, primary: el.querySelector('.pairing-view-recipes')!.classList.contains('is-primary') };
    });
    expect(Math.abs(layout.width - layout.expectedWidth)).toBeLessThan(2);
    expect(layout.top).toBeGreaterThanOrEqual(layout.countBottom);
    expect(layout.primary).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await controls.evaluate(el => scrollTo(0, el.getBoundingClientRect().top + scrollY + 90));
  const pairTop = await controls.boundingBox();
  const navBottom = await page.locator('.house-nav').evaluate(el => el.getBoundingClientRect().bottom);
  expect(Math.abs(pairTop!.y - navBottom)).toBeLessThan(2);
  await pair.getByRole('button', { name: 'View all 11 recipes', exact: true }).click();
  await pair.locator('.study-recipe-list').getByRole('button').first().click();
  const back = pair.getByRole('button', { name: 'Back to 11 drinks', exact: true });
  await expect(back).toBeFocused();
  const controlsBox = (await controls.boundingBox())!, backBox = (await back.boundingBox())!;
  expect(backBox.y).toBeGreaterThanOrEqual(controlsBox.y + controlsBox.height - 1);
  // Hit testing catches a sticky toolbar covering an otherwise-visible Back action.
  expect(await back.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
  await back.click();
  await expect(pair.locator('.study-recipe-list').getByRole('button')).toHaveCount(11);
  await page.setViewportSize({ width: 844, height: 390 });
  expect(await controls.evaluate(el => getComputedStyle(el).position)).toBe('static');
});

test('inline recipe actions, full-screen reader and Back preserve the result list', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRoute(page, '/#/');
  const study = page.locator('#home-pantry');
  await study.locator('.home-study-toggle').click();
  await addFinderIngredients(study);
  await study.getByRole('button', { name: /^Need 1/ }).click();
  await expect(study.locator('.study-recipe-list button')).toHaveCount(29);
  const last = study.locator('.study-recipe-list button').last();
  const chosen = await last.locator('strong').textContent();
  await last.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const before = await study.locator('.study-recipe-list').evaluate(el => ({ top: el.scrollTop, y: scrollY }));
  await last.click();
  const preview = study.locator('.study-recipe-preview');
  await expect(preview.locator('h4')).toHaveText(chosen!);
  await preview.getByRole('button', { name: 'Save to Tab', exact: true }).click();
  await expect(preview.getByRole('button', { name: 'Saved to Tab', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await preview.getByRole('button', { name: /^Like$/ }).click();
  await expect(preview.getByRole('button', { name: /^Liked/ })).toHaveAttribute('aria-pressed', 'true');
  const expand = preview.getByRole('button', { name: /in full screen/ });
  await expand.click();
  const reader = page.getByRole('dialog', { name: chosen!, exact: true });
  await expect(reader).toHaveAttribute('data-phase', 'open');
  await reader.getByRole('button', { name: /Lock recipe view/ }).click();
  await expect(reader.locator('.recipe-focus-scroller')).toHaveClass(/is-locked/);
  await page.keyboard.press('Escape');
  await expect(reader).toHaveCount(0);
  await expect(expand).toBeFocused();
  await study.getByRole('button', { name: 'Back to 29 drinks', exact: true }).click();
  await expect(last).toBeFocused();
  await expect.poll(() => study.locator('.study-recipe-list').evaluate(el => el.scrollTop)).toBe(before.top);
  await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - before.y)).toBeLessThan(2);
  await expect(study.getByRole('button', { name: /^Need 1/ })).toHaveAttribute('aria-pressed', 'true');
});

test('Add & open Shelf merges ingredients, keeps existing bottles and does not duplicate them', async ({ page }) => {
  await openRoute(page, '/#/');
  const study = page.locator('#home-pantry');
  await study.locator('.home-study-toggle').click();
  await addFinderIngredients(study, ['Gin']);
  // Editing the study does not write to Shelf.
  await navigateTo(page, 'Shelf');
  await expect(page.locator('#shelf .chip-row .chip')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search ingredients', exact: true }).fill('Bourbon');
  await page.getByRole('option', { name: /Bourbon/ }).first().click();
  await page.getByRole('link', { name: 'PubCrawl home', exact: true }).click();
  await study.getByRole('link', { name: 'Add & open Shelf', exact: true }).click();
  await expect(page.locator('#shelf .chip-row')).toContainText('Bourbon');
  await expect(page.locator('#shelf .chip-row')).toContainText('Gin');
  const count = await page.locator('#shelf .chip-row .chip').count();
  await page.getByRole('button', { name: 'Back to What can I make?', exact: true }).click();
  await study.getByRole('link', { name: 'Add & open Shelf', exact: true }).click();
  await expect(page.locator('#shelf .chip-row .chip')).toHaveCount(count);
});

test('failed recipe images use the existing glass fallback', async ({ page }) => {
  await page.route('**/*', route => route.request().resourceType() === 'image' ? route.abort() : route.continue());
  await openRoute(page, '/#/');
  const study = page.locator('#home-pairings');
  await study.locator('.home-study-toggle').click();
  await study.getByRole('button', { name: 'View all 11 recipes', exact: true }).click();
  await study.locator('.study-recipe-list button').first().click();
  await expect(study.getByRole('img', { name: 'No recipe photo available', exact: true })).toBeVisible();
  await expect(study.locator('.study-recipe-photo')).toHaveCSS('overflow', 'clip');
});

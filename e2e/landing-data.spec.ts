import { expect, test } from '@playwright/test';
import { openRoute, seedStableDevice, useTasteMap } from './helpers';
import { installFakeYouTube } from './fixtures/shortsFakeYouTube';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  await seedStableDevice(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('opens with a full-screen introduction and the requested four studies in order', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', request => requested.push(request.url()));
  await openRoute(page, '/#/');
  await expect(page.locator('[data-home-story]')).toHaveCount(4);
  expect(await page.locator('[data-home-story]').evaluateAll(elements => elements.map(el => el.getAttribute('data-home-story')))).toEqual(['pantry','calories','dna','pairings']);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('What’s your poison?');
  await expect(page.locator('.spritz-hero, .flavour-compass, .landing-atlas-entry, .bar-stories, .landing-shorts-rail, .landing-watch-rail')).toHaveCount(0);
  await expect(page.locator('.calorie-row')).toHaveCount(8);
  await expect(page.getByRole('heading', { name: 'Drinks, decoded.', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'More at the bar.', level: 2 })).toBeVisible();
  await expect(page.locator('.home-studies [data-home-story]')).toHaveCount(4);
  await expect(page.locator('.home-studies h3.home-study-heading')).toHaveCount(4);
  const editorial = page.getByRole('navigation', { name: 'More to explore' });
  await expect(editorial.getByRole('link')).toHaveCount(4);
  await expect(editorial.getByRole('link', { name: 'Pub Quiz', exact: true })).toHaveAttribute('href', '#/quiz');
  await expect(editorial.getByRole('link', { name: 'Bar Basics', exact: true })).toHaveAttribute('href', '#/basics');
  await expect(editorial.getByRole('link', { name: 'Your Tab', exact: true })).toHaveAttribute('href', '#/tab');
  expect(requested.filter(url => /client_catalog[-.]|watchLibrary-|BarAtlas-/.test(url))).toEqual([]);
  const navigation = page.locator('.house-desktop-links:visible, .house-mobile-links:visible');
  await expect(navigation.locator('.house-nav-link > span:last-child')).toHaveText(['Drinks','Taste Map','Shelf','Tab','Explore+']);
  await navigation.getByRole('button', { name: 'Explore', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'Explore PubCrawl' });
  await expect(menu.getByRole('link')).toHaveCount(4);
  await expect(menu.getByRole('link', { name: /Atlas/ })).toHaveCount(0);
});

test('calories stay compact, sort the whole category and retain the comparison after a recipe visit', async ({ page }) => {
  await openRoute(page, '/#/');
  const calories = page.locator('#home-calories');
  await calories.locator('.home-study-toggle').click();
  await expect(calories.getByRole('button', { name: 'Cocktails', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(calories.locator('.calorie-row')).toHaveCount(8);
  await expect(calories.getByRole('navigation', { name: 'Calorie servings' })).toContainText('1–8 of 20');
  await calories.getByLabel('Calorie order', { exact: true }).selectOption('kcal');
  await expect(calories.locator('.calorie-name').first()).toContainText('Bamboo');
  await calories.getByRole('button', { name: 'Next calorie servings' }).click();
  await calories.getByRole('button', { name: 'Next calorie servings' }).click();
  await expect(calories.locator('.calorie-row')).toHaveCount(4);
  await expect(calories.locator('.calorie-name').last()).toContainText('Zombie');
  await expect(calories.getByRole('button', { name: 'Next calorie servings' })).toBeDisabled();
  await calories.getByLabel('Calorie order', { exact: true }).selectOption('list');
  await calories.getByLabel('Reference serving', { exact: true }).selectOption('red-wine');
  const row = calories.locator('[data-calorie-drink="negroni"]');
  await row.getByRole('button').focus();
  await page.keyboard.press('Enter');
  await expect(row.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  await expect(row.locator('.calorie-recipe')).toContainText('30 ml');
  await expect(calories.locator('.calorie-method, .calorie-data, .calorie-ingredient-notes')).toHaveCount(0);
  await row.getByRole('link', { name: 'Find the drink' }).click();
  await expect(page.locator('#menu-list')).toBeVisible();
  await page.getByRole('button', { name: 'Back to Calories, by the glass' }).click();
  await expect(row.getByRole('link', { name: 'Find the drink' })).toBeFocused();
  await expect(row.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  await expect(calories.getByLabel('Reference serving', { exact: true })).toHaveValue('red-wine');
  await calories.getByRole('button', { name: 'Beer & wine', exact: true }).click();
  await expect(calories.locator('.calorie-row')).toHaveCount(3);
  await expect(calories.locator('.calorie-group')).toContainText('568 ml');
  await calories.getByRole('button', { name: '30 ml shots', exact: true }).click();
  await expect(calories.locator('.calorie-row')).toHaveCount(8);
  await calories.getByRole('button', { name: 'Next calorie servings' }).click();
  await expect(calories.locator('.calorie-row')).toHaveCount(8);
  await expect(calories.locator('.calorie-rows')).toContainText('30 ml · 60%');
  await expect(calories.getByRole('navigation', { name: 'Calorie servings' })).toContainText('9–16 of 16');
});

test('editorial folds support independent keyboard disclosure, retained selections and returning to the heading', async ({ page, browserName }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openRoute(page, '/#/');
  const pantry = page.locator('#home-pantry');
  const calories = page.locator('#home-calories');
  const dna = page.locator('#home-dna');
  await expect(page.locator('.home-study-toggle[aria-expanded="true"]')).toHaveCount(1);
  await expect(pantry.locator('.home-study-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(calories.locator('.home-study-panel')).toBeHidden();
  expect(await calories.locator('.home-study-panel').evaluate(el => (el as HTMLElement).inert)).toBe(true);
  await pantry.locator('.home-study-toggle').focus();
  await page.keyboard.press('Space');
  await expect(pantry.locator('.home-study-panel')).toBeHidden();
  // Safari's default keyboard mode uses Option-Tab to include native buttons.
  await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
  await expect(calories.locator('.home-study-toggle')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(calories.locator('.home-study-panel')).toBeVisible();
  await calories.getByRole('button', { name: '30 ml shots', exact: true }).click();
  await calories.locator('[data-calorie-drink="shot-vodka"] .calorie-row').click();
  await dna.locator('.home-study-toggle').click();
  await expect(page.locator('.home-study-toggle[aria-expanded="true"]')).toHaveCount(2);
  await calories.locator('.home-study-toggle').click();
  await expect(calories.locator('.home-study-panel')).toBeHidden();
  await calories.locator('.home-study-toggle').click();
  await expect(calories.locator('.calorie-row')).toHaveCount(8);
  await expect(calories.locator('[data-calorie-drink="shot-vodka"] .calorie-row')).toHaveAttribute('aria-expanded','true');
  await calories.getByRole('button', { name: 'Fold this study', exact: true }).click();
  await expect(calories.locator('.home-study-toggle')).toBeFocused();
  await expect(calories.locator('.home-study-panel')).toBeHidden();
  // The fold and its scroll correction finish on separate animation frames.
  // Assert the settled reading position, including on a busy test runner.
  await expect.poll(async () => (await calories.locator('.home-study-toggle').boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(78);
  await expect(dna.locator('.home-study-toggle')).toHaveAttribute('aria-expanded','true');
});

test('the shelf flow, recipe selection, colour tooltips and pair summary are clear without disclosures', async ({ page, browserName }) => {
  await openRoute(page, '/#/');
  const pantry = page.locator('#home-pantry');
  await expect(pantry.locator('.pantry-step h4')).toHaveText(['1Your test shelf','2Your best next addition','3Choose a drink']);
  await expect(pantry.locator('.pantry-shelf-item')).toHaveCount(4);
  await expect(pantry.locator('.pantry-picker-panel')).toBeHidden();
  const ready = pantry.getByRole('group', { name: 'Recipe readiness' }).getByRole('button').first();
  const before = Number(await ready.locator('strong').textContent());
  await pantry.getByRole('button', { name: 'Add to test shelf', exact: true }).click();
  expect(Number(await ready.locator('strong').textContent())).toBeGreaterThan(before);
  await expect(ready).toHaveAttribute('aria-pressed', 'true');
  await expect(pantry.locator('.pantry-new')).toHaveCount(2);
  await pantry.locator('.pantry-picker > summary').click();
  await expect(pantry.getByRole('textbox', { name: 'Find an ingredient' })).toBeFocused();
  await pantry.getByRole('textbox', { name: 'Find an ingredient' }).fill('bourbon');
  await pantry.getByRole('button', { name: 'Add Bourbon', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(pantry.locator('.pantry-picker > summary')).toBeFocused();
  await expect(pantry.locator('.pantry-picker-panel')).toBeHidden();
  await expect(pantry.getByRole('button', { name: 'Remove Bourbon', exact: true })).toBeVisible();
  const dna = page.locator('#home-dna');
  await dna.locator('.home-study-toggle').click();
  await expect(dna.getByRole('button', { name: 'Actual measures · ml', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dna.locator('.atlas-dna-list button').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(dna.locator('.atlas-dna-list button').first()).toContainText('Selected');
  const base = dna.locator('.atlas-legend').getByRole('img', { name: 'Base spirit', exact: true });
  if (browserName !== 'webkit') {
    await dna.locator('.atlas-dna-segment').first().hover();
    await expect(page.getByRole('tooltip')).toContainText('Base spirit');
    await page.keyboard.press('Escape');
  }
  await base.focus();
  await page.evaluate(() => scrollBy(0, 20));
  await expect(page.getByRole('tooltip')).toHaveText('Base spirit');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await dna.getByRole('button', { name: /^Spritz, 180 ml/ }).click();
  await expect(dna.locator('.atlas-insight')).toContainText('Spritz');
  await expect(dna.locator('.atlas-insight-number')).toContainText('180');
  await dna.getByRole('button', { name: 'Proportions · %', exact: true }).click();
  await expect(dna.locator('.atlas-axis-note')).toContainText('100%');
  const pairings = page.locator('#home-pairings');
  await pairings.locator('.home-study-toggle').click();
  await pairings.getByLabel('First ingredient', { exact: true }).selectOption('gin');
  await pairings.getByLabel('Second ingredient', { exact: true }).selectOption('gin');
  await pairings.getByRole('button', { name: 'Shared / union · %', exact: true }).click();
  await expect(pairings.locator('.atlas-pair-number')).toContainText('100');
  const positions = await pairings.evaluate(el => ({ summary: el.querySelector('.study-pairing-summary')!.getBoundingClientRect().bottom, plot: el.querySelector('.atlas-plot')!.getBoundingClientRect().top }));
  expect(positions.summary).toBeLessThan(positions.plot);
  await expect(page.locator('.home-studies .atlas-data, .home-studies .atlas-source-notes, #home-pairings .atlas-pan-hint')).toHaveCount(0);
});

test('full-height opening, chart scales and expanded rows fit every width and theme', async ({ page }, info) => {
  test.setTimeout(90_000);
  await openRoute(page, '/#/');
  await expect(page.locator('[data-home-story]')).toHaveCount(4);
  await page.locator('#home-calories .home-study-toggle').click();
  for (const width of [320,390,430,768,1024,1440]) {
    await page.setViewportSize({ width, height: width === 320 ? 700 : 900 });
    for (const theme of ['light','dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.house-theme').click();
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const opening = await page.locator('.home-opening').evaluate(el => {
        const hero = el.getBoundingClientRect(), nav = document.querySelector('.house-nav')!.getBoundingClientRect();
        const mobile = document.querySelector('.house-mobile-links')!;
        const bottom = getComputedStyle(mobile).display === 'none' ? innerHeight : mobile.getBoundingClientRect().top;
        return { height: hero.height, available: bottom - nav.bottom, font: parseFloat(getComputedStyle(el.querySelector('h1')!).fontSize), overflow: document.documentElement.scrollWidth - innerWidth };
      });
      expect(opening.height).toBeGreaterThanOrEqual(opening.available - 2);
      expect(opening.height).toBeLessThanOrEqual(opening.available + 3);
      expect(opening.font).toBeGreaterThanOrEqual(width === 320 ? 70 : 80);
      expect(opening.overflow).toBeLessThanOrEqual(1);
      await page.locator('[data-calorie-drink="negroni"] .calorie-row').click();
      const scale = await page.locator('#home-calories .calorie-group').evaluate(el => {
        const axis = el.querySelector('.calorie-axis > div')!.getBoundingClientRect(), track = el.querySelector('.calorie-track')!.getBoundingClientRect();
        return { left: Math.abs(axis.left - track.left), right: Math.abs(axis.right - track.right), overflow: document.documentElement.scrollWidth - innerWidth };
      });
      expect(scale.left).toBeLessThan(1); expect(scale.right).toBeLessThan(1); expect(scale.overflow).toBeLessThanOrEqual(1);
      if (width === 390 || width === 1440) await page.screenshot({ path: info.outputPath(`calories-${width}-${theme}.png`) });
      await page.locator('[data-calorie-drink="negroni"] .calorie-row').click();
      await page.getByRole('button', { name: 'Scroll to top', exact: true }).click();
      await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(2);
      if (width === 390 || width === 1440) await page.screenshot({ path: info.outputPath(`opening-${width}-${theme}.png`) });
    }
  }
  await page.setViewportSize({ width: 926, height: 428 });
  await expect(page.locator('[data-tour="landing-make"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('study paging remains tappable beside the floating scroll-to-top button', async ({ page }) => {
  await openRoute(page, '/#/');
  await page.locator('#home-calories .home-study-toggle').click();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const name of ['Next shelf recipes', 'Next calorie servings']) {
      const next = page.getByRole('button', { name, exact: true });
      await next.scrollIntoViewIfNeeded();
      const top = page.getByRole('button', { name: 'Scroll to top', exact: true });
      await expect(top).toBeVisible();
      await next.evaluate(el => {
        const target = el.getBoundingClientRect(), floating = document.querySelector('.scroll-to-top')!.getBoundingClientRect();
        window.scrollBy(0, target.top + target.height / 2 - floating.top - floating.height / 2);
      });
      expect(await next.evaluate(el => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
      })).toBe(true);
      const before = await next.locator('..').locator('..').textContent();
      await next.click();
      expect(await next.locator('..').locator('..').textContent()).not.toBe(before);
    }
  }
});

test('scroll-to-top works across pages, stays above phone navigation and defers to dialogs', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRoute(page, '/#/');
  const top = page.getByRole('button', { name: 'Scroll to top', exact: true });
  await expect(top).toBeHidden();
  for (const route of ['/#/','/#/menu?view=list','/#/basics','/#/watch','/#/atlas']) {
    await openRoute(page, route);
    if (route.includes('watch')) await expect(page.locator('.wv').first()).toBeVisible();
    if (route.includes('atlas')) await expect(page.locator('.atlas-cover')).toBeVisible();
    await page.locator('.foot').scrollIntoViewIfNeeded();
    await expect(top).toBeVisible();
    const geometry = await top.evaluate(el => ({ bottom: el.getBoundingClientRect().bottom, nav: document.querySelector('.house-mobile-links')!.getBoundingClientRect().top }));
    expect(geometry.bottom).toBeLessThan(geometry.nav);
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    await expect(top).toBeHidden();
    await page.getByRole('button', { name: 'Close explore menu', exact: true }).click();
    await expect(top).toBeVisible();
    await top.click();
    await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(2);
    await expect(top).toBeHidden();
    await expect(page.locator('#main-content')).toBeFocused();
  }
});

test('scroll-to-top returns the native Shorts feed to its first video', async ({ page }) => {
  await installFakeYouTube(page);
  await openRoute(page, '/#/shorts');
  const feed = page.locator('.shorts-feed');
  await expect(feed).toBeVisible();
  await feed.focus();
  await page.keyboard.press('PageDown');
  await expect.poll(() => feed.getAttribute('data-controller-active')).toBe('1');
  const top = page.getByRole('button', { name: 'Scroll to top', exact: true });
  await expect(top).toBeVisible();
  await top.click();
  await expect.poll(() => feed.getAttribute('data-controller-active')).toBe('0');
  await expect(top).toBeHidden();
});

test('researched Bar Talk stories expose their sources and Another one changes the story', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => .999; });
  await openRoute(page, '/#/basics');
  const talk = page.locator('#basics .bartalk');
  await expect(talk.locator('.bartalk-body > p')).toContainText('direction of freezing');
  await expect(talk.getByRole('link', { name: /Source/ })).toHaveAttribute('href', 'https://alcademics.com/what-is-directional-freezing/');
  await talk.getByRole('button', { name: 'Another one' }).click();
  await expect(talk.locator('.bartalk-body > p')).toContainText('Carousel Bar');
  await expect(talk.getByRole('link', { name: /Source/ })).toHaveCount(2);
});

test('Taste Map uses only directional sweetness labels and footer reveal masks contain serif descenders', async ({ page }) => {
  await openRoute(page, '/#/menu');
  await useTasteMap(page);
  const labels = page.locator('.taste-sweetness');
  await expect(labels).toHaveText('Less sweetSweeter');
  await expect(labels.locator('.taste-dimension')).toHaveCount(0);
  for (const width of [320,390,768,1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('.foot').scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.locator('.foot-big .mask-inner').evaluateAll(elements => elements.every(el => Math.abs(new DOMMatrixReadOnly(getComputedStyle(el).transform).m42) < 1))).toBe(true);
    const lines = await page.locator('.foot-big .mask').evaluateAll(elements => elements.map(el => {
      const mask = el.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el.querySelector('.mask-inner')!);
      const text = range.getBoundingClientRect();
      return { bottomClearance: mask.bottom - text.bottom, overflow: document.documentElement.scrollWidth - innerWidth };
    }));
    for (const line of lines) {
      expect(line.bottomClearance).toBeGreaterThanOrEqual(-1);
      expect(line.overflow).toBeLessThanOrEqual(1);
    }
  }
});

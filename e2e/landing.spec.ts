import { expect, test } from '@playwright/test';
import { installFakeYouTube, fakeLog } from './fixtures/shortsFakeYouTube';
import { openRoute, seedStableDevice } from './helpers';

const expectedShorts = [
  'mejHe0BJkLI', 'rIrPkH8UrYk', 'Bao5cwHCfKo',
  'bZW6CPKz8vE', 'Hkw-milaxes', 'TALPXtgnQjM',
];
const expectedWatch = ['i1iqVGORUck', 'b0IuTL3Z-kk', 'GE8vyfKyZfQ'];

test.describe('landing discovery', () => {
  test.beforeEach(async ({ page }) => {
    await seedStableDevice(page);
  });

  test('separates Home from Menu and keeps every destination explicit', async ({ page }) => {
    await openRoute(page, '/#/');
    await expect(page.locator('.landing-hero')).toBeVisible();
    await expect(page.locator('#menu-list:visible')).toHaveCount(0);
    await expect(page.getByText('EST. 2026')).toHaveCount(0);
    await expect(page.getByText('ADD YOUR INGREDIENTS')).toHaveCount(0);
    await expect(page.getByRole('main').getByRole('link', { name: /WHAT CAN I MAKE/ })).toHaveAttribute('href', '#/bar');
    await expect(page.getByRole('link', { name: /BROWSE ALL DRINKS/ })).toHaveAttribute('href', '#/menu');
    await expect(page.getByRole('link', { name: /OPEN SHORTS/ })).toHaveAttribute('href', '#/shorts?src=landing');
    await expect(page.getByRole('link', { name: /OPEN WATCH/ })).toHaveAttribute('href', '#/watch?src=landing');
    const more = page.getByRole('navigation', { name: 'More to explore' });
    await expect(more.getByRole('link', { name: 'PUB QUIZ', exact: true })).toHaveAttribute('href', '#/quiz');
    await expect(more.getByRole('link', { name: 'BAR BASICS', exact: true })).toHaveAttribute('href', '#/basics');
    await expect(more.getByRole('link', { name: 'YOUR TAB', exact: true })).toHaveAttribute('href', '#/tab');

    expect(await page.locator('.landing-short-card').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-preview-id')))).toEqual(expectedShorts);
    const watchLinks = await page.locator('.landing-watch-card > a').evaluateAll((links) => links.map((link) => new URL((link as HTMLAnchorElement).href).hash.match(/[?&]v=([^&]+)/)?.[1]));
    expect(watchLinks).toEqual(expectedWatch);

    const openShorts = page.getByRole('link', { name: /OPEN SHORTS/ });
    await openShorts.scrollIntoViewIfNeeded();
    await page.locator('.landing-media-rail').first().evaluate((rail) => { rail.scrollLeft = rail.scrollWidth; });
    await expect(openShorts).toBeInViewport();
    const openWatch = page.getByRole('link', { name: /OPEN WATCH/ });
    await openWatch.scrollIntoViewIfNeeded();
    await page.locator('.landing-watch-rail').evaluate((rail) => { rail.scrollLeft = rail.scrollWidth; });
    await expect(openWatch).toBeInViewport();

    await page.getByRole('link', { name: /BROWSE ALL DRINKS/ }).click();
    await expect(page.locator('#menu-list')).toBeVisible();
    await expect(page.locator('.landing-hero:visible')).toHaveCount(0);
  });

  test('preserves Menu state and landing scroll positions across route returns', async ({ page }) => {
    await openRoute(page, '/#/menu');
    const search = page.getByRole('textbox', { name: /Search menu/ });
    await search.fill('martini');
    await page.locator('.brand').first().click();
    await expect(page.locator('.landing-page')).toBeVisible();
    await page.locator('.landing-watch-card').first().scrollIntoViewIfNeeded();
    await page.locator('.landing-shorts-rail').evaluate((rail) => { rail.scrollLeft = 120; });
    const before = await page.evaluate(() => ({ y: scrollY, x: document.querySelector<HTMLElement>('.landing-shorts-rail')?.scrollLeft || 0 }));
    await page.getByRole('link', { name: /OPEN WATCH/ }).click();
    await expect(page.locator('.watch')).toBeVisible();
    await page.goBack();
    await expect(page.locator('.landing-page')).toBeVisible();
    // An iframe becoming active/inactive can change the rail's status line by
    // a few pixels. Preserve the visitor's visual position within that small
    // non-layout-navigation tolerance rather than requiring byte-level scrollY.
    await expect.poll(() => page.evaluate((expected) => Math.abs(scrollY - expected), before.y)).toBeLessThanOrEqual(12);
    expect(Math.abs(await page.locator('.landing-shorts-rail').evaluate((rail) => rail.scrollLeft) - before.x)).toBeLessThanOrEqual(3);
    await page.getByRole('link', { name: /BROWSE ALL DRINKS/ }).click();
    await expect(search).toHaveValue('martini');
  });

  test('cycles one muted preview at a time without changing full Shorts preferences', async ({ page }) => {
    await installFakeYouTube(page);
    await page.addInitScript(() => {
      sessionStorage.setItem('pubcrawl.shorts.sound.v1', JSON.stringify({ version: 1, desiredAudible: true, volume: 73 }));
      sessionStorage.setItem('pubcrawl.shorts.rate.v1', JSON.stringify({ version: 1, preferredRate: 1.5 }));
    });
    await openRoute(page, '/#/');
    await page.locator('.landing-short-card').first().scrollIntoViewIfNeeded();
    await expect(page.locator('.landing-preview-player iframe')).toHaveCount(1, { timeout: 10_000 });
    await expect.poll(async () => (await fakeLog(page)).some((entry) => entry.method === 'playVideo')).toBe(true);
    const firstId = await page.locator('.landing-short-card.is-previewing').getAttribute('data-preview-id');
    for (let step = 0; step < 11; step += 1) {
      await page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.advanceTime(0.25));
      await page.waitForTimeout(210);
    }
    await expect.poll(async () => (await fakeLog(page)).filter((entry) => entry.method === 'construct').length).toBeGreaterThanOrEqual(2);
    expect(await page.locator('.landing-preview-player iframe').count()).toBeLessThanOrEqual(1);
    const log = await fakeLog(page);
    const firstConstruct = log.findIndex((entry) => entry.method === 'construct');
    const firstDestroy = log.findIndex((entry, index) => index > firstConstruct && entry.method === 'destroy');
    const secondConstruct = log.findIndex((entry, index) => index > firstConstruct && entry.method === 'construct');
    expect(firstDestroy).toBeGreaterThan(firstConstruct);
    expect(secondConstruct).toBeGreaterThan(firstDestroy);
    expect(log.filter((entry) => entry.method === 'unMute')).toHaveLength(0);
    expect(firstId).toBe(expectedShorts[0]);
    expect(await page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(JSON.stringify({ version: 1, desiredAudible: true, volume: 73 }));
    expect(await page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.rate.v1'))).toBe(JSON.stringify({ version: 1, preferredRate: 1.5 }));

    await page.getByRole('link', { name: /OPEN WATCH/ }).click();
    await expect(page.locator('.landing-preview-player iframe')).toHaveCount(0);
    const finalLog = await fakeLog(page);
    expect(finalLog.at(-1)?.method).toBe('destroy');
  });

  test('does not autoplay under reduced motion unless the user explicitly starts previews', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installFakeYouTube(page);
    await openRoute(page, '/#/');
    await page.locator('.landing-short-card').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(700);
    await expect(page.locator('.landing-preview-player iframe')).toHaveCount(0);
    await page.getByRole('button', { name: 'Play Shorts previews' }).click();
    await expect(page.locator('.landing-preview-player iframe')).toHaveCount(1);
  });

  test('landing tutorial is Help-only and remains replayable', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('pubcrawl.tour.landing.v1'));
    await openRoute(page, '/#/');
    await page.waitForTimeout(500);
    await expect(page.locator('.guided-tour-popover')).toHaveCount(0);
    const help = page.getByRole('button', { name: 'Show landing page tutorial' });
    await help.click();
    await expect(page.locator('.guided-tour-popover')).toBeVisible();
    await page.getByRole('button', { name: 'SKIP', exact: true }).click();
    await expect(page.locator('.guided-tour-popover')).toHaveCount(0);
    await help.click();
    await expect(page.locator('.guided-tour-popover')).toBeVisible();
  });
});

test.describe('mobile page-start rhythm', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await seedStableDevice(page);
  });

  test('keeps the first meaningful element 20px below the header on requested pages', async ({ page }) => {
    const cases: Array<[string, string]> = [
      ['/#/', '.landing-kicker'],
      ['/#/bar', '#shelf > .sec-head .sec-head-row'],
      ['/#/watch', '.watch > .watch-page-head .sec-head-row'],
      ['/#/quiz', '#quiz-page > .sec-head .sec-head-row'],
      ['/#/basics', '#basics > .sec-head .sec-head-row'],
      ['/#/tab', '#tab-page > .sec-head .sec-head-row'],
    ];
    for (const [route, target] of cases) {
      await openRoute(page, route);
      await expect(page.locator(target)).toBeVisible({ timeout: 20_000 });
      // Geometry is measured after the landing's bounded 12px entrance has
      // completed; transforms do not represent the settled page-start gap.
      await page.waitForTimeout(700);
      const gap = await page.evaluate((selector) => {
        const header = document.querySelector('.nav')!.getBoundingClientRect();
        const content = document.querySelector(selector)!.getBoundingClientRect();
        return Math.round(content.top - header.bottom);
      }, target);
      expect(gap, `${route} page-start gap`).toBeGreaterThanOrEqual(16);
      expect(gap, `${route} page-start gap`).toBeLessThanOrEqual(24);
    }
    const landingTitle = page.locator('.landing-title > span').first();
    await openRoute(page, '/#/');
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: width === 320 ? 700 : 844 });
      const [line, main] = await Promise.all([landingTitle.boundingBox(), page.locator('main').boundingBox()]);
      expect(line).not.toBeNull();
      expect(main).not.toBeNull();
      expect((line?.x || 0) + (line?.width || 0)).toBeLessThanOrEqual((main?.x || 0) + (main?.width || 0) + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    }
    await openRoute(page, '/#/watch');
    await expect(page.locator('.watch-page-head > .rule')).toBeHidden();

    await page.setViewportSize({ width: 926, height: 428 });
    for (const [route, target] of cases) {
      await openRoute(page, route);
      await expect(page.locator(target)).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(700);
      const gap = await page.evaluate((selector) => {
        const header = document.querySelector('.nav')!.getBoundingClientRect();
        const content = document.querySelector(selector)!.getBoundingClientRect();
        return Math.round(content.top - header.bottom);
      }, target);
      expect(gap, `${route} landscape page-start gap`).toBeGreaterThanOrEqual(16);
      expect(gap, `${route} landscape page-start gap`).toBeLessThanOrEqual(24);
    }
  });
});

test.describe('desktop destination rhythm', () => {
  test.use({ viewport: { width: 1024, height: 768 }, isMobile: false, hasTouch: false });

  test.skip(({ browserName }) => browserName === 'webkit', 'The configured WebKit project intentionally retains the iPhone device context.');

  test.beforeEach(async ({ page }) => {
    await seedStableDevice(page);
  });

  test('keeps desktop destination spacing and the Watch divider', async ({ page }) => {
    await openRoute(page, '/#/watch');
    await expect(page.locator('.watch-page-head > .rule')).toBeVisible();
    const watchPadding = await page.locator('.watch.page-top').evaluate((element) => parseFloat(getComputedStyle(element).paddingTop));
    expect(watchPadding).toBeGreaterThan(24);

    await openRoute(page, '/#/bar');
    const shelfPadding = await page.locator('#shelf.page-top').evaluate((element) => parseFloat(getComputedStyle(element).paddingTop));
    expect(shelfPadding).toBeGreaterThan(24);

    await openRoute(page, '/#/');
    const landingPadding = await page.locator('.landing-page').evaluate((element) => parseFloat(getComputedStyle(element).paddingTop));
    expect(landingPadding).toBe(40);
  });
});

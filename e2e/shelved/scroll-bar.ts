// Shelved with SpritzHero, FlavourCompass and BarStories on 13 November 2026.
import { test, expect, type Page } from '@playwright/test';
import { openRoute, seedStableDevice } from '../helpers';
import { installFakeYouTube } from '../fixtures/shortsFakeYouTube';

async function pourTo(page: Page, progress: number) {
  await page.locator('.spritz-hero').evaluate((el, p) => {
    const header = document.querySelector('.house-nav')!.getBoundingClientRect().height;
    const stage = el.querySelector<HTMLElement>('.spritz-stage')!;
    window.scrollTo({ top: scrollY + el.getBoundingClientRect().top - header + (el.clientHeight - stage.clientHeight) * p, behavior: 'instant' });
  }, progress);
}

test.beforeEach(async ({ page }) => { await seedStableDevice(page); });

test('builds and reverses the glass, reveals actions, and restores the same scroll on Back', async ({ page }, info) => {
  await openRoute(page, '/#/');
  await expect(page.locator('.spritz-hero')).toHaveAttribute('data-chapter', '0');
  await expect(page.locator('.spritz-actions-slot .landing-actions')).toBeHidden();
  await expect(page.getByRole('link', { name: 'Skip to drinks' })).toBeVisible();
  for (const [progress, chapter] of [[0, 0], [.23, 1], [.55, 2], [.76, 3], [.97, 4]]) {
    await pourTo(page, progress);
    await expect(page.locator('.spritz-hero')).toHaveAttribute('data-chapter', String(chapter));
    await page.waitForTimeout(270);
    await page.screenshot({ path: info.outputPath('hero-stage-' + chapter + '.png') });
  }
  await expect(page.locator('.spritz-actions-slot .landing-actions')).toBeVisible();
  const before = await page.evaluate(() => scrollY);
  await page.locator('.spritz-actions-slot a[href="#/bar"]').click();
  await expect(page.locator('#shelf')).toBeVisible();
  await page.goBack();
  await expect(page.locator('.spritz-hero')).toHaveAttribute('data-chapter', '4');
  await expect.poll(() => page.evaluate((y) => Math.abs(scrollY - y), before)).toBeLessThanOrEqual(3);
  await pourTo(page, .18);
  await expect(page.locator('.spritz-hero')).toHaveAttribute('data-chapter', '1');
  await expect(page.locator('.spritz-actions-slot .landing-actions')).toBeHidden();
  await page.getByRole('link', { name: 'Skip to drinks' }).click();
  await expect(page.locator('#menu-list')).toBeVisible();
});

test('fits each requested viewport and theme, including final hero actions', async ({ page }, info) => {
  test.setTimeout(90_000);
  await openRoute(page, '/#/');
  for (const width of [320, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width === 320 ? 700 : 900 });
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) {
        const toggle = page.locator('.house-theme');
        await expect(toggle).toHaveCount(1);
        await expect(toggle).toHaveAttribute('aria-label', 'Switch to ' + theme + ' theme');
        await toggle.click();
      }
      await pourTo(page, .96);
      await expect(page.locator('.spritz-hero')).toHaveAttribute('data-chapter', '4');
      const geometry = await page.evaluate(() => {
        const nav = document.querySelector('.house-nav')!.getBoundingClientRect();
        const bottom = document.querySelector<HTMLElement>('.house-mobile-links')!;
        const limit = getComputedStyle(bottom).display === 'none' ? innerHeight : bottom.getBoundingClientRect().top;
        const actions = document.querySelector('.spritz-actions-slot .landing-actions')!.getBoundingClientRect();
        const top = document.querySelector('.spritz-topline')!.getBoundingClientRect();
        return { overflow: document.documentElement.scrollWidth - innerWidth, actionsBottom: actions.bottom, limit, top: top.top, header: nav.bottom };
      });
      expect(geometry.overflow).toBeLessThanOrEqual(1);
      expect(geometry.actionsBottom).toBeLessThanOrEqual(geometry.limit + 1);
      expect(geometry.top).toBeGreaterThanOrEqual(geometry.header - 1);
      await page.mouse.move(0, 0);
      await page.waitForTimeout(350);
      await page.screenshot({ path: info.outputPath('hero-' + width + '-' + theme + '.png') });
      await page.locator('.flavour-compass').scrollIntoViewIfNeeded();
      for (const link of await page.locator('.compass-choice').all()) await expect(link).toBeVisible();
      await page.screenshot({ path: info.outputPath('compass-' + width + '-' + theme + '.png') });
    }
  }
  await page.setViewportSize({ width: 926, height: 428 });
  await pourTo(page, .96);
  await expect(page.locator('.spritz-actions-slot a').first()).toBeInViewport();
  await expect(page.locator('.spritz-actions-slot a').last()).toBeInViewport();
  await page.screenshot({ path: info.outputPath('hero-landscape.png') });
});

test('shows a finished static hero and paused media under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installFakeYouTube(page);
  await openRoute(page, '/#/');
  await expect(page.locator('.spritz-hero')).toHaveAttribute('data-chapter', '4');
  await expect(page.locator('.spritz-hero')).toHaveClass(/is-still/);
  await expect(page.locator('.spritz-actions-slot .landing-actions')).toBeVisible();
  await expect(page.locator('.landing-shorts-rail')).toHaveCount(0);
  await expect(page.locator('.landing-watch-rail')).toHaveCount(0);
  await expect(page.locator('.landing-atlas-entry')).toHaveAttribute('href', '#/atlas');
  await expect(page.locator('.landing-preview-player iframe')).toHaveCount(0);
  await expect(page.locator('.landing-short-card .landing-card-title')).toHaveCount(0);
  await expect(page.locator('.landing-preview-toggle')).toHaveCount(0);
});

test('each flavour choice opens its existing filter without a preliminary tap', async ({ page }) => {
  await openRoute(page, '/#/');
  for (const category of ['refreshing', 'boozy', 'tropical', 'sweet']) {
    await page.locator('.compass-choice[href*="' + category + '"]').click();
    await expect(page.locator('#menu-list')).toBeVisible();
    expect(new URL(page.url()).hash).toContain(encodeURIComponent('category:' + category));
    await page.goBack();
    await expect(page.locator('.flavour-compass')).toBeVisible();
  }
});

test('keeps all four sourced data stories readable and keyboard accessible', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRoute(page, '/#/');
  const tabs = page.getByRole('tablist', { name: 'Cocktail data stories' });
  await tabs.scrollIntoViewIfNeeded();
  await tabs.getByRole('tab', { name: /Rankings/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: /Recipes/ })).toBeFocused();
  await expect(page.getByRole('tabpanel')).toContainText('before ice and dilution');
  for (const label of ['Rankings', 'Recipes', 'Ingredients', 'Culture']) {
    await tabs.getByRole('tab', { name: new RegExp(label) }).click();
    await expect(tabs.getByRole('tab', { name: new RegExp(label) })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.waitForTimeout(350);
    await page.getByRole('tabpanel').screenshot({ path: info.outputPath('story-' + label.toLowerCase() + '.png') });
  }
  await expect(page.locator('.culture-timeline li')).toHaveCount(4);
  await page.locator('.culture-timeline').getByRole('link', { name: 'Vesper', exact: true }).click();
  await expect(page.locator('#menu-list .fc[data-recipe-id="17218"]')).toBeVisible();
  await page.goBack();
  await tabs.getByRole('tab', { name: /Ingredients/ }).click();
  await page.getByRole('button', { name: 'Gin', exact: true }).click();
  await expect(page.locator('.ingredient-hub')).toContainText('109');
  await expect(page.locator('.ingredient-node')).toHaveCount(8);
  const recipeName = await page.locator('.ingredient-node').first().locator('span').innerText();
  await page.locator('.ingredient-node').first().click();
  await expect(page.locator('#menu-list .fc').first()).toContainText(recipeName);
});

// The landing preview is paused; retain this scenario for when it is restored.
test.skip('the Shorts arrow opens the active preview and every arrow has a usable hit target', async ({ page }) => {
  await installFakeYouTube(page);
  await openRoute(page, '/#/');
  await page.locator('.landing-short-card').first().scrollIntoViewIfNeeded();
  await expect(page.locator('.landing-preview-player iframe')).toHaveCount(1);
  const id = await page.locator('.landing-short-card.is-previewing').getAttribute('data-preview-id');
  const arrow = page.getByRole('link', { name: 'Open Shorts', exact: true });
  await expect(arrow).toHaveAttribute('href', '#/shorts?v=' + id + '&src=landing');
  await expect(arrow).toHaveText('');
  for (const el of await page.locator('.landing-open').all()) {
    const box = await el.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await arrow.click();
  expect(new URL(page.url()).hash).toContain('v=' + id);
});

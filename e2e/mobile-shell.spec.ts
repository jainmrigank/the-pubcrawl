import { test, expect } from '@playwright/test';
import { navigateTo, openRoute, seedStableDevice } from './helpers';

test.describe('mobile shell and navigation', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await seedStableDevice(page);
  });

  test('portals one fixed nav with the required order', async ({ page }) => {
    await openRoute(page, '/#/menu');
    const nav = page.locator('body > .house-mobile-links');
    await expect(nav).toHaveCount(1);
    await expect(nav.locator('.house-nav-link > span:not([aria-hidden])')).toHaveText(['Drinks', 'Taste Map', 'Shelf', 'Tab', 'Explore+']);
    const box = await nav.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs((box?.y || 0) + (box?.height || 0) - 844)).toBeLessThanOrEqual(1);
    await expect(page.locator('.house-brand')).toBeVisible();
    await expect(page.locator('.house-theme')).toBeVisible();
    await expect(page.locator('.house-desktop-links')).toBeHidden();
  });

  test('keeps the nav attached while switching through Shorts and other routes', async ({ page }) => {
    await openRoute(page, '/#/menu');
    await navigateTo(page, 'Shorts');
    await expect(page.locator('html')).toHaveAttribute('data-route', 'shorts');
    await expect(page.locator('body > .house-mobile-links')).toBeVisible();
    await expect(page.locator('.shorts-feed')).toBeVisible({ timeout: 20_000 });
    await navigateTo(page, 'Watch');
    await expect(page.locator('html')).toHaveAttribute('data-route', 'watch');
    await page.getByRole('link', { name: 'Shelf', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-route', 'bar');
    await expect(page.locator('body > .house-mobile-links')).toBeVisible();
    await expect(page.locator('body').evaluate((body) => ({ overflow: body.style.overflow, overscroll: body.style.overscrollBehavior }))).resolves.toEqual({ overflow: '', overscroll: '' });
  });

  test('keeps the mobile shell on a touch phone in landscape', async ({ page }) => {
    await page.setViewportSize({ width: 926, height: 428 });
    await openRoute(page, '/#/menu');
    await expect(page.locator('.house-mobile-links')).toBeVisible();
    await expect(page.locator('.nav-menu-btn')).toBeHidden();
    await expect(page.locator('.drawer')).toHaveCount(0);
    const nav = page.locator('body > .house-mobile-links');
    await expect(nav.locator('.house-nav-link > span:not([aria-hidden])')).toHaveText(['Drinks', 'Taste Map', 'Shelf', 'Tab', 'Explore+']);
    const navBox = await nav.boundingBox();
    expect(navBox).not.toBeNull();
    expect(Math.abs((navBox?.y || 0) + (navBox?.height || 0) - 428)).toBeLessThanOrEqual(1);
    const media = await page.evaluate(() => ({
      coarse: window.matchMedia('(pointer: coarse)').matches,
      noHover: window.matchMedia('(hover: none)').matches,
    }));
    expect(media.coarse).toBe(true);
    expect(media.noHover).toBe(true);

    await navigateTo(page, 'Shorts');
    await expect(page.locator('html')).toHaveAttribute('data-route', 'shorts');
    await expect(page.locator('.shorts-route')).toBeVisible();
    await expect(page.locator('.house-mobile-links')).toBeVisible();
    await navigateTo(page, 'Watch');
    await expect(page.locator('html')).toHaveAttribute('data-route', 'watch');
    await expect(page.locator('.house-mobile-links')).toBeVisible();
  });

  test('keeps Watch cards inside balanced phone gutters after rotation', async ({ page }) => {
    for (const viewport of [{ width: 428, height: 926 }, { width: 926, height: 428 }]) {
      await page.setViewportSize(viewport);
      await openRoute(page, '/#/watch?src=nav');
      await expect(page.locator('.wv').first()).toBeVisible({ timeout: 20_000 });
      const geometry = await page.evaluate(() => {
        const content = document.querySelector('main')?.getBoundingClientRect();
        const cards = [...document.querySelectorAll<HTMLElement>('.watch .wv')]
          .slice(0, 6)
          .map((card) => {
            const rect = card.getBoundingClientRect();
            return { left: rect.left, right: rect.right };
          });
        return {
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          content: content ? { left: content.left, right: content.right } : null,
          cards,
        };
      });
      expect(geometry.content).not.toBeNull();
      for (const card of geometry.cards) {
        expect(card.left).toBeGreaterThanOrEqual((geometry.content?.left || 0) - 2);
        expect(card.right).toBeLessThanOrEqual((geometry.content?.right || viewport.width) + 2);
      }
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
    }
  });

  test('renders the dedicated landing discovery page without mounting Menu', async ({ page }) => {
    await openRoute(page, '/#/');
    await expect(page.locator('#menu-list:visible')).toHaveCount(0);
    await expect(page.locator('.home-opening')).toBeVisible();
    // Home keeps four useful visualisations; media previews remain paused.
    await expect(page.locator('.landing-shorts-rail')).toHaveCount(0);
    await expect(page.locator('.landing-watch-rail')).toHaveCount(0);
    await expect(page.locator('[data-home-story]')).toHaveCount(4);
    await expect(page.locator('[data-tour="landing-make"]')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse all drinks', exact: true })).toBeVisible();
  });
});

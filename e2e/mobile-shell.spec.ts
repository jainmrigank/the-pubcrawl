import { test, expect } from '@playwright/test';
import { openRoute, seedStableDevice } from './helpers';

test.describe('mobile shell and navigation', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await seedStableDevice(page);
  });

  test('portals one fixed nav with the required order', async ({ page }) => {
    await openRoute(page, '/#/menu');
    const nav = page.locator('body > .mobile-bottom-nav');
    await expect(nav).toHaveCount(1);
    await expect(nav.locator('.mobile-nav-item')).toHaveText(['Menu', 'Shelf', 'Shorts', 'Watch', 'Quiz']);
    const box = await nav.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs((box?.y || 0) + (box?.height || 0) - 844)).toBeLessThanOrEqual(1);
    await expect(page.locator('.nav-menu-btn')).toBeHidden();
    await expect(page.locator('.mobile-top-actions .mobile-theme-toggle')).toBeVisible();
    await expect(page.locator('.mobile-top-actions [aria-label="Bar Basics"]')).toBeVisible();
    await expect(page.locator('.mobile-top-actions [aria-label="Tab, 0 saved drinks"]')).toBeVisible();
  });

  test('keeps the nav attached while switching through Shorts and other routes', async ({ page }) => {
    await openRoute(page, '/#/menu');
    await page.getByRole('link', { name: 'Shorts' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-route', 'shorts');
    await expect(page.locator('body > .mobile-bottom-nav')).toBeVisible();
    await expect(page.locator('.shorts-feed')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('link', { name: 'Watch' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-route', 'watch');
    await page.getByRole('link', { name: 'Shelf', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-route', 'bar');
    await expect(page.locator('body > .mobile-bottom-nav')).toBeVisible();
    await expect(page.locator('body').evaluate((body) => ({ overflow: body.style.overflow, overscroll: body.style.overscrollBehavior }))).resolves.toEqual({ overflow: '', overscroll: '' });
  });

  test('keeps the mobile shell on a touch phone in landscape', async ({ page }) => {
    await page.setViewportSize({ width: 926, height: 428 });
    await openRoute(page, '/#/menu');
    await expect(page.locator('.mobile-bottom-nav')).toBeVisible();
    await expect(page.locator('.nav-menu-btn')).toBeHidden();
    await expect(page.locator('.drawer')).toHaveCount(0);
    const nav = page.locator('body > .mobile-bottom-nav');
    await expect(nav.locator('.mobile-nav-item')).toHaveText(['Menu', 'Shelf', 'Shorts', 'Watch', 'Quiz']);
    const navBox = await nav.boundingBox();
    expect(navBox).not.toBeNull();
    expect(Math.abs((navBox?.y || 0) + (navBox?.height || 0) - 428)).toBeLessThanOrEqual(1);
    const media = await page.evaluate(() => ({
      coarse: window.matchMedia('(pointer: coarse)').matches,
      noHover: window.matchMedia('(hover: none)').matches,
    }));
    expect(media.coarse).toBe(true);
    expect(media.noHover).toBe(true);

    await page.getByRole('link', { name: 'Shorts' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-route', 'shorts');
    await expect(page.locator('.shorts-route')).toBeVisible();
    await expect(page.locator('.mobile-bottom-nav')).toBeVisible();
    await page.getByRole('link', { name: 'Watch' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-route', 'watch');
    await expect(page.locator('.mobile-bottom-nav')).toBeVisible();
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
    await expect(page.locator('.landing-hero')).toBeVisible();
    await expect(page.locator('.landing-shorts-rail')).toBeVisible();
    await expect(page.locator('.landing-watch-rail')).toBeVisible();
    await expect(page.getByRole('link', { name: /WHAT CAN I MAKE/ })).toBeVisible();
  });
});

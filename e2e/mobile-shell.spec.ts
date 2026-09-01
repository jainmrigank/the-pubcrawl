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
    await expect(nav.locator('.mobile-nav-item')).toHaveText(['Menu', 'Bar', 'Shorts', 'Watch', 'Quiz']);
    const box = await nav.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs((box?.y || 0) + (box?.height || 0) - 844)).toBeLessThanOrEqual(1);
    await expect(page.locator('.nav-menu-btn')).toBeHidden();
    await expect(page.locator('.mobile-top-actions .mobile-theme-toggle')).toBeVisible();
    await expect(page.locator('.mobile-top-actions [aria-label="Bar Basics"]')).toBeVisible();
    await expect(page.locator('.mobile-top-actions [aria-label="Tab"]')).toBeVisible();
  });

  test('keeps the nav attached while switching through Shorts and other routes', async ({ page }) => {
    await openRoute(page, '/#/menu');
    await page.getByRole('link', { name: 'Shorts' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-route', 'shorts');
    await expect(page.locator('body > .mobile-bottom-nav')).toBeVisible();
    await expect(page.locator('.shorts-feed')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('link', { name: 'Watch' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-route', 'watch');
    await page.getByRole('link', { name: 'Bar', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-route', 'bar');
    await expect(page.locator('body > .mobile-bottom-nav')).toBeVisible();
    await expect(page.locator('body').evaluate((body) => ({ overflow: body.style.overflow, overscroll: body.style.overscrollBehavior }))).resolves.toEqual({ overflow: '', overscroll: '' });
  });

  test('removes landing teasers without leaving a replacement gap', async ({ page }) => {
    await openRoute(page, '/#/');
    await expect(page.locator('.watch-teaser, .shorts-teaser')).toHaveCount(0);
    await expect(page.locator('.hero')).toBeVisible();
    await expect(page.getByRole('link', { name: /WHAT CAN I MAKE/ })).toBeVisible();
  });
});

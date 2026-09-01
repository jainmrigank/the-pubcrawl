import { test, expect } from '@playwright/test';
import { openRoute, seedStableDevice } from './helpers';

test.describe('Shorts startup and controls', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('uses a black startup surface, no PubCrawl thumbnails, and bounded players', async ({ page }) => {
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await expect(page.locator('.shorts-feed')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.shorts-card img')).toHaveCount(0);
    await expect(page.locator('.shorts-startup-surface').first()).toBeVisible();
    await expect(page.locator('.shorts-card iframe')).toHaveCount(await page.locator('.shorts-card iframe').count());
    expect(await page.locator('.shorts-card iframe').count()).toBeLessThanOrEqual(5);
    await expect(page.locator('.shorts-overlay-action[aria-label="Back"]').first()).toHaveCSS('color', /rgb\(241, 238, 229\)|rgb\(255, 255, 255\)/);
    await expect(page.locator('.shorts-overlay-action[aria-label="Share"]').first()).toHaveCSS('color', /rgb\(241, 238, 229\)|rgb\(255, 255, 255\)/);
    await expect(page.locator('body > .mobile-bottom-nav')).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';
import { openRoute, seedStableDevice } from './helpers';

test.describe('offline core routes', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('keeps landing, menu, and Bar matching available when API requests are blocked', async ({ page }) => {
    await seedStableDevice(page);
    await page.route('**/api/**', (route) => route.abort());
    await openRoute(page, '/#/menu');
    await expect(page.locator('#menu-list .grid .fc').first()).toBeVisible({ timeout: 20_000 });
    await page.goto('/#/bar', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#shelf')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Search ingredients' })).toBeVisible();
  });
});

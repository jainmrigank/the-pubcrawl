import { test, expect } from '@playwright/test';
import { openRoute, seedStableDevice } from './helpers';

test.describe('contextual tours', () => {
  test.use({ viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true });

  test('runs the Bar tour once, keeps Skip on every step, and supports replay', async ({ page }) => {
    await seedStableDevice(page);
    await page.addInitScript(() => {
      localStorage.removeItem('pubcrawl.tour.bar.v1');
    });
    await openRoute(page, '/#/bar');
    const tour = page.locator('.guided-tour[role="dialog"]');
    await expect(tour).toBeVisible({ timeout: 3_000 });
    await expect(tour.getByRole('button', { name: 'SKIP' })).toBeVisible();
    const box = await tour.locator('.guided-tour-popover').boundingBox();
    expect(box).not.toBeNull();
    expect((box?.x || 0) + (box?.width || 0)).toBeLessThanOrEqual(320);
    await tour.getByRole('button', { name: 'NEXT' }).click();
    await expect(tour.getByRole('button', { name: 'SKIP' })).toBeVisible();
    await tour.getByRole('button', { name: 'SKIP' }).click();
    await expect(tour).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('pubcrawl.tour.bar.v1'))).toBe('skipped');
    await page.getByRole('button', { name: 'SHOW ME HOW' }).click();
    await expect(tour).toBeVisible();
    await expect(tour.locator('.guided-tour-arrow')).toBeVisible();
  });

  test('does not stack a tour with the Daily Question dialog', async ({ page }) => {
    await seedStableDevice(page, { daily: false });
    await page.addInitScript(() => localStorage.removeItem('pubcrawl.tour.bar.v1'));
    await openRoute(page, '/#/quiz?daily=1');
    await expect(page.locator('.daily[role="dialog"]')).toBeVisible();
    await page.goto('/#/bar', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(1);
  });
});

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
    await page.getByRole('button', { name: 'Show Bar tutorial' }).click();
    await expect(tour).toBeVisible();
    await expect(tour.locator('.guided-tour-arrow')).toBeVisible();
  });

  test('auto-runs every page tour independently and remembers Skip', async ({ page }) => {
    await seedStableDevice(page, { tours: false });
    const contexts = [
      { id: 'landing', route: '/' },
      { id: 'menu', route: '/#/menu' },
      { id: 'bar', route: '/#/bar' },
      { id: 'basics', route: '/#/basics' },
      { id: 'tab', route: '/#/tab' },
      { id: 'quiz', route: '/#/quiz' },
      { id: 'watch', route: '/#/watch' },
      { id: 'shorts', route: '/#/shorts' },
    ];

    for (const context of contexts) {
      await openRoute(page, context.route);
      const tour = page.locator('.guided-tour[role="dialog"]');
      await expect(tour).toBeVisible({ timeout: 4_000 });
      await expect(tour.getByRole('button', { name: 'SKIP' })).toBeVisible();
      await tour.getByRole('button', { name: 'SKIP' }).click();
      await expect.poll(() => page.evaluate((id) => localStorage.getItem(`pubcrawl.tour.${id}.v1`), context.id)).toBe('skipped');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(850);
      await expect(tour).toHaveCount(0);
    }
  });

  test('renders exactly one route-aware Help action and replays completed tours', async ({ page }) => {
    await seedStableDevice(page);
    const routes = [
      { label: 'landing page', route: '/' },
      { label: 'Menu', route: '/#/menu' },
      { label: 'Bar', route: '/#/bar' },
      { label: 'Bar Basics', route: '/#/basics' },
      { label: 'Tab', route: '/#/tab' },
      { label: 'Quiz', route: '/#/quiz' },
      { label: 'Watch', route: '/#/watch' },
      { label: 'Shorts', route: '/#/shorts' },
    ];

    for (const context of routes) {
      await openRoute(page, context.route);
      const help = page.locator('button.contextual-help:visible');
      await expect(help).toHaveCount(1);
      await expect(help).toHaveAttribute('aria-label', `Show ${context.label} tutorial`);
      const box = await help.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
      await help.click();
      const tour = page.locator('.guided-tour[role="dialog"]');
      await expect(tour).toBeVisible({ timeout: 4_000 });
      await tour.getByRole('button', { name: 'SKIP' }).click();
    }
  });

  test('does not stack a tour with the Daily Question dialog', async ({ page }) => {
    await seedStableDevice(page, { daily: false });
    await page.addInitScript(() => localStorage.removeItem('pubcrawl.tour.bar.v1'));
    await openRoute(page, '/#/quiz?daily=1');
    await expect(page.locator('.daily[role="dialog"]')).toBeVisible();
    await page.goto('/#/bar', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(1);
  });

  test('does not mark an empty Tab tutorial complete when optional anchors are unavailable', async ({ page }) => {
    await seedStableDevice(page, { tours: false });
    await page.addInitScript(() => {
      localStorage.setItem('pubcrawl.tab', '[]');
      localStorage.removeItem('pubcrawl.tour.tab.v1');
    });
    await openRoute(page, '/#/tab');
    const tour = page.locator('.guided-tour[role="dialog"]');
    await expect(tour).toBeVisible({ timeout: 4_000 });
    await tour.getByRole('button', { name: 'NEXT' }).click();
    await expect(tour).toHaveCount(0, { timeout: 2_000 });
    await expect.poll(() => page.evaluate(() => localStorage.getItem('pubcrawl.tour.tab.v1'))).toBeNull();
  });
});

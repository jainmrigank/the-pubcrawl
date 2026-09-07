import { test, expect } from '@playwright/test';
import { openRoute, seedStableDevice } from './helpers';

test.describe('iPhone WebKit shell regression', () => {
  test.beforeEach(async ({ page }) => {
    await seedStableDevice(page);
  });

  test('keeps the mobile shell in portrait and landscape', async ({ page }) => {
    await page.setViewportSize({ width: 428, height: 926 });
    await openRoute(page, '/#/menu');
    const nav = page.locator('body > .mobile-bottom-nav');
    await expect(nav).toBeVisible();
    await expect(page.locator('.nav-menu-btn')).toBeHidden();
    await expect(nav.locator('.mobile-nav-item')).toHaveText(['Menu', 'Shelf', 'Shorts', 'Watch', 'Quiz']);

    await page.setViewportSize({ width: 926, height: 428 });
    await expect(nav).toBeVisible();
    await expect(page.locator('.nav-menu-btn')).toBeHidden();
    const landscapeBox = await nav.boundingBox();
    expect(landscapeBox).not.toBeNull();
    expect(Math.abs((landscapeBox?.y || 0) + (landscapeBox?.height || 0) - 428)).toBeLessThanOrEqual(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    await page.getByRole('link', { name: 'Shorts' }).click();
    await expect(page.locator('.shorts-feed')).toBeVisible({ timeout: 20_000 });
    await expect(nav).toBeVisible();
    await page.getByRole('link', { name: 'Watch' }).click();
    await expect(page.locator('.watch')).toBeVisible({ timeout: 20_000 });
    await expect(nav).toBeVisible();
  });

  test('keeps Watch cards within balanced gutters after rotation', async ({ page }) => {
    for (const viewport of [{ width: 428, height: 926 }, { width: 926, height: 428 }]) {
      await page.setViewportSize(viewport);
      await openRoute(page, '/#/watch?src=nav');
      await expect(page.locator('.wv').first()).toBeVisible({ timeout: 20_000 });
      const geometry = await page.evaluate(() => {
        const content = document.querySelector('main')?.getBoundingClientRect();
        const cards = [...document.querySelectorAll<HTMLElement>('.watch .wv')].slice(0, 6).map((card) => {
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
});

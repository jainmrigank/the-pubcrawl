import { test, expect } from '@playwright/test';
import { openRoute, seedStableDevice } from './helpers';

test.describe('responsive controls', () => {
  test.beforeEach(async ({ page }) => {
    await seedStableDevice(page);
  });

  test('phone uses the compact category select and icon-only header actions', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 });
    await openRoute(page, '/#/menu');
    await expect(page.locator('.category-filter-select')).toBeVisible();
    await expect(page.locator('.vibe-pills')).toBeHidden();
    await expect(page.locator('.mobile-bottom-nav')).toBeVisible();
    expect((await page.locator('.mobile-theme-toggle').textContent())?.trim()).toBe('');
    await expect(page.locator('.mobile-secondary-action')).toHaveCount(2);
    await expect(page.locator('.mobile-secondary-action').first()).toHaveAttribute('aria-label', 'Bar Basics');
    await expect(page.locator('.mobile-secondary-action').nth(1)).toHaveAttribute('aria-label', 'Tab');
  });

  test('tablet keeps category pills while retaining bottom navigation', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await openRoute(page, '/#/menu');
    await expect(page.locator('.category-filter-select')).toBeHidden();
    await expect(page.locator('.vibe-pills')).toBeVisible();
    await expect(page.locator('.mobile-bottom-nav')).toBeVisible();
  });

  test('compact desktop keeps the desktop menu affordance and hides mobile navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await openRoute(page, '/#/menu');
    await expect(page.locator('.mobile-bottom-nav')).toBeHidden();
    await expect(page.locator('.nav-menu-btn')).toBeVisible();
    await expect(page.locator('.nav-links')).toBeHidden();
  });

  test('wide desktop keeps full route links and no hamburger', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRoute(page, '/#/menu');
    await expect(page.locator('.mobile-bottom-nav')).toBeHidden();
    await expect(page.locator('.nav-menu-btn')).toBeHidden();
    await expect(page.locator('.nav-links')).toBeVisible();
    await expect(page.locator('.desktop-theme-toggle')).toBeVisible();
  });
});

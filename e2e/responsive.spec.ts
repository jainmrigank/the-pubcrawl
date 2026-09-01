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

  test('keeps install instructions readable on the inverse banner in dark mode', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('pubcrawl.installDismissed'));
    await page.setViewportSize({ width: 390, height: 844 });
    await openRoute(page, '/#/menu');
    const banner = page.locator('.install-banner');
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: 'HOW TO INSTALL' }).click();
    await expect(banner.locator('.ib-steps')).toBeVisible();
    const colors = await banner.evaluate((element) => {
      const style = getComputedStyle(element);
      const steps = element.querySelector('.ib-steps');
      return {
        background: style.backgroundColor,
        color: style.color,
        stepsColor: steps ? getComputedStyle(steps).color : '',
      };
    });
    expect(colors.background).toBe('rgb(20, 19, 16)');
    expect(colors.color).toBe('rgb(241, 238, 229)');
    expect(colors.stepsColor).toContain('rgba(241, 238, 229');
    await expect(banner.getByRole('button', { name: 'Dismiss' })).toBeVisible();
  });
});

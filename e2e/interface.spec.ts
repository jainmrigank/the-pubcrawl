import { test, expect } from '@playwright/test';
import { openRoute, seedStableDevice, useDrinksList } from './helpers';

test.describe('minimal interface', () => {
  test.beforeEach(async ({ page }) => { await seedStableDevice(page); });

  test('keeps the wordmark, theme and Help readable in both themes', async ({ page }) => {
    await openRoute(page, '/#/menu');
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      for (const theme of ['dark', 'light']) {
        const toggle = page.locator('.house-theme');
        if (await page.locator('html').getAttribute('data-theme') !== theme) await toggle.click();
        const expectedIcon = theme === 'dark' ? 'sun' : 'moon';
        const hiddenIcon = theme === 'dark' ? 'moon' : 'sun';
        const expectedName = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
        const visibleGlyph = toggle.locator(`[data-icon="${expectedIcon}"]`);
        await expect(visibleGlyph).toBeVisible();
        await expect.poll(() => visibleGlyph.evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
        await expect.poll(() => toggle.locator(`[data-icon="${hiddenIcon}"]`).evaluate((element) => getComputedStyle(element).opacity)).toBe('0');
        await expect(toggle).toHaveAttribute('aria-label', expectedName);
        const glyph = await visibleGlyph.boundingBox();
        expect(glyph?.width).toBeCloseTo(20, 3);
        expect(glyph?.height).toBeCloseTo(20, 3);
        await expect(page.locator('.house-brand')).toBeVisible();
        await expect(page.locator('.house-nav-utilities > *')).toHaveCount(2);
        const boxes = await page.locator('.house-nav-utilities > *').evaluateAll(elements => elements.map(element => {
          const b = element.getBoundingClientRect();
          return { left: b.left, right: b.right, width: b.width, height: b.height };
        }));
        expect(boxes.every(b => b.width >= 44 && b.height >= 44 && b.left >= 0 && b.right <= width)).toBe(true);
        expect(boxes.every((b, i) => i === 0 || b.left >= boxes[i - 1].right)).toBe(true);
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    const desktopToggle = page.locator('.house-theme');
    await expect(desktopToggle).toHaveAttribute('aria-label', 'Switch to dark theme');
    await expect.poll(() => desktopToggle.locator('[data-icon="moon"]').evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
    await desktopToggle.click();
    await expect(desktopToggle).toHaveAttribute('aria-label', 'Switch to light theme');
    await expect.poll(() => desktopToggle.locator('[data-icon="sun"]').evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
  });

  test('clipboard count updates for add, remove, clear, and restored saved drinks', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openRoute(page, '/#/menu');
    await useDrinksList(page);
    const tab = page.locator('.house-mobile-links a[href="#/tab"]');
    await expect(tab).toHaveAttribute('aria-label', 'Tab, 0 saved drinks');
    await expect(tab.locator('.house-tab-count')).toHaveCount(0);
    const first = page.locator('#menu-list .fc').first();
    await first.locator('.front').getByRole('button', { name: 'Put it on my Tab', exact: true }).click();
    await expect(tab).toHaveAttribute('aria-label', 'Tab, 1 saved drink');
    await expect(tab.locator('.house-tab-count')).toHaveText('1');
    await expect(tab.locator('.house-tab-count')).toHaveAttribute('aria-hidden', 'true');
    await first.locator('.front').getByRole('button', { name: 'On my Tab. Tap to remove', exact: true }).click();
    await expect(tab.locator('.house-tab-count')).toHaveCount(0);
    await first.locator('.front').getByRole('button', { name: 'Put it on my Tab', exact: true }).click();
    await page.locator('#menu-list .fc').nth(1).locator('.front').getByRole('button', { name: 'Put it on my Tab', exact: true }).click();
    await expect(tab.locator('.house-tab-count')).toHaveText('2');
    await page.reload();
    await expect(tab).toHaveAttribute('aria-label', 'Tab, 2 saved drinks');
    await expect(tab.locator('.house-tab-count')).toHaveText('2');
    const contained = await tab.evaluate(element => {
      const a = element.getBoundingClientRect(), b = element.querySelector('.house-tab-count')!.getBoundingClientRect();
      return b.left >= a.left && b.right <= a.right && b.top >= a.top && b.bottom <= a.bottom;
    });
    expect(contained).toBe(true);
    await tab.click();
    await page.getByRole('button', { name: 'Clear the Tab', exact: true }).click();
    await expect(tab).toHaveAttribute('aria-label', 'Tab, 0 saved drinks');
    await expect(tab.locator('.house-tab-count')).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pubcrawl.tab') || '[]'))).toEqual([]);
  });

  test('removes only the requested page introductions and keeps route compatibility', async ({ page }) => {
    await openRoute(page, '/');
    await expect(page.locator('.home-opening h1')).toContainText('poison');
    await expect(page.locator('.hero-sub')).toHaveCount(0);
    for (const [route, selector] of [['menu', '#menu-list'], ['bar', '#shelf'], ['quiz', '#quiz-page'], ['watch', '.watch']]) {
      await openRoute(page, `/#/${route}`);
      await expect(page.locator(selector)).toBeVisible();
      await expect(page.locator(`${selector} .sec-lead`)).toHaveCount(0);
    }
    await openRoute(page, '/#/bar');
    await expect(page.locator('#shelf .sec-title')).toHaveText('My Shelf');
    await expect(page.locator('html')).toHaveAttribute('data-route', 'bar');
    await expect(page.getByText('BEST MATCHES FIRST · USES WHAT’S ON YOUR SHELF')).toHaveCount(0);
    await expect(page.locator('#pour')).toHaveCount(0);
  });
});

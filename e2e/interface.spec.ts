import { test, expect } from '@playwright/test';
import { openRoute, seedStableDevice } from './helpers';

test.describe('minimal interface', () => {
  test.beforeEach(async ({ page }) => { await seedStableDevice(page); });

  test('uses the requested glyphs and keeps four accessible header actions in both themes', async ({ page }) => {
    await openRoute(page, '/#/menu');
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      for (const theme of ['dark', 'light']) {
        const toggle = page.locator('.mobile-theme-toggle');
        if (await page.locator('html').getAttribute('data-theme') !== theme) await toggle.click();
        await expect(toggle.locator('[data-icon="sun"]')).toHaveCount(1);
        await expect(page.getByRole('link', { name: 'Bar Basics', exact: true }).locator('[data-icon="bookmark-book"]')).toHaveCount(1);
        await expect(page.locator('.tab-action [data-icon="clipboard"]')).toHaveCount(1);
        await expect(page.locator('.mobile-top-actions > *')).toHaveCount(4);
        await expect(page.locator('.nav .wordmark')).toBeHidden();
        const boxes = await page.locator('.mobile-top-actions > *').evaluateAll(elements => elements.map(element => {
          const b = element.getBoundingClientRect();
          return { left: b.left, right: b.right, width: b.width, height: b.height };
        }));
        expect(boxes.every(b => b.width >= 44 && b.height >= 44 && b.left >= 0 && b.right <= width)).toBe(true);
        expect(boxes.every((b, i) => i === 0 || b.left >= boxes[i - 1].right)).toBe(true);
      }
    }
  });

  test('clipboard count updates for add, remove, clear, and restored saved drinks', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openRoute(page, '/#/menu');
    const tab = page.locator('.tab-action');
    await expect(tab).toHaveAttribute('aria-label', 'Tab, 0 saved drinks');
    await expect(tab.locator('.tab-badge')).toHaveCount(0);
    const first = page.locator('#menu-list .fc').first();
    await first.locator('.front').getByRole('button', { name: 'PUT IT ON MY TAB', exact: true }).click();
    await expect(tab).toHaveAttribute('aria-label', 'Tab, 1 saved drink');
    await expect(tab.locator('.tab-badge')).toHaveText('1');
    await expect(tab.locator('.tab-badge')).toHaveAttribute('aria-hidden', 'true');
    await first.locator('.front').getByRole('button', { name: 'ON MY TAB. TAP TO REMOVE', exact: true }).click();
    await expect(tab.locator('.tab-badge')).toHaveCount(0);
    await first.locator('.front').getByRole('button', { name: 'PUT IT ON MY TAB', exact: true }).click();
    await page.locator('#menu-list .fc').nth(1).locator('.front').getByRole('button', { name: 'PUT IT ON MY TAB', exact: true }).click();
    await expect(tab.locator('.tab-badge')).toHaveText('2');
    await page.reload();
    await expect(tab).toHaveAttribute('aria-label', 'Tab, 2 saved drinks');
    await expect(tab.locator('.tab-badge')).toHaveText('2');
    const contained = await tab.evaluate(element => {
      const a = element.getBoundingClientRect(), b = element.querySelector('.tab-badge')!.getBoundingClientRect();
      return b.left >= a.left && b.right <= a.right && b.top >= a.top && b.bottom <= a.bottom;
    });
    expect(contained).toBe(true);
    await tab.click();
    await page.getByRole('button', { name: 'CLEAR THE TAB', exact: true }).click();
    await expect(tab).toHaveAttribute('aria-label', 'Tab, 0 saved drinks');
    await expect(tab.locator('.tab-badge')).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pubcrawl.tab') || '[]'))).toEqual([]);
  });

  test('removes only the requested page introductions and keeps route compatibility', async ({ page }) => {
    await openRoute(page, '/');
    await expect(page.locator('.landing-title')).toContainText('POISON');
    await expect(page.locator('.hero-sub')).toHaveCount(0);
    for (const [route, selector] of [['menu', '#menu-list'], ['bar', '#shelf'], ['quiz', '#quiz-page'], ['watch', '.watch']]) {
      await openRoute(page, `/#/${route}`);
      await expect(page.locator(selector)).toBeVisible();
      await expect(page.locator(`${selector} .sec-lead`)).toHaveCount(0);
    }
    await openRoute(page, '/#/bar');
    await expect(page.locator('#shelf .sec-title')).toHaveText('SHELF');
    await expect(page.locator('html')).toHaveAttribute('data-route', 'bar');
    await expect(page.getByText('BEST MATCHES FIRST · USES WHAT’S ON YOUR SHELF')).toHaveCount(0);
    await expect(page.locator('#pour')).toHaveCount(0);
  });
});

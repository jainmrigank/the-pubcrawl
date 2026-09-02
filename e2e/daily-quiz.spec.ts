import { test, expect } from '@playwright/test';
import { openRoute, seedStableDevice } from './helpers';

test.describe('Daily Question and Quiz', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('lays daily answers out as readable content-height rows', async ({ page }) => {
    await seedStableDevice(page, { daily: false });
    await openRoute(page, '/#/quiz?daily=1');
    const dialog = page.locator('.daily[role="dialog"]');
    await expect(dialog).toBeVisible();
    const options = dialog.locator('.quiz-opt');
    await expect(options).toHaveCount(4);
    const boxes = await options.evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
    }));
    expect(boxes.every((box) => box.right - box.left > 300)).toBe(true);
    expect(boxes.every((box, index) => index === 0 || box.top >= boxes[index - 1].bottom - 1)).toBe(true);
    await expect(dialog.locator('button', { hasText: 'SKIP FOR TODAY' })).toBeVisible();
  });

  test('keeps unanswered quiz options neutral and exposes keyboard focus', async ({ page }) => {
    await seedStableDevice(page);
    await openRoute(page, '/#/quiz');
    await page.getByRole('button', { name: /START THE ROUND/ }).click();
    const options = page.locator('.quiz-card .quiz-opt');
    await expect(options.first()).toBeVisible();
    const classes = await options.evaluateAll((elements) => elements.map((element) => element.className));
    expect(classes.every((className) => !/right|wrong|muted/.test(className))).toBe(true);
    for (let index = 0; index < 8; index += 1) {
      await page.keyboard.press('Tab');
      if (await options.first().evaluate((element) => document.activeElement === element)) break;
    }
    await expect(options.first()).toBeFocused();
    const outline = await options.first().evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(outline).not.toBe('none');
  });

  test('shows an unverified House Record as an em dash, then shows the confirmed value', async ({ page }) => {
    await seedStableDevice(page);
    await page.route('**/api/quiz/high', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 350));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ score: 19, at: 1, hall: [], bank: 352 }),
      });
    });
    await openRoute(page, '/#/quiz');
    const record = page.locator('.quiz-high');
    await expect(record.locator('b')).toHaveText('—');
    await expect(record.locator('b')).toHaveText('19', { timeout: 2_000 });
  });

  test('distinguishes a legitimate zero record from a failed record request', async ({ page }) => {
    await seedStableDevice(page);
    await page.route('**/api/quiz/high', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ score: 0, at: 0, hall: [], bank: 352 }),
    }));
    await openRoute(page, '/#/quiz');
    await expect(page.locator('.quiz-high b')).toHaveText('0');

    await page.unroute('**/api/quiz/high');
    await page.route('**/api/quiz/high', (route) => route.abort('failed'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.quiz-high b')).toHaveText('—');
  });
});

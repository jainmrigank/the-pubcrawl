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
});

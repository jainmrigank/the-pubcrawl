import { test, expect } from '@playwright/test';
import { openRoute, seedStableDevice } from './helpers';

test.describe('responsive controls', () => {
  test.beforeEach(async ({ page }) => {
    await seedStableDevice(page);
  });

  test('phone keeps search primary and category controls behind More filters', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 });
    await openRoute(page, '/#/menu');
    await expect(page.locator('.category-filter-select')).toHaveCount(0);
    await page.getByRole('button', { name: 'More filters' }).click();
    await expect(page.locator('.category-filter-select')).toBeVisible();
    expect(await page.locator('.category-filter-select').evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
    await expect(page.locator('.vibe-pills')).toBeHidden();
    await expect(page.locator('.house-mobile-links')).toBeVisible();
    await expect(page.locator('.house-brand')).toBeVisible();
    await expect(page.locator('button.contextual-help:visible')).toHaveAttribute('aria-label', 'Show Drinks tutorial');
    for (const width of [430, 390, 320]) {
      await page.setViewportSize({ width, height: width === 320 ? 700 : 844 });
      const overflow = await page.locator('.house-nav').evaluate(element => element.scrollWidth - element.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      const targets = await page.locator('.house-nav-utilities > *, .house-mobile-links > *').evaluateAll(elements => elements.map(element => {
        const box = element.getBoundingClientRect();
        return { width: box.width, height: box.height };
      }));
      expect(targets.every(box => box.width >= 44 && box.height >= 44)).toBe(true);
    }
    await openRoute(page, '/#/watch');
    await expect(page.locator('.wv-kind-select')).toBeVisible();
    expect(await page.locator('.wv-kind-select').evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  });

  test('tablet keeps category pills behind More filters and retains bottom navigation', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await openRoute(page, '/#/menu');
    await page.getByRole('button', { name: 'More filters' }).click();
    await expect(page.locator('.category-filter-select')).toBeHidden();
    await expect(page.locator('.vibe-pills')).toBeVisible();
    await expect(page.locator('.house-mobile-links')).toBeVisible();
  });

  for (const width of [1024, 1440]) test(`desktop ${width} keeps complete primary navigation and an Explore menu`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openRoute(page, '/#/menu');
    await expect(page.locator('.house-mobile-links')).toBeHidden();
    const nav = page.locator('.house-desktop-links');
    await expect(nav).toBeVisible();
    await expect(nav.locator('.house-nav-link')).toHaveText(['Drinks', 'Taste Map', 'Shelf', 'Tab', 'Explore+']);
    await expect(page.locator('.house-theme')).toBeVisible();
    await expect(page.locator('.house-brand')).toContainText('PubCrawl');
    await nav.getByRole('button', { name: 'Explore' }).click();
    await expect(page.getByRole('dialog').getByRole('link')).toHaveCount(4);
    await page.keyboard.press('Escape');
    await expect(nav.getByRole('button', { name: 'Explore' })).toBeFocused();
  });

  test('centers Watch Show More independently of its changing result count', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRoute(page, '/#/watch');
    const watch = page.locator('.watch');
    const button = page.getByRole('button', { name: 'Show more' });
    await expect(button).toBeVisible();
    const centerDelta = async () => {
      const [containerBox, buttonBox] = await Promise.all([watch.boundingBox(), button.boundingBox()]);
      if (!containerBox || !buttonBox) throw new Error('Watch geometry unavailable');
      return Math.abs((containerBox.x + containerBox.width / 2) - (buttonBox.x + buttonBox.width / 2));
    };
    expect(await centerDelta()).toBeLessThanOrEqual(2);
    const before = await page.locator('.wv-more > .k-label').textContent();
    await button.click();
    await expect(page.locator('.wv-more > .k-label')).not.toHaveText(before || '');
    expect(await centerDelta()).toBeLessThanOrEqual(2);

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await centerDelta()).toBeLessThanOrEqual(2);
    const mobileLayout = await page.locator('.wv-more').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(mobileLayout).toBe(1);
  });

  test('uses plain destination names while preserving existing routes', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRoute(page, '/#/menu');
    await expect(page.locator('.house-desktop-links a[href="#/bar"]')).toHaveText('Shelf');
    await expect(page.locator('#menu-list .sec-title')).toHaveText('Find a drink you’ll like.');
    await openRoute(page, '/#/tab');
    await expect(page.locator('#tab-page .sec-title')).toHaveText('Your Tab');
    await openRoute(page, '/#/quiz');
    await expect(page.locator('.quiz-eyebrow')).toHaveText('Pub Quiz');
  });

  test('keeps install instructions readable on the inverse banner in dark mode', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('pubcrawl.installDismissed'));
    await page.setViewportSize({ width: 390, height: 844 });
    await openRoute(page, '/#/menu');
    const banner = page.locator('.install-banner');
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: 'How to install' }).click();
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

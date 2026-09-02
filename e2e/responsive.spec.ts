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
    await expect(page.locator('.mobile-top-actions > *')).toHaveCount(4);
    await expect(page.locator('button.contextual-help:visible')).toHaveCount(1);
    await expect(page.locator('button.contextual-help:visible')).toHaveAttribute('aria-label', 'Show Menu tutorial');
    await expect(page.locator('.nav .wordmark')).toBeHidden();
    for (const width of [430, 390, 320]) {
      await page.setViewportSize({ width, height: width === 320 ? 700 : 844 });
      await expect(page.locator('.mobile-top-actions > *')).toHaveCount(4);
      const headerOverflow = await page.locator('.nav').evaluate((element) => element.scrollWidth - element.clientWidth);
      expect(headerOverflow).toBeLessThanOrEqual(1);
      const targets = await page.locator('.mobile-top-actions > *').evaluateAll((elements) => elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { width: box.width, height: box.height };
      }));
      expect(targets.every((box) => box.width >= 44 && box.height >= 44)).toBe(true);
    }
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
    await expect(page.locator('.nav .wordmark')).toHaveText('The PubCrawl');
    await expect(page.locator('button.contextual-help:visible')).toHaveCount(1);
    await expect(page.locator('button.contextual-help:visible')).toHaveAttribute('aria-label', 'Show Menu tutorial');
  });

  test('centers Watch Show More independently of its changing result count', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRoute(page, '/#/watch');
    const watch = page.locator('.watch');
    const button = page.getByRole('button', { name: 'SHOW MORE' });
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

  test('uses concise page names while preserving the PubCrawl brand', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRoute(page, '/#/menu');
    await expect(page.locator('.nav-links')).toContainText('MENU');
    await expect(page.locator('.nav-links')).toContainText('BAR');
    await expect(page.locator('.nav-links')).toContainText('TAB');
    await expect(page.locator('.nav .wordmark')).toHaveText('The PubCrawl');
    await expect(page.locator('#menu-list .sec-title')).toHaveText('MENU');
    await expect(page.locator('#menu-list .sec-title')).not.toHaveText('THE MENU');

    await openRoute(page, '/#/tab');
    await expect(page.locator('#tab-page .sec-title')).toHaveText('TAB');
    await openRoute(page, '/#/quiz');
    await expect(page.locator('.quiz-eyebrow')).toHaveText('PUB QUIZ');
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

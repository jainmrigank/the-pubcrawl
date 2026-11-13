import { test, expect } from '@playwright/test';
import { openRoute, seedStableDevice } from './helpers';

// A deterministic image fixture verifies photo layout independently of a CDN.
const photo = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#e4e0d4"/><path d="M170 270H430L415 600H185Z" fill="#e67635"/><path d="M160 220H440L420 640H180Z" fill="none" stroke="#161512" stroke-width="3"/></svg>';

// Image fixtures must reach routing; the production SW deliberately caches
// successful photos and can serve one even after a later network failure.
test.use({ serviceWorkers: 'block' });

test.beforeEach(async ({ page }) => {
  await seedStableDevice(page);
  await page.route('https://upload.wikimedia.org/**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: photo }));
});

test('shows the same whole photo at every width and opens from either card face', async ({ page }, info) => {
  await openRoute(page, '/#/menu?q=Negroni');
  const card = page.locator('#menu-list .fc[data-recipe-id="11003"]');
  await expect(card).toBeVisible();
  const source = await card.locator('.fc-img img').getAttribute('src');
  for (const width of [320, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const styles = await card.locator('.fc-img img').evaluate((img) => ({ fit: getComputedStyle(img).objectFit, transform: getComputedStyle(img).transform }));
    expect(styles.fit).toBe('contain');
    expect(styles.transform).toBe('none');
  }
  const frontTrigger = card.locator('.front').getByRole('button', { name: /full screen/ });
  await expect(frontTrigger).toHaveText('');
  await frontTrigger.click();
  const dialog = page.getByRole('dialog', { name: 'Negroni', exact: true });
  await expect(dialog).toHaveAttribute('data-phase', 'open');
  await expect(page.locator('#root')).toHaveAttribute('inert', '');
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Lock recipe view at this position' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Back to card' })).toBeFocused();
  await expect(dialog.locator('.recipe-focus-photo img')).toHaveAttribute('src', source!);
  await expect(dialog.locator('.recipe-focus-photo img')).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Ingredients', exact: true })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Method', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('recipe-desktop.png') });
  await dialog.getByRole('button', { name: 'Back to card' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(frontTrigger).toBeFocused();
  await expect(card).not.toHaveClass(/flipped/);
  await card.getByRole('button', { name: 'View recipe' }).click();
  const backTrigger = card.locator('.back').getByRole('button', { name: /full screen/ });
  await backTrigger.click();
  await expect(dialog).toHaveAttribute('data-phase', 'open');
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(card).toHaveClass(/flipped/);
  await expect(backTrigger).toBeFocused();
});

test('locks the reading position, keeps Back available, and restores scroll after Escape', async ({ page, browserName }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRoute(page, '/#/menu?q=Negroni');
  const card = page.locator('#menu-list .fc[data-recipe-id="11003"]');
  await card.getByRole('button', { name: /full screen/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Negroni', exact: true });
  await expect(dialog).toHaveAttribute('data-phase', 'open');
  const scroller = dialog.locator('.recipe-focus-scroller');
  await scroller.evaluate((el) => { el.scrollTop = 160; });
  const before = await scroller.evaluate((el) => el.scrollTop);
  await dialog.getByRole('button', { name: 'Lock recipe view at this position' }).click();
  await expect(dialog).toHaveAttribute('data-locked', 'true');
  await expect(scroller).toHaveCSS('overflow-y', 'hidden');
  await expect(scroller).toHaveCSS('touch-action', 'none');
  if (browserName !== 'webkit') {
    await scroller.hover();
    await page.mouse.wheel(0, 300);
  } else {
    // Playwright has no native swipe API for mobile WebKit. Verify keyboard
    // confinement here; physical touch acceptance remains a device check.
    await page.keyboard.press('ArrowDown');
  }
  await page.waitForTimeout(200);
  expect(await scroller.evaluate((el) => el.scrollTop)).toBe(before);
  await expect(dialog.getByRole('button', { name: 'Back to card' })).toBeInViewport();
  await page.screenshot({ path: info.outputPath('recipe-mobile-locked.png') });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(dialog).toHaveAttribute('data-locked', 'false');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(card).toBeVisible();
  await expect(page.locator('#root')).not.toHaveAttribute('inert', '');
});

test('shows the bounded fallback when the selected photograph fails', async ({ page }) => {
  await page.unroute('https://upload.wikimedia.org/**');
  await page.route('https://upload.wikimedia.org/**', (route) => route.abort());
  await openRoute(page, '/#/menu?q=Negroni');
  await page.locator('#menu-list .fc[data-recipe-id="11003"]').getByRole('button', { name: /full screen/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Negroni', exact: true });
  await expect(dialog.getByRole('img', { name: 'No verified photo available' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Ingredients', exact: true })).toBeVisible();
});

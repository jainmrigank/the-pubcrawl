import { test, expect } from '@playwright/test';
import { openRoute, seedStableDevice } from './helpers';

// These checks run only against the production build served by `vite preview`.
// Keeping them opt-in avoids making the fast development E2E suite depend on
// service-worker installation timing.
test.describe('isolated production preview', () => {
  test.skip(!process.env.PUBCRAWL_E2E_MODE, 'preview-only checks');
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('ships an any-orientation manifest, memory API, and offline app shell', async ({ page }) => {
    await seedStableDevice(page);

    const manifestResponse = await page.request.get('/manifest.webmanifest');
    expect(manifestResponse.ok()).toBeTruthy();
    const manifest = await manifestResponse.json();
    expect(manifest.orientation).toBe('any');
    expect(manifest.display).toBe('standalone');

    const healthResponse = await page.request.get('/api/health');
    expect(healthResponse.ok()).toBeTruthy();
    const health = await healthResponse.json();
    expect(health.runtime).toBe('render');
    expect(health.store).toBe('memory');
    expect(health.catalogueCocktails).toBe(691);

    await openRoute(page, '/#/menu');
    await page.evaluate(async () => {
      if ('serviceWorker' in navigator) await navigator.serviceWorker.ready;
    });
    // The first visit installs the worker; a reload lets it take control.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
    await expect(page.locator('#menu-list .grid .fc').first()).toBeVisible({ timeout: 20_000 });

    await page.context().setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.site')).toBeVisible();
    await expect(page.locator('#menu-list .grid .fc').first()).toBeVisible({ timeout: 20_000 });
    await page.context().setOffline(false);
  });
});

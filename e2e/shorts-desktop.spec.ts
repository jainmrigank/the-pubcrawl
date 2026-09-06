import { test, expect } from '@playwright/test';
import { openRoute, seedStableDevice } from './helpers';
import { activeIndex, fakeLog, installFakeYouTube, setNativeSound, waitForFirstPlay } from './fixtures/shortsFakeYouTube';

test.describe('Shorts desktop controls-first layout', () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

  test('keeps native YouTube controls exposed and navigates with keyboard', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await expect(page.locator('.shorts-player-host iframe')).toHaveCount(1);
    const iframeBox = await page.locator('.shorts-player-host iframe').boundingBox();
    expect(iframeBox?.width).toBeGreaterThanOrEqual(200);

    const feed = page.locator('.shorts-feed');
    await feed.focus();
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => activeIndex(page)).toBe(1);
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => activeIndex(page)).toBe(0);
    expect((await fakeLog(page)).filter((entry) => entry.method === 'construct')).toHaveLength(1);
  });

  test('keeps a native sound choice through a mouse-wheel burst', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await setNativeSound(page, true, 84);
    await page.locator('.shorts-nav-zone-right').hover();
    await page.mouse.wheel(0, 900);
    await expect.poll(() => activeIndex(page), { timeout: 4_000 }).toBe(1);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound())).toEqual({ muted: false, volume: 84 });
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toContain('"desiredAudible":true');
  });
});

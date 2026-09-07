import { test, expect } from '@playwright/test';
import { openRoute, seedStableDevice } from './helpers';
import { activeIndex, fakeLog, installFakeYouTube, setNativeSound, waitForFirstPlay } from './fixtures/shortsFakeYouTube';

test.describe('Shorts native vertical feed checkpoint', () => {
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
    await expect(page.getByRole('button', { name: /Previous Short|Next Short/ })).toHaveCount(0);
    await expect(page.locator('.shorts-meta,.shorts-nav-zone')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Show Shorts tutorial' })).toBeVisible();
  });

  test('keeps a native sound choice through a mouse-wheel burst', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await expect(page.locator('.shorts-player-layer')).toHaveAttribute('data-sound-acknowledged', 'true');
    await setNativeSound(page, true, 84);
    const box = await page.locator('.shorts-player-host iframe').boundingBox();
    if (!box) throw new Error('Player not measurable');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, box.height);
    // Wheel acceleration differs between engines (WebKit can snap two cards
    // for this delta). Assert the browser's final geometry, not a custom
    // one-wheel/one-index policy. Only one load may occur at that destination.
    await expect.poll(() => activeIndex(page), { timeout: 4_000 }).toBeGreaterThan(0);
    const destination = await activeIndex(page);
    const geometry = await page.locator('.shorts-feed').evaluate((element) => ({ top: element.scrollTop, height: element.clientHeight }));
    expect(Math.abs(geometry.top - destination * geometry.height)).toBeLessThanOrEqual(1);
    const destinationId = await page.locator('.shorts-card.is-active').getAttribute('data-short-id');
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.state()?.shortId)).toBe(destinationId);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound())).toEqual({ muted: false, volume: 84 });
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toContain('"desiredAudible":true');
    expect((await fakeLog(page)).filter((entry) => entry.method === 'construct')).toHaveLength(1);
    expect((await fakeLog(page)).filter((entry) => entry.method === 'loadVideoById')).toHaveLength(1);
  });
});

test.describe('Shorts phone layout checkpoint', () => {
  test.use({ viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true });

  test('keeps the native player above navigation without recreating it on rotation', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    const original = await page.locator('.shorts-player-host iframe').elementHandle();
    for (const viewport of [
      { width: 320, height: 700 }, { width: 390, height: 844 },
      { width: 428, height: 926 }, { width: 926, height: 428 }, { width: 428, height: 926 },
    ]) {
      await page.setViewportSize(viewport);
      await expect.poll(async () => {
        const media = await page.locator('.shorts-player-host iframe').boundingBox();
        const nav = await page.locator('.mobile-bottom-nav').boundingBox();
        return Boolean(media && nav && media.y + media.height <= nav.y + 1);
      }).toBe(true);
      const media = (await page.locator('.shorts-player-host iframe').boundingBox())!;
      const back = (await page.getByRole('button', { name: 'Back', exact: true }).boundingBox())!;
      const nav = (await page.locator('.mobile-bottom-nav').boundingBox())!;
      expect(media.width).toBeGreaterThanOrEqual(200);
      expect(media.height).toBeGreaterThanOrEqual(200);
      expect(media.x).toBeGreaterThanOrEqual(0);
      expect(media.x + media.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(back.y + back.height).toBeLessThanOrEqual(media.y + 1);
      expect(Math.abs(nav.y + nav.height - viewport.height)).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await expect(page.getByRole('button', { name: 'Show Shorts tutorial' })).toHaveCount(1);
      expect(await original!.evaluate((element) => element === document.querySelector('.shorts-player-host iframe'))).toBe(true);
    }
    expect((await fakeLog(page)).filter((entry) => entry.method === 'construct')).toHaveLength(1);
    await page.goto('/#/menu', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.shorts-player-host iframe')).toHaveCount(0);
  });
});

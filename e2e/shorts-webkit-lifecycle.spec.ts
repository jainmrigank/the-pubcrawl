import { test, expect } from '@playwright/test';
import { openRoute, seedStableDevice } from './helpers';
import { fakeLog, installFakeYouTube, setNativeSound, sideSwipeTo, swipeTo, waitForFirstPlay } from './fixtures/shortsFakeYouTube';

test.describe('Shorts WebKit lifecycle', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('native controls remain reachable because no first-party layer covers the iframe', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    const geometry = await page.evaluate(() => {
      const iframe = document.querySelector<HTMLIFrameElement>('.shorts-player-host iframe')?.getBoundingClientRect();
      const zones = [...document.querySelectorAll<HTMLElement>('.shorts-nav-zone')].map((node) => node.getBoundingClientRect());
      return iframe ? { iframe, zones } : null;
    });
    expect(geometry).not.toBeNull();
    for (const zone of geometry!.zones) {
      expect(zone.right <= geometry!.iframe.left || zone.left >= geometry!.iframe.right).toBe(true);
    }
    expect(await page.locator('.shorts-player-host iframe').count()).toBe(1);
  });

  test('visibility suspension pauses and resumes only the current persistent player', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await setNativeSound(page, true, 66);
    const before = (await fakeLog(page)).find((entry) => entry.method === 'construct')?.instanceId;
    await page.evaluate(() => Object.defineProperty(document, 'hidden', { configurable: true, value: true }));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect.poll(async () => (await fakeLog(page)).filter((entry) => entry.method === 'pauseVideo').length).toBeGreaterThan(0);
    await page.evaluate(() => Object.defineProperty(document, 'hidden', { configurable: true, value: false }));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect.poll(async () => (await fakeLog(page)).filter((entry) => entry.method === 'playVideo').length).toBeGreaterThan(1);
    expect((await fakeLog(page)).filter((entry) => entry.method === 'construct').map((entry) => entry.instanceId)).toEqual([before]);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound())).toEqual({ muted: true, volume: 66 });
  });

  test('same player loops without recuing or hiding the revealed frame', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    const before = (await fakeLog(page)).length;
    await page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.end());
    await expect.poll(async () => (await fakeLog(page)).slice(before).filter((entry) => entry.method === 'seekTo').length).toBe(1);
    await expect.poll(async () => (await fakeLog(page)).slice(before).filter((entry) => entry.method === 'playVideo').length).toBe(1);
    await expect(page.locator('.shorts-player-layer')).toHaveClass(/is-revealed/);
    expect((await fakeLog(page)).slice(before).some((entry) => /construct|loadVideoById|destroy/.test(entry.method))).toBe(false);
  });

  test('post-reveal buffering keeps the same visible iframe without a reload', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    // Allow optional catalogue enrichment to settle before taking the command
    // baseline; it must not be confused with buffering-induced reload work.
    await page.waitForTimeout(250);
    const before = await fakeLog(page);
    const beforeLoads = before.filter((entry) => entry.method === 'loadVideoById').length;
    const beforeConstructs = before.filter((entry) => entry.method === 'construct').length;
    const beforeDestroys = before.filter((entry) => entry.method === 'destroy').length;
    await page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.buffering());
    await expect(page.locator('.shorts-player-layer')).toHaveClass(/is-revealed/);
    await expect(page.locator('.shorts-player-host iframe')).toHaveCount(1);
    const after = await fakeLog(page);
    expect(after.filter((entry) => entry.method === 'loadVideoById')).toHaveLength(beforeLoads);
    expect(after.filter((entry) => entry.method === 'construct')).toHaveLength(beforeConstructs);
    expect(after.filter((entry) => entry.method === 'destroy')).toHaveLength(beforeDestroys);
  });

  test('a native pause is respected until the user resumes it', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    const before = (await fakeLog(page)).filter((entry) => entry.method === 'playVideo').length;
    await page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.nativePause());
    await expect(page.locator('.shorts-player-layer')).toHaveAttribute('data-player-ready', 'true');
    await page.waitForTimeout(1_650);
    expect((await fakeLog(page)).filter((entry) => entry.method === 'playVideo').length).toBe(before);
    await page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.nativePlay());
    await expect(page.locator('.shorts-player-layer')).toHaveClass(/is-revealed/);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.state()?.state)).toBe(1);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.state()?.shortId)).toBe(
      await page.locator('.shorts-card.is-active').getAttribute('data-short-id'),
    );
  });

  test('a partial side swipe leaves the selected video and iframe untouched', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    const before = await page.locator('.shorts-feed').getAttribute('data-controller-lease');
    const zone = page.locator('.shorts-nav-zone-right');
    const box = await zone.boundingBox();
    expect(box).not.toBeNull();
    await zone.dispatchEvent('pointerdown', { pointerId: 1, clientX: (box?.x || 0) + 12, clientY: (box?.y || 0) + 100, bubbles: true });
    await zone.dispatchEvent('pointerup', { pointerId: 1, clientX: (box?.x || 0) + 18, clientY: (box?.y || 0) + 124, bubbles: true });
    await expect(page.locator('.shorts-feed')).toHaveAttribute('data-controller-lease', before || '');
    expect((await fakeLog(page)).filter((entry) => entry.method === 'loadVideoById')).toHaveLength(0);
  });

  test('a complete side swipe uses the real pointer path in both directions', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await setNativeSound(page, true, 58);
    await sideSwipeTo(page, 1);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound())).toEqual({ muted: false, volume: 58 });
    await sideSwipeTo(page, 0);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound())).toEqual({ muted: false, volume: 58 });
    expect((await fakeLog(page)).filter((entry) => entry.method === 'construct')).toHaveLength(1);
  });

  test('a delayed loop keeps the revealed player and restarts once per natural end', async ({ page }) => {
    await installFakeYouTube(page, { loopProgressDelayMs: 220 });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    const before = (await fakeLog(page)).length;
    await page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.end());
    await expect.poll(async () => (await fakeLog(page)).slice(before).filter((entry) => entry.method === 'seekTo').length).toBe(1);
    await expect(page.locator('.shorts-player-layer')).toHaveClass(/is-revealed/);
    await page.waitForTimeout(280);
    await page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.end());
    await expect.poll(async () => (await fakeLog(page)).slice(before).filter((entry) => entry.method === 'seekTo').length).toBe(2);
    await expect.poll(async () => (await fakeLog(page)).slice(before).filter((entry) => entry.method === 'playVideo').length).toBe(2);
    await expect(page.locator('.shorts-player-layer')).toHaveClass(/is-revealed/);
    expect((await fakeLog(page)).slice(before).some((entry) => /construct|loadVideoById|destroy/.test(entry.method))).toBe(false);
  });

  test('opening Help pauses and resumes the same player without hidden audio', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page, { tours: true });
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    const before = await fakeLog(page);
    await page.getByRole('button', { name: 'Show Shorts tutorial' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect.poll(async () => (await fakeLog(page)).filter((entry) => entry.method === 'pauseVideo').length).toBeGreaterThan(before.filter((entry) => entry.method === 'pauseVideo').length);
    await page.getByRole('button', { name: 'Skip' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(async () => (await fakeLog(page)).filter((entry) => entry.method === 'playVideo').length).toBeGreaterThan(before.filter((entry) => entry.method === 'playVideo').length);
    expect((await fakeLog(page)).filter((entry) => entry.method === 'construct')).toHaveLength(1);
  });

  test('route leave destroys the player and does not resume hidden audio', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await page.locator('.mobile-nav-item[href="#/menu"]').click();
    await expect(page.locator('.shorts-player-host iframe')).toHaveCount(0);
    await page.waitForTimeout(100);
    const last = (await fakeLog(page)).at(-1);
    expect(last?.method).toBe('destroy');
  });
});

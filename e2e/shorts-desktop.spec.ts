import { test, expect } from '@playwright/test';
import { openRoute, seedStableDevice } from './helpers';
import {
  activeIndex,
  activeLeaseIdentity,
  fakeLog,
  fakeStates,
  installFakeYouTube,
  scrollToWithQuietFallback,
  scrollToWithoutTouch,
  setNativeSound,
  swipeTo,
  toggleNativeSound,
  waitForFirstPlay,
} from './fixtures/shortsFakeYouTube';

test.describe('Shorts desktop wheel sound retention', () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

  test('retains the native sound session after a real mouse-wheel settlement', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await setNativeSound(page, true, 84);

    const feed = page.locator('.shorts-feed');
    await feed.hover();
    await page.mouse.wheel(0, 900);
    await expect.poll(() => activeIndex(page), { timeout: 4_000 }).toBeGreaterThan(0);
    await expect(feed).toHaveAttribute('data-controller-phase', 'idle');
    const identity = await activeLeaseIdentity(page);
    await expect.poll(() => page.evaluate((index) => (window as any).__PUBCRAWL_FAKE_YT__?.sound(index), identity.index)).toEqual({
      muted: false,
      volume: 84,
    });
    const events = (await fakeLog(page)).filter((entry) => (
      entry.index === identity.index &&
      entry.shortId === identity.shortId &&
      entry.generation === identity.generation
    ));
    expect(events.some((entry) => entry.method === 'unMute')).toBe(true);
    expect(events.some((entry) => entry.method === 'playVideo')).toBe(true);
  });

  test('retains sound when the feed must use its quiet settlement fallback', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await setNativeSound(page, true, 79);

    const startedAt = await page.evaluate(() => performance.now());
    await scrollToWithQuietFallback(page, 1);
    const identity = await activeLeaseIdentity(page);
    await expect.poll(() => page.evaluate((index) => (
      (window as any).__PUBCRAWL_FAKE_YT__?.sound(index)
    ), identity.index)).toEqual({ muted: false, volume: 79 });
    const starts = (await fakeLog(page)).filter((entry) => (
      entry.index === identity.index &&
      entry.shortId === identity.shortId &&
      entry.generation === identity.generation &&
      entry.method === 'playVideo'
    ));
    expect(starts).toHaveLength(1);
    expect(starts[0].at - startedAt).toBeGreaterThanOrEqual(100);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 79 }),
    );
  });
});

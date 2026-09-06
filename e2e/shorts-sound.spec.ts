import { test, expect } from '@playwright/test';
import { openRoute, seedStableDevice } from './helpers';
import {
  fakeLog,
  installFakeYouTube,
  setNativeSound,
  swipeTo,
  toggleNativeSound,
  waitForFirstPlay,
} from './fixtures/shortsFakeYouTube';

test.describe('Shorts native sound retention', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('starts a fresh session muted and records one native sound choice', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound())).toEqual({ muted: true, volume: 100 });
    await expect.poll(async () => (await fakeLog(page)).filter((entry) => entry.method === 'construct').length).toBe(1);

    await setNativeSound(page, true, 64);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 64 }),
    );
    await toggleNativeSound(page);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: false, volume: 64 }),
    );
  });

  test('normalizes a legacy audible-zero session before the first native toggle', async ({ page }) => {
    await page.addInitScript(() => {
      // Playwright also evaluates init scripts in the fake player's about:blank
      // iframe. Guard the seed so that child-frame execution cannot reset the
      // parent document's session preference after the app has repaired it.
      if (window.top !== window) return;
      sessionStorage.setItem('pubcrawl.shorts.sound.v1', JSON.stringify({ version: 1, desiredAudible: true, volume: 0 }));
      sessionStorage.removeItem('pubcrawl.shorts.sound.normalized.v1');
    });
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 100 }),
    );
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound())).toEqual({ muted: false, volume: 100 });

    // The first native toggle mutes; the second unmutes at the repaired level.
    await toggleNativeSound(page);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound())).toEqual({ muted: true, volume: 100 });
    await toggleNativeSound(page);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound())).toEqual({ muted: false, volume: 100 });
    await swipeTo(page, 1);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound())).toEqual({ muted: false, volume: 100 });
  });

  test('retains enabled sound and volume across a long forward/reverse run', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await setNativeSound(page, true, 77);
    for (let index = 1; index <= 10; index += 1) {
      await swipeTo(page, index);
      await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound())).toEqual({ muted: false, volume: 77 });
    }
    for (let index = 9; index >= 5; index -= 1) {
      await swipeTo(page, index);
      await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound())).toEqual({ muted: false, volume: 77 });
    }
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 77 }),
    );
    expect((await fakeLog(page)).filter((entry) => entry.method === 'construct')).toHaveLength(1);
  });

  test('restores the remembered volume when a video load resets native volume', async ({ page }) => {
    await installFakeYouTube(page, { resetSoundToZeroOnLoad: true });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await setNativeSound(page, true, 73);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 73 }),
    );

    await swipeTo(page, 1);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound())).toEqual({ muted: false, volume: 73 });
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 73 }),
    );
  });

  test('a blocked audible navigation still moves muted and keeps sound requested', async ({ page }) => {
    await installFakeYouTube(page, { blockAudible: true, blockAudibleCount: 20 });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await setNativeSound(page, true, 70);
    await swipeTo(page, 1);
    await expect(page.locator('.shorts-player-layer')).toHaveClass(/is-revealed/);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound())).toEqual({ muted: true, volume: 70 });
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toContain('"desiredAudible":true');
    await expect(page.locator('.shorts-sound-toggle, .shorts-sound-prompt, .shorts-tap')).toHaveCount(0);
  });

  test('native playback rate is session-scoped and reapplied on navigation', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.nativeRate(1.5));
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.rate.v1'))).toBe(
      JSON.stringify({ version: 1, preferredRate: 1.5 }),
    );
    await swipeTo(page, 1);
    expect((await fakeLog(page)).filter((entry) => entry.method === 'setPlaybackRate' && entry.value === 1.5).length).toBeGreaterThan(0);
  });

  test('keeps sound preference through route leave, re-entry, and reload', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await setNativeSound(page, true, 81);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 81 }),
    );
    await page.locator('.mobile-nav-item[href="#/menu"]').click();
    await expect(page.locator('.site')).toBeVisible();
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound())).toEqual({ muted: false, volume: 81 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForFirstPlay(page);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound())).toEqual({ muted: false, volume: 81 });
  });
});

import { test, expect } from '@playwright/test';
import { openRoute, seedStableDevice } from './helpers';

type FakePlayerOptions = { blockAudible: boolean };

/** Replace the network YouTube adapter with a deterministic iframe double. */
async function installFakeYouTube(page: import('@playwright/test').Page, options: FakePlayerOptions = { blockAudible: false }) {
  await page.addInitScript(({ blockAudible }) => {
    const target = window as Window & {
      __PUBCRAWL_FAKE_YT_LOG__?: Array<{ index: number; method: string }>;
    };
    const log = target.__PUBCRAWL_FAKE_YT_LOG__ = [];
    class FakePlayer {
      private readonly index: number;
      private readonly events: any;
      private muted = true;
      private volume = 100;
      private state = -1;
      private currentTime = 0;
      private blockedOnce = false;
      private destroyed = false;

      constructor(element: HTMLElement, playerOptions: any) {
        this.index = Number(element.closest('[data-short-index]')?.getAttribute('data-short-index') || -1);
        this.events = playerOptions.events;
        const iframe = document.createElement('iframe');
        iframe.title = 'Fake YouTube player';
        iframe.setAttribute('data-fake-youtube', 'true');
        element.appendChild(iframe);
        window.setTimeout(() => this.events.onReady?.({ target: this }), 0);
      }

      private record(method: string) {
        log.push({ index: this.index, method });
      }

      cueVideoById() {
        if (this.destroyed) return;
        this.record('cueVideoById');
        this.state = 5;
        window.setTimeout(() => this.events.onStateChange?.({ target: this, data: 5 }), 0);
      }
      loadVideoById() { this.cueVideoById(); }
      playVideo() {
        if (this.destroyed) return;
        this.record('playVideo');
        if (blockAudible && !this.muted && !this.blockedOnce) {
          this.blockedOnce = true;
          this.state = 2;
          this.events.onAutoplayBlocked?.({ target: this });
          return;
        }
        this.state = 1;
        this.currentTime = 0.2;
        window.setTimeout(() => this.events.onStateChange?.({ target: this, data: 1 }), 0);
      }
      pauseVideo() { if (!this.destroyed) { this.record('pauseVideo'); this.state = 2; } }
      mute() { if (!this.destroyed) { this.record('mute'); this.muted = true; } }
      unMute() { if (!this.destroyed) { this.record('unMute'); this.muted = false; } }
      isMuted() { return this.muted; }
      setVolume(volume: number) { if (!this.destroyed) { this.record('setVolume'); this.volume = volume; } }
      getVolume() { return this.volume; }
      getCurrentTime() { return this.currentTime; }
      seekTo(seconds: number) { this.currentTime = seconds; }
      getPlayerState() { return this.state; }
      getPlaybackRate() { return 1; }
      setPlaybackRate() {}
      getAvailablePlaybackRates() { return [1, 2]; }
      destroy() { this.record('destroy'); this.destroyed = true; }
    }
    (window as Window & { YT?: unknown }).YT = { Player: FakePlayer };
  }, options);
}

test.describe('Shorts startup and controls', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('uses a black startup surface, no PubCrawl thumbnails, and bounded players', async ({ page }) => {
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await expect(page.locator('.shorts-feed')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.shorts-card img')).toHaveCount(0);
    await expect(page.locator('.shorts-startup-surface').first()).toBeVisible();
    await expect(page.locator('.shorts-card iframe')).toHaveCount(await page.locator('.shorts-card iframe').count());
    expect(await page.locator('.shorts-card iframe').count()).toBeLessThanOrEqual(5);
    await expect(page.locator('.shorts-overlay-action[aria-label="Back"]').first()).toHaveCSS('color', /rgb\(241, 238, 229\)|rgb\(255, 255, 255\)/);
    await expect(page.locator('.shorts-overlay-action[aria-label="Share"]').first()).toHaveCSS('color', /rgb\(241, 238, 229\)|rgb\(255, 255, 255\)/);
    const sound = page.locator('.shorts-sound-toggle').first();
    await expect(sound).toHaveAttribute('aria-label', 'Turn sound on');
    await expect(sound).toHaveAttribute('aria-pressed', 'false');
    await expect(sound).toHaveAttribute('title', 'Turn sound on');
    await expect(page.locator('body > .mobile-bottom-nav')).toBeVisible();
  });

  test('keeps prepared players muted and starts the active player from the sound gesture', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await expect(page.locator('.shorts-feed')).toBeVisible({ timeout: 20_000 });
    await page.waitForFunction(() => Boolean((window as any).__PUBCRAWL_FAKE_YT_LOG__?.some((entry: any) => entry.method === 'playVideo')));

    const before = await page.evaluate(() => ([...(window as any).__PUBCRAWL_FAKE_YT_LOG__ || []]));
    expect(before.some((entry: { method: string }) => entry.method === 'unMute')).toBe(false);
    const activeIndex = await page.locator('.shorts-feed').getAttribute('data-controller-active');
    await page.locator('.shorts-sound-toggle').click();
    await expect(page.locator('.shorts-sound-toggle')).toHaveAttribute('aria-pressed', 'true');
    await page.waitForFunction(() => Boolean((window as any).__PUBCRAWL_FAKE_YT_LOG__?.some((entry: any) => entry.method === 'unMute')));
    const after = await page.evaluate(() => ([...(window as any).__PUBCRAWL_FAKE_YT_LOG__ || []]));
    const audibleIndexes = after.filter((entry: { method: string }) => entry.method === 'unMute').map((entry: { index: number }) => String(entry.index));
    expect(audibleIndexes.every((index: string) => index === activeIndex)).toBe(true);
    const lastUnmute = after.map((entry: { method: string }) => entry.method).lastIndexOf('unMute');
    expect(after.slice(lastUnmute + 1).some((entry: { method: string }) => entry.method === 'playVideo')).toBe(true);
  });

  test('falls back to muted motion once when iOS blocks an audible start', async ({ page }) => {
    await installFakeYouTube(page, { blockAudible: true });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await expect(page.locator('.shorts-feed')).toBeVisible({ timeout: 20_000 });
    await page.waitForFunction(() => Boolean((window as any).__PUBCRAWL_FAKE_YT_LOG__?.some((entry: any) => entry.method === 'playVideo')));
    await page.locator('.shorts-sound-toggle').click();
    await expect(page.locator('.shorts-sound-prompt')).toHaveText('TAP FOR SOUND');
    const events = await page.evaluate(() => ([...(window as any).__PUBCRAWL_FAKE_YT_LOG__ || []]));
    expect(events.some((entry: { method: string }) => entry.method === 'unMute')).toBe(true);
    expect(events.filter((entry: { method: string }) => entry.method === 'playVideo').length).toBeGreaterThanOrEqual(2);
    await expect(page.locator('.shorts-card.is-active .shorts-startup-surface')).toBeHidden({ timeout: 3_000 });
  });

  test('native scrollend commits one destination without the quiet fallback delay', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    const feed = page.locator('.shorts-feed');
    await expect(feed).toBeVisible({ timeout: 20_000 });
    await page.waitForFunction(() => Boolean((window as any).__PUBCRAWL_FAKE_YT_LOG__?.some((entry: any) => entry.method === 'playVideo')));
    await feed.evaluate((element) => {
      const root = element as HTMLElement;
      root.scrollTop = root.clientHeight;
      root.dispatchEvent(new Event('scroll', { bubbles: true }));
      root.dispatchEvent(new Event('scrollend', { bubbles: true }));
    });
    await expect(feed).toHaveAttribute('data-controller-phase', 'idle');
    await expect(feed).toHaveAttribute('data-controller-active', '1');
    const attributes = await feed.evaluate((element) => ({
      active: element.getAttribute('data-controller-active'),
      visible: element.getAttribute('data-controller-visible'),
      lease: element.getAttribute('data-controller-lease'),
    }));
    expect(attributes.active).toBe('1');
    expect(attributes.visible).toBe('1');
    expect(attributes.lease).toMatch(/^1:\d+$/);
  });
});

import { test, expect, type Page } from '@playwright/test';
import { openRoute, seedStableDevice } from './helpers';

type FakePlayerOptions = {
  blockAudible: boolean;
  stallReadyCount?: number;
  accelerateInitializationTimeout?: boolean;
};

type FakeLogEntry = {
  at: number;
  index: number;
  shortId: string;
  generation: number | null;
  method: string;
};

/** Replace the network YouTube adapter with a deterministic iframe double. */
async function installFakeYouTube(page: Page, options: FakePlayerOptions = { blockAudible: false }) {
  await page.addInitScript(({ blockAudible, stallReadyCount = 0, accelerateInitializationTimeout = false }) => {
    type TestWindow = Window & {
      __PUBCRAWL_FAKE_YT_LOG__?: FakeLogEntry[];
      __PUBCRAWL_FAKE_YT__?: {
        nativeSound(index: number, audible: boolean, volume?: number): void;
        emit(index: number, state: number): void;
      };
    };
    const target = window as TestWindow;
    const log = target.__PUBCRAWL_FAKE_YT_LOG__ = [];
    const players = new Map<number, FakePlayer>();
    let constructed = 0;
    if (accelerateInitializationTimeout) {
      const nativeSetTimeout = window.setTimeout.bind(window);
      window.setTimeout = ((handler: TimerHandler, timeout = 0, ...args: unknown[]) => (
        nativeSetTimeout(handler, timeout === 12_000 ? 40 : timeout, ...args)
      )) as typeof window.setTimeout;
    }

    class FakePlayer {
      readonly index: number;
      private readonly element: HTMLElement;
      private readonly events: any;
      private muted = true;
      private volume = 100;
      private state = -1;
      private currentTime = 0;
      private blockedOnce = false;
      private destroyed = false;

      constructor(element: HTMLElement, playerOptions: any) {
        this.element = element;
        this.index = Number(element.closest('[data-short-index]')?.getAttribute('data-short-index') || -1);
        this.events = playerOptions.events;
        players.set(this.index, this);
        const iframe = document.createElement('iframe');
        iframe.title = 'Fake YouTube player';
        iframe.setAttribute('data-fake-youtube', 'true');
        element.appendChild(iframe);
        this.record('construct');
        const shouldStall = constructed < stallReadyCount;
        constructed += 1;
        if (!shouldStall) window.setTimeout(() => this.events.onReady?.({ target: this }), 0);
      }

      private identity() {
        const card = this.element.closest<HTMLElement>('[data-short-index]');
        const rawGeneration = Number(card?.dataset.leaseGeneration);
        return {
          shortId: card?.dataset.shortId || '',
          generation: Number.isInteger(rawGeneration) && rawGeneration > 0 ? rawGeneration : null,
        };
      }

      private record(method: string) {
        const identity = this.identity();
        log.push({ at: performance.now(), index: this.index, method, ...identity });
      }

      cueVideoById() {
        if (this.destroyed) return;
        this.record('cueVideoById');
        this.state = 5;
        window.setTimeout(() => this.events.onStateChange?.({ target: this, data: 5 }), 0);
      }
      loadVideoById() { this.record('loadVideoById'); }
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
      seekTo(seconds: number) { if (!this.destroyed) { this.record('seekTo'); this.currentTime = seconds; } }
      getPlayerState() { return this.state; }
      getPlaybackRate() { return 1; }
      setPlaybackRate() {}
      getAvailablePlaybackRates() { return [1, 2]; }
      destroy() { this.record('destroy'); this.destroyed = true; players.delete(this.index); }

      nativeSound(audible: boolean, volume = 64) {
        this.volume = volume;
        this.muted = !audible;
        this.record(audible ? 'nativeUnmute' : 'nativeMute');
      }

      emit(state: number) {
        this.state = state;
        this.record(`emit:${state}`);
        this.events.onStateChange?.({ target: this, data: state });
      }
    }

    target.__PUBCRAWL_FAKE_YT__ = {
      nativeSound(index, audible, volume = 64) { players.get(index)?.nativeSound(audible, volume); },
      emit(index, state) { players.get(index)?.emit(state); },
    };
    (window as Window & { YT?: unknown }).YT = { Player: FakePlayer };
  }, options);
}

async function waitForFirstPlay(page: Page) {
  await page.waitForFunction(() => Boolean((window as any).__PUBCRAWL_FAKE_YT_LOG__?.some((entry: FakeLogEntry) => entry.method === 'playVideo')));
}

async function fakeLog(page: Page): Promise<FakeLogEntry[]> {
  return page.evaluate(() => [...((window as any).__PUBCRAWL_FAKE_YT_LOG__ || [])]);
}

async function activeIndex(page: Page): Promise<number> {
  return Number(await page.locator('.shorts-feed').getAttribute('data-controller-active'));
}

async function setNativeSound(page: Page, audible: boolean, volume = 64) {
  const index = await activeIndex(page);
  await page.evaluate(({ index, audible, volume }) => {
    (window as any).__PUBCRAWL_FAKE_YT__?.nativeSound(index, audible, volume);
  }, { index, audible, volume });
}

async function swipeTo(page: Page, index: number) {
  const feed = page.locator('.shorts-feed');
  await feed.evaluate((element, target) => {
    const root = element as HTMLElement;
    root.dispatchEvent(new TouchEvent('touchstart', { bubbles: true }));
    root.scrollTop = target * root.clientHeight;
    root.dispatchEvent(new Event('scroll', { bubbles: true }));
  }, index);
  await page.waitForTimeout(40);
  await feed.evaluate((element) => {
    element.dispatchEvent(new TouchEvent('touchend', { bubbles: true }));
  });
  await expect(feed).toHaveAttribute('data-controller-active', String(index));
  await expect(feed).toHaveAttribute('data-controller-phase', 'idle');
}

test.describe('Shorts startup and controls', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('uses a black startup surface, no PubCrawl thumbnail or duplicate sound control, and bounded players', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await expect(page.locator('.shorts-feed')).toBeVisible({ timeout: 20_000 });
    await waitForFirstPlay(page);
    await expect(page.locator('.shorts-card img')).toHaveCount(0);
    expect(await page.locator('.shorts-card iframe').count()).toBeLessThanOrEqual(5);
    await expect(page.locator('.shorts-overlay-action[aria-label="Back"]').first()).toHaveCSS('color', /rgb\(241, 238, 229\)|rgb\(255, 255, 255\)/);
    await expect(page.locator('.shorts-overlay-action[aria-label="Share"]').first()).toHaveCSS('color', /rgb\(241, 238, 229\)|rgb\(255, 255, 255\)/);
    await expect(page.getByRole('button', { name: 'Show Shorts tutorial' })).toHaveCount(1);
    await expect(page.locator('.shorts-sound-toggle, .shorts-sound-prompt')).toHaveCount(0);
    await expect(page.getByText('TAP FOR SOUND', { exact: true })).toHaveCount(0);
    await expect(page.locator('body > .mobile-bottom-nav')).toBeVisible();
  });

  test('stalled iframe readiness releases both initialization slots', async ({ page }) => {
    await installFakeYouTube(page, {
      blockAudible: false,
      stallReadyCount: 2,
      accelerateInitializationTimeout: true,
    });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');

    await expect.poll(async () => (await fakeLog(page)).filter((entry) => entry.method === 'construct').length).toBeGreaterThanOrEqual(3);
    const events = await fakeLog(page);
    const firstConstructs = events.filter((entry) => entry.method === 'construct').slice(0, 2);
    for (const construct of firstConstructs) {
      expect(events.some((entry) => entry.index === construct.index && entry.method === 'destroy')).toBe(true);
    }
  });

  test('observes native YouTube sound for the session and requests it on the next eligible swipe', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    expect((await fakeLog(page)).some((entry) => entry.method === 'unMute')).toBe(false);

    await setNativeSound(page, true, 64);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toContain('"desiredAudible":true');
    await swipeTo(page, 1);

    await expect.poll(async () => (await fakeLog(page)).filter((entry) => entry.index === 1 && entry.method === 'playVideo').length).toBeGreaterThan(0);
    const targetEvents = (await fakeLog(page)).filter((entry) => entry.index === 1);
    const unmute = targetEvents.findIndex((entry) => entry.method === 'unMute');
    const play = targetEvents.findIndex((entry, eventIndex) => eventIndex > unmute && entry.method === 'playVideo');
    expect(unmute).toBeGreaterThanOrEqual(0);
    expect(play).toBeGreaterThan(unmute);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toContain('"desiredAudible":true');
  });

  test('falls back to muted motion once when iOS rejects an audible swipe', async ({ page }) => {
    await installFakeYouTube(page, { blockAudible: true });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await setNativeSound(page, true, 71);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toContain('"desiredAudible":true');

    await swipeTo(page, 1);
    await expect.poll(async () => (await fakeLog(page)).filter((entry) => entry.index === 1 && entry.method === 'playVideo').length).toBe(2);
    const methods = (await fakeLog(page)).filter((entry) => entry.index === 1).map((entry) => entry.method);
    const unmute = methods.indexOf('unMute');
    const firstPlay = methods.indexOf('playVideo', unmute + 1);
    const fallbackMute = methods.indexOf('mute', firstPlay + 1);
    const fallbackPlay = methods.indexOf('playVideo', fallbackMute + 1);
    expect(unmute).toBeGreaterThanOrEqual(0);
    expect(firstPlay).toBeGreaterThan(unmute);
    expect(fallbackMute).toBeGreaterThan(firstPlay);
    expect(fallbackPlay).toBeGreaterThan(fallbackMute);
    await expect(page.locator('.shorts-card.is-active .shorts-startup-surface')).toBeHidden({ timeout: 3_000 });
    await expect(page.locator('.shorts-sound-toggle, .shorts-sound-prompt')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toContain('"desiredAudible":true');

    // A successful muted recovery clears the host's transient blocked flag.
    // Reusing that prepared iframe later must autoplay again instead of
    // regressing to a facade that needs another tap.
    await swipeTo(page, 2);
    await swipeTo(page, 1);
    await expect.poll(async () => (await fakeLog(page)).filter((entry) => entry.index === 1 && entry.method === 'playVideo').length).toBeGreaterThan(2);
    await expect(page.locator('.shorts-card.is-active .shorts-startup-surface')).toBeHidden();
  });

  test('native scrollend commits immediately and does not duplicate the quiet fallback start', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    const feed = page.locator('.shorts-feed');
    await waitForFirstPlay(page);

    const startedAt = await page.evaluate(() => performance.now());
    await feed.evaluate((element) => {
      const root = element as HTMLElement;
      root.scrollTop = root.clientHeight;
      root.dispatchEvent(new Event('scroll', { bubbles: true }));
      root.dispatchEvent(new Event('scrollend', { bubbles: true }));
    });
    await expect.poll(async () => (await fakeLog(page)).filter((entry) => entry.index === 1 && entry.method === 'playVideo').length).toBe(1);
    const firstStart = (await fakeLog(page)).find((entry) => entry.index === 1 && entry.method === 'playVideo');
    expect(firstStart).toBeTruthy();
    expect(firstStart!.at - startedAt).toBeLessThan(120);
    await expect(feed).toHaveAttribute('data-controller-active', '1');
    await expect(feed).toHaveAttribute('data-controller-phase', 'idle');
    await page.waitForTimeout(180);
    const starts = (await fakeLog(page)).filter((entry) => entry.index === 1 && entry.method === 'playVideo');
    expect(starts).toHaveLength(1);
  });

  test('same-card snap-back and natural looping preserve one revealed iframe', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    const feed = page.locator('.shorts-feed');
    await waitForFirstPlay(page);
    await expect(page.locator('.shorts-card.is-active .shorts-player-layer')).toHaveClass(/is-revealed/);
    const index = await activeIndex(page);
    const leaseBefore = await feed.getAttribute('data-controller-lease');
    const logBefore = (await fakeLog(page)).length;

    await feed.evaluate((element) => {
      const root = element as HTMLElement;
      root.dispatchEvent(new TouchEvent('touchstart', { bubbles: true }));
      root.scrollTop += 1;
      root.dispatchEvent(new Event('scroll', { bubbles: true }));
      root.scrollTop -= 1;
      root.dispatchEvent(new Event('scroll', { bubbles: true }));
      root.dispatchEvent(new TouchEvent('touchend', { bubbles: true }));
      root.dispatchEvent(new Event('scrollend', { bubbles: true }));
    });
    await expect(feed).toHaveAttribute('data-controller-lease', leaseBefore || '');
    const bounceEvents = (await fakeLog(page)).slice(logBefore).filter((entry) => entry.index === index);
    expect(bounceEvents.some((entry) => entry.method === 'playVideo' || entry.method === 'pauseVideo')).toBe(false);

    await page.evaluate((active) => (window as any).__PUBCRAWL_FAKE_YT__?.emit(active, 3), index);
    await expect(page.locator('.shorts-card.is-active .shorts-player-layer')).toHaveClass(/is-revealed/);
    await expect(page.locator('.shorts-card.is-active .shorts-startup-surface')).toBeHidden();

    const loopBefore = (await fakeLog(page)).length;
    await page.evaluate((active) => {
      (window as any).__PUBCRAWL_FAKE_YT__?.emit(active, 0);
      (window as any).__PUBCRAWL_FAKE_YT__?.emit(active, 0);
    }, index);
    await expect.poll(async () => (await fakeLog(page)).slice(loopBefore).filter((entry) => entry.index === index && entry.method === 'playVideo').length).toBe(1);
    const loopEvents = (await fakeLog(page)).slice(loopBefore).filter((entry) => entry.index === index);
    expect(loopEvents.filter((entry) => entry.method === 'seekTo')).toHaveLength(1);
    expect(loopEvents.some((entry) => entry.method === 'cueVideoById' || entry.method === 'loadVideoById' || entry.method === 'destroy')).toBe(false);
    await expect(page.locator('.shorts-card.is-active .shorts-player-layer')).toHaveClass(/is-revealed/);

    // A still-mounted player keeps its confirmed frame while inactive, so
    // swiping back cannot expose the startup surface or rebuild the iframe.
    const priorIdentityEvents = (await fakeLog(page)).filter((entry) => entry.index === index && /cueVideoById|loadVideoById|destroy/.test(entry.method)).length;
    await swipeTo(page, index + 1);
    await expect(page.locator(`.shorts-card[data-short-index="${index}"] .shorts-player-layer`)).toHaveClass(/is-revealed/);
    await swipeTo(page, index);
    await expect(page.locator('.shorts-card.is-active .shorts-player-layer')).toHaveClass(/is-revealed/);
    await expect(page.locator('.shorts-card.is-active .shorts-startup-surface')).toBeHidden();
    const nextIdentityEvents = (await fakeLog(page)).filter((entry) => entry.index === index && /cueVideoById|loadVideoById|destroy/.test(entry.method)).length;
    expect(nextIdentityEvents).toBe(priorIdentityEvents);
  });
});

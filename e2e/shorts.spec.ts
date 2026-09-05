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

  test('a real facade tap renews an exhausted start command without changing the lease', async ({ page }) => {
    await installFakeYouTube(page, {
      blockAudible: false,
      blockPlayIndex: 1,
      blockPlayCount: 2,
    });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);

    await swipeTo(page, 1);
    await expect.poll(async () => (
      await fakeLog(page)
    ).filter((entry) => entry.index === 1 && entry.method === 'playVideo').length).toBe(2);
    const feed = page.locator('.shorts-feed');
    const leaseBefore = await feed.getAttribute('data-controller-lease');
    const facade = page.locator('.shorts-card.is-active .shorts-facade');
    await expect(facade.locator('.shorts-tap')).toContainText('TAP TO PLAY');
    // Let the parent blocked marker commit before exercising recovery. This
    // prevents the test from passing only because the second block and the
    // click happened in the same React batch.
    await page.waitForTimeout(50);

    await facade.click();

    await expect.poll(async () => (
      await fakeLog(page)
    ).filter((entry) => entry.index === 1 && entry.method === 'playVideo').length).toBe(3);
    await expect(feed).toHaveAttribute('data-controller-lease', leaseBefore || '');
    await expect(page.locator('.shorts-card.is-active .shorts-player-layer')).toHaveClass(/is-revealed/);
    await expect(page.locator('.shorts-card.is-active .shorts-startup-surface')).toBeHidden();
  });

  test('reinitializing a code-5 player renews an exhausted command before starting the fresh iframe', async ({ page }) => {
    await installFakeYouTube(page, {
      blockAudible: false,
      blockPlayIndex: 1,
      blockPlayCount: 2,
      accelerateStartupStall: true,
    });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);

    await swipeTo(page, 1);
    const activeLayer = page.locator('.shorts-card.is-active .shorts-player-layer');
    const facade = page.locator('.shorts-card.is-active .shorts-facade');
    await expect.poll(async () => (
      await fakeLog(page)
    ).filter((entry) => entry.index === 1 && entry.method === 'playVideo').length).toBe(2);
    await expect(facade.locator('.shorts-tap')).toContainText('TAP TO PLAY', { timeout: 3_000 });

    await page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.error(1, 5));
    await expect(activeLayer).toHaveAttribute('data-player-phase', 'blocked');
    const constructsBefore = (await fakeLog(page)).filter((entry) => entry.index === 1 && entry.method === 'construct').length;
    await facade.click();

    await expect.poll(async () => (
      await fakeLog(page)
    ).filter((entry) => entry.index === 1 && entry.method === 'construct').length).toBeGreaterThan(constructsBefore);
    await expect.poll(async () => (
      await fakeLog(page)
    ).filter((entry) => entry.index === 1 && entry.method === 'playVideo').length).toBe(3);
    await expect(activeLayer).toHaveClass(/is-revealed/);
    await expect(page.locator('.shorts-card.is-active .shorts-startup-surface')).toBeHidden();
  });

  test('a muted buffering pause recovers automatically without a facade tap', async ({ page }) => {
    await installFakeYouTube(page, {
      blockAudible: false,
      bufferThenPauseIndex: 1,
      bufferThenPauseCount: 1,
      accelerateStartupStall: true,
    });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);

    await swipeTo(page, 1);
    const feed = page.locator('.shorts-feed');
    const leaseBefore = await feed.getAttribute('data-controller-lease');
    await expect.poll(async () => (
      await fakeLog(page)
    ).filter((entry) => entry.index === 1 && entry.method === 'playVideo').length).toBe(2);
    await expect(feed).toHaveAttribute('data-controller-lease', leaseBefore || '');
    await expect(page.locator('.shorts-card.is-active .shorts-player-layer')).toHaveClass(/is-revealed/);
    await expect(page.locator('.shorts-card.is-active .shorts-startup-surface')).toBeHidden();
    await expect(page.locator('.shorts-card.is-active .shorts-tap')).toHaveCount(0);
  });

  test('an early HTML5 player error uses the unclaimed initial command instead of stranding the card', async ({ page }) => {
    await installFakeYouTube(page, {
      blockAudible: false,
      error5OnCueIndex: 0,
      accelerateErrorRetry: true,
    });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');

    await expect.poll(async () => (
      await fakeLog(page)
    ).filter((entry) => entry.index === 0 && entry.method === 'playVideo').length).toBe(1);
    await expect(page.locator('.shorts-card.is-active .shorts-player-layer')).toHaveClass(/is-revealed/);
    await expect(page.locator('.shorts-card.is-active .shorts-startup-surface')).toBeHidden();
  });

  test('manual playback never borrows a lease for an early code-5 error', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installFakeYouTube(page, {
      blockAudible: false,
      error5OnCueIndex: 0,
      accelerateErrorRetry: true,
    });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');

    const facade = page.locator('.shorts-card.is-active .shorts-facade');
    await expect(facade.locator('.shorts-tap')).toContainText('TAP TO PLAY');
    await page.waitForTimeout(100);
    expect((await fakeLog(page)).filter((entry) => entry.index === 0 && entry.method === 'playVideo')).toHaveLength(0);

    await facade.click();
    await expect.poll(async () => (
      await fakeLog(page)
    ).filter((entry) => entry.index === 0 && entry.method === 'playVideo').length).toBe(1);
    await expect(page.locator('.shorts-card.is-active .shorts-player-layer')).toHaveClass(/is-revealed/);
  });

  test('a code-5 muted fallback preserves the session sound preference', async ({ page }) => {
    await installFakeYouTube(page, {
      blockAudible: false,
      error5OnPlayIndex: 1,
      accelerateErrorRetry: true,
    });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await setNativeSound(page, true, 68);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toContain('"desiredAudible":true');

    await swipeTo(page, 1);
    await expect.poll(async () => (
      await fakeLog(page)
    ).filter((entry) => entry.index === 1 && entry.method === 'playVideo').length).toBe(2);
    await expect(page.locator('.shorts-card.is-active .shorts-player-layer')).toHaveClass(/is-revealed/);
    await page.waitForTimeout(350);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toContain('"desiredAudible":true');

    // Successful motion clears the host's temporary code-5 rebuild marker.
    // Revisiting this still-mounted prepared player must autoplay instead of
    // regressing to a facade that needs another tap.
    const startsBeforeRevisit = (await fakeLog(page)).filter((entry) => entry.index === 1 && entry.method === 'playVideo').length;
    await swipeTo(page, 2);
    await swipeTo(page, 1);
    await expect.poll(async () => (
      await fakeLog(page)
    ).filter((entry) => entry.index === 1 && entry.method === 'playVideo').length).toBeGreaterThan(startsBeforeRevisit);
    await expect(page.locator('.shorts-card.is-active .shorts-startup-surface')).toBeHidden();
  });

  test('a generationless code-5 error cannot reuse its failed iframe under a newer lease', async ({ page }) => {
    await installFakeYouTube(page, {
      blockAudible: false,
      accelerateErrorRetry: true,
    });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);

    const feed = page.locator('.shorts-feed');
    await feed.evaluate((element) => {
      const root = element as HTMLElement;
      root.dispatchEvent(new TouchEvent('touchstart', { bubbles: true }));
      root.scrollTop = root.clientHeight * 0.6;
      root.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await expect(feed).toHaveAttribute('data-controller-phase', 'scrolling');
    await page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.error(0, 5));

    await feed.evaluate((element) => {
      const root = element as HTMLElement;
      root.scrollTop = 0;
      root.dispatchEvent(new Event('scroll', { bubbles: true }));
      root.dispatchEvent(new TouchEvent('touchend', { bubbles: true }));
      root.dispatchEvent(new Event('scrollend', { bubbles: true }));
    });
    await expect(feed).toHaveAttribute('data-controller-active', '0');
    const startsAfterResettle = (await fakeLog(page)).filter((entry) => entry.index === 0 && entry.method === 'playVideo').length;
    await page.waitForTimeout(100);
    expect((await fakeLog(page)).filter((entry) => entry.index === 0 && entry.method === 'playVideo')).toHaveLength(startsAfterResettle);
    await expect(feed).toHaveAttribute('data-controller-active', '0');
    const activeLayer = page.locator('.shorts-card.is-active .shorts-player-layer');
    const facade = page.locator('.shorts-card.is-active .shorts-facade');
    await expect(activeLayer).toHaveAttribute('data-player-phase', 'blocked');
    await expect(facade.locator('.shorts-tap')).toContainText('TAP TO PLAY');

    const constructsBefore = (await fakeLog(page)).filter((entry) => entry.index === 0 && entry.method === 'construct').length;
    await facade.click();
    await expect.poll(async () => (
      await fakeLog(page)
    ).filter((entry) => entry.index === 0 && entry.method === 'construct').length).toBeGreaterThan(constructsBefore);
    await expect(activeLayer).toHaveClass(/is-revealed/);
    await expect(page.locator('.shorts-card.is-active .shorts-startup-surface')).toBeHidden();
  });

  test('a destroyed old-generation player cannot overwrite a replacement lease', async ({ page }) => {
    await installFakeYouTube(page, {
      blockAudible: false,
      stalePlayingAfterDestroyIndex: 1,
      stalePlayingDelayMs: 800,
    });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await setNativeSound(page, true, 74);

    await swipeTo(page, 1);
    const oldIdentity = await activeLeaseIdentity(page);
    await swipeTo(page, 8);
    await expect.poll(async () => (
      await fakeLog(page)
    ).some((entry) => entry.index === 1 && entry.method === 'destroy')).toBe(true);
    await swipeTo(page, 1);
    const replacementIdentity = await activeLeaseIdentity(page);
    expect(replacementIdentity.generation).toBeGreaterThan(oldIdentity.generation);
    // Returning from outside the pool rebuilds this iframe asynchronously, so
    // the original swipe gesture is no longer eligible for sound. It must move
    // muted while preserving the retained preference for the next gesture.
    await expect.poll(() => page.evaluate((index) => (
      (window as any).__PUBCRAWL_FAKE_YT__?.sound(index)
    ), replacementIdentity.index)).toEqual({ muted: true, volume: 74 });

    await expect.poll(async () => (
      await fakeLog(page)
    ).some((entry) => (
      entry.index === oldIdentity.index &&
      entry.generation === oldIdentity.generation &&
      entry.method === 'stalePlayingCallback'
    )), { timeout: 2_000 }).toBe(true);
    await expect(page.locator('.shorts-feed')).toHaveAttribute(
      'data-controller-lease',
      `${replacementIdentity.index}:${replacementIdentity.generation}`,
    );
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 74 }),
    );
    await expect.poll(() => page.evaluate((index) => (
      (window as any).__PUBCRAWL_FAKE_YT__?.sound(index)
    ), replacementIdentity.index)).toEqual({ muted: true, volume: 74 });
  });

  test('generationless prepared callbacks cannot overwrite a replacement lease', async ({ page }) => {
    await installFakeYouTube(page, {
      blockAudible: false,
      stalePreparedCallbackIndex: 3,
      stalePlayingDelayMs: 900,
    });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await setNativeSound(page, true, 74);

    // Index 3 is prepared by the initial forward pool but is never leased.
    // Moving far enough evicts it; returning creates a new player at the same
    // array position while the old generationless callbacks are still queued.
    await swipeTo(page, 8);
    await expect.poll(async () => (
      await fakeLog(page)
    ).some((entry) => entry.index === 3 && entry.method === 'destroy')).toBe(true);
    await swipeTo(page, 3);
    const replacement = await activeLeaseIdentity(page);
    const startsBeforeStaleCallbacks = (await fakeLog(page)).filter((entry) => (
      entry.index === replacement.index &&
      entry.shortId === replacement.shortId &&
      entry.generation === replacement.generation &&
      entry.method === 'playVideo'
    )).length;

    await expect.poll(async () => (
      await fakeLog(page)
    ).filter((entry) => (
      entry.index === 3 &&
      entry.generation === null &&
      /stalePrepared(Buffering|Playing)Callback/.test(entry.method)
    )).length, { timeout: 2_500 }).toBe(2);

    await expect(page.locator('.shorts-feed')).toHaveAttribute(
      'data-controller-lease',
      `${replacement.index}:${replacement.generation}`,
    );
    await expect(page.locator('.shorts-card.is-active .shorts-player-layer')).toHaveClass(/is-revealed/);
    await expect(page.locator('.shorts-card.is-active .shorts-startup-surface')).toBeHidden();
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 74 }),
    );
    const startsAfterStaleCallbacks = (await fakeLog(page)).filter((entry) => (
      entry.index === replacement.index &&
      entry.shortId === replacement.shortId &&
      entry.generation === replacement.generation &&
      entry.method === 'playVideo'
    )).length;
    expect(startsAfterStaleCallbacks).toBe(startsBeforeStaleCallbacks);
  });

});

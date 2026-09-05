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

  test('retains native YouTube sound through a reload and the next eligible swipe', async ({ page }) => {
    await installFakeYouTube(page, { blockAudible: true, blockAudibleCount: 1 });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);

    await setNativeSound(page, true, 63);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 63 }),
    );

    await page.reload();
    await expect(page.locator('.shorts-feed')).toBeVisible({ timeout: 20_000 });
    await waitForFirstPlay(page);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 63 }),
    );
    const reloadedIndex = await activeIndex(page);
    await expect.poll(() => page.evaluate((index) => (
      (window as any).__PUBCRAWL_FAKE_YT__?.sound(index)
    ), reloadedIndex)).toEqual({ muted: true, volume: 63 });
    await expect(page.locator('.shorts-card.is-active .shorts-startup-surface')).toBeHidden();

    await swipeTo(page, 1);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound(1))).toEqual({
      muted: true,
      volume: 63,
    });
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 63 }),
    );

    // The first audible request on this iframe is policy-blocked. After one
    // muted handoff, revisiting the still-prepared player is the next eligible
    // gesture and restores the retained session preference without a control
    // click.
    await swipeTo(page, 2);
    await swipeTo(page, 1);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound(1))).toEqual({
      muted: false,
      volume: 63,
    });
  });

  test('retains native sound across a mouse or trackpad scrollend settlement', async ({ page }) => {
    await installFakeYouTube(page, { blockAudible: true, blockAudibleCount: 1 });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);

    await setNativeSound(page, true, 81);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 81 }),
    );

    await scrollToWithoutTouch(page, 1);

    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound(1))).toEqual({
      muted: true,
      volume: 81,
    });
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 81 }),
    );
    let targetEvents = (await fakeLog(page)).filter((entry) => entry.index === 1);
    expect(targetEvents.some((entry) => entry.method === 'unMute')).toBe(true);
    expect(targetEvents.some((entry) => entry.method === 'mute')).toBe(true);
    expect(targetEvents.filter((entry) => entry.method === 'playVideo')).toHaveLength(2);

    // The policy-blocked handoff must keep moving muted without erasing the
    // session intent. A later passive scrollend then receives retained sound
    // without another native-control click.
    await scrollToWithoutTouch(page, 2);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound(2))).toEqual({
      muted: false,
      volume: 81,
    });
    targetEvents = (await fakeLog(page)).filter((entry) => entry.index === 2);
    expect(targetEvents.some((entry) => entry.method === 'unMute')).toBe(true);
    expect(targetEvents.some((entry) => entry.method === 'playVideo')).toBe(true);
  });

  test('does not let a newly cued iframe poison retained sound with an unmuted zero-volume state', async ({ page }) => {
    await installFakeYouTube(page, { blockAudible: false, resetSoundToZeroOnCue: true });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);

    const first = await activeIndex(page);
    await expect.poll(() => page.evaluate((index) => (window as any).__PUBCRAWL_FAKE_YT__?.sound(index), first)).toEqual({
      muted: true,
      volume: 100,
    });

    // This single native YouTube action represents the user enabling sound.
    // No intermediate zero-volume preference may be stored.
    await setNativeSound(page, true, 76);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 76 }),
    );

    await swipeTo(page, 1);

    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound(1))).toEqual({
      muted: false,
      volume: 76,
    });
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 76 }),
    );
    const targetEvents = (await fakeLog(page)).filter((entry) => entry.index === 1);
    expect(targetEvents.some((entry) => entry.method === 'setVolume' && entry.value === 76)).toBe(true);
    expect(targetEvents.some((entry) => entry.method === 'unMute')).toBe(true);
  });

  test('applies the retained level after unmuting when an iframe ignores volume while muted', async ({ page }) => {
    await installFakeYouTube(page, {
      blockAudible: false,
      resetSoundToZeroOnCue: true,
      ignoreVolumeWhileMuted: true,
    });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);

    const first = await activeIndex(page);
    await setNativeSound(page, true, 78);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 78 }),
    );

    await swipeTo(page, 1);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound(1))).toEqual({
      muted: false,
      volume: 78,
    });

    const events = (await fakeLog(page)).filter((entry) => entry.index === 1);
    const unmute = events.findIndex((entry) => entry.method === 'unMute');
    const retainedLevel = events.findIndex((entry, eventIndex) => (
      eventIndex > unmute && entry.method === 'setVolume' && entry.value === 78
    ));
    expect(first).toBeGreaterThanOrEqual(0);
    expect(unmute).toBeGreaterThanOrEqual(0);
    expect(retainedLevel).toBeGreaterThan(unmute);
  });

  test('repairs the exact unmuted-zero two-click state and retains one-click sound after scrolling', async ({ page }) => {
    await page.addInitScript(() => {
      if (window.top !== window) return;
      sessionStorage.setItem(
        'pubcrawl.shorts.sound.v1',
        JSON.stringify({ version: 1, desiredAudible: true, volume: 0 }),
      );
    });
    await installFakeYouTube(page, { blockAudible: false, resetSoundToZeroAfterPlaying: true });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);

    const first = await activeIndex(page);
    await expect.poll(() => page.evaluate((index) => (window as any).__PUBCRAWL_FAKE_YT__?.sound(index), first)).toEqual({
      muted: false,
      volume: 100,
    });
    // The contradictory old value is healed immediately without erasing the
    // user's audible intent. The native control must never render sound-on at
    // zero volume while waiting for a second click.
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 100 }),
    );
    const initialEvents = (await fakeLog(page)).filter((entry) => entry.index === first);
    const reset = initialEvents.findIndex((entry) => entry.method === 'postPlayingSoundReset');
    const primedVolume = initialEvents.findIndex((entry, eventIndex) => eventIndex > reset && entry.method === 'setVolume' && entry.value === 100);
    expect(reset).toBeGreaterThanOrEqual(0);
    expect(primedVolume).toBeGreaterThan(reset);

    // The native YouTube control is not physically reachable until the
    // opacity-gated iframe has revealed. Let the bounded audible verifier
    // finish as it would before an actual finger can hit that control.
    await expect(page.locator('.shorts-card.is-active .shorts-player-layer')).toHaveClass(/is-revealed/);
    await page.waitForTimeout(100);

    // From the repaired audible state, one click performs the expected mute;
    // one more performs the expected unmute. Neither click is consumed by a
    // hidden zero-volume repair.
    await toggleNativeSound(page);
    await expect.poll(() => page.evaluate((index) => (window as any).__PUBCRAWL_FAKE_YT__?.sound(index), first)).toEqual({
      muted: true,
      volume: 100,
    });
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: false, volume: 100 }),
    );

    await toggleNativeSound(page);
    await expect.poll(() => page.evaluate((index) => (window as any).__PUBCRAWL_FAKE_YT__?.sound(index), first)).toEqual({
      muted: false,
      volume: 100,
    });
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 100 }),
    );

    await swipeTo(page, 1);

    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound(1))).toEqual({
      muted: false,
      volume: 100,
    });
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 100 }),
    );
  });

  test('retains one native sound choice through ten forward and five backward handoffs', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);

    await toggleNativeSound(page);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 100 }),
    );

    const destinations = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 9, 8, 7, 6, 5];
    for (const destination of destinations) {
      await swipeTo(page, destination);
      await expect.poll(() => page.evaluate((index) => (
        (window as any).__PUBCRAWL_FAKE_YT__?.sound(index)
      ), destination)).toEqual({ muted: false, volume: 100 });
      await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
        JSON.stringify({ version: 1, desiredAudible: true, volume: 100 }),
      );
      const identity = await activeLeaseIdentity(page);
      const states = await fakeStates(page);
      expect(states.length).toBeLessThanOrEqual(5);
      expect(states.filter((player) => player.state === 1).map((player) => player.index)).toEqual([destination]);
      expect(states.filter((player) => !player.muted && player.volume > 0).map((player) => player.index)).toEqual([destination]);
      for (const player of states.filter((entry) => entry.index !== destination)) {
        expect(player.muted).toBe(true);
        expect(player.state).not.toBe(1);
      }
      const activeStarts = (await fakeLog(page)).filter((entry) => (
        entry.index === identity.index &&
        entry.shortId === identity.shortId &&
        entry.generation === identity.generation &&
        entry.method === 'playVideo'
      ));
      expect(activeStarts).toHaveLength(1);
    }

    const nativeControlEvents = (await fakeLog(page)).filter((entry) => (
      entry.method === 'nativeUnmute' || entry.method === 'nativeMute'
    ));
    expect(nativeControlEvents).toHaveLength(1);
  });

  test('retains native sound when touchend happens before iOS scroll snapping finishes', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);

    // Do not wait for the 250ms sound observer. The swipe's touchstart must
    // capture a just-changed native YouTube control before the old player is
    // muted and paused.
    await setNativeSound(page, true, 67);
    const feed = page.locator('.shorts-feed');
    await feed.evaluate((element) => {
      const root = element as HTMLElement;
      const blockNativeScrollEnd = (event: Event) => event.stopImmediatePropagation();
      root.addEventListener('scrollend', blockNativeScrollEnd, { capture: true });
      (root as HTMLElement & { __testScrollEndBlocker?: EventListener }).__testScrollEndBlocker = blockNativeScrollEnd;
      root.style.setProperty('scroll-snap-type', 'none', 'important');
      root.style.scrollBehavior = 'auto';
      for (const card of root.querySelectorAll<HTMLElement>('.shorts-card')) {
        card.style.setProperty('scroll-snap-align', 'none', 'important');
      }
      void root.offsetHeight;
      root.dispatchEvent(new TouchEvent('touchstart', { bubbles: true }));
      root.scrollTop = root.clientHeight * 0.6;
      root.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await expect.poll(() => feed.evaluate((element) => {
      const root = element as HTMLElement;
      return root.scrollTop / Math.max(1, root.clientHeight);
    })).toBeGreaterThanOrEqual(0.55);
    await page.waitForTimeout(40);
    await feed.evaluate((element) => {
      element.dispatchEvent(new TouchEvent('touchend', { bubbles: true }));
    });
    const leaseAfterTouchEnd = await feed.getAttribute('data-controller-lease');
    await expect(feed).toHaveAttribute('data-controller-active', '1');

    // Mandatory snapping completes after touchend on physical iOS. Its later
    // scrollend must finalize the same lease without replacing the audible
    // start or issuing a duplicate command.
    for (const progress of [0.72, 0.86, 1]) {
      await feed.evaluate((element, nextProgress) => {
        const root = element as HTMLElement;
        root.scrollTop = root.clientHeight * nextProgress;
        root.dispatchEvent(new Event('scroll', { bubbles: true }));
      }, progress);
      await page.waitForTimeout(20);
    }
    await feed.evaluate((element) => {
      const root = element as HTMLElement;
      const testRoot = root as HTMLElement & { __testScrollEndBlocker?: EventListener };
      if (testRoot.__testScrollEndBlocker) {
        root.removeEventListener('scrollend', testRoot.__testScrollEndBlocker, { capture: true });
        delete testRoot.__testScrollEndBlocker;
      }
      root.style.removeProperty('scroll-snap-type');
      for (const card of root.querySelectorAll<HTMLElement>('.shorts-card')) {
        card.style.removeProperty('scroll-snap-align');
      }
      root.dispatchEvent(new Event('scrollend', { bubbles: true }));
    });
    await expect(feed).toHaveAttribute('data-controller-active', '1');
    await expect(feed).toHaveAttribute('data-controller-phase', 'idle');
    await expect(feed).toHaveAttribute('data-controller-lease', leaseAfterTouchEnd || '');
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 67 }),
    );

    const targetEvents = (await fakeLog(page)).filter((entry) => entry.index === 1);
    const unmute = targetEvents.findIndex((entry) => entry.method === 'unMute');
    const play = targetEvents.findIndex((entry, eventIndex) => eventIndex > unmute && entry.method === 'playVideo');
    expect(unmute).toBeGreaterThanOrEqual(0);
    expect(play).toBeGreaterThan(unmute);
    expect(targetEvents.filter((entry) => entry.method === 'playVideo')).toHaveLength(1);
    expect(targetEvents.some((entry) => entry.method === 'setVolume' && entry.value === 67)).toBe(true);
    expect(targetEvents.slice(unmute + 1).some((entry) => entry.method === 'mute')).toBe(false);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound(1))).toEqual({ muted: false, volume: 67 });
  });

  test('captures a native mute immediately before the next swipe', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await setNativeSound(page, true, 62);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toContain('"desiredAudible":true');
    await setNativeSound(page, false, 62);

    await swipeTo(page, 1);

    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: false, volume: 62 }),
    );
    const targetEvents = (await fakeLog(page)).filter((entry) => entry.index === 1);
    expect(targetEvents.some((entry) => entry.method === 'unMute')).toBe(false);
    expect(targetEvents.some((entry) => entry.method === 'playVideo')).toBe(true);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound(1))).toEqual({ muted: true, volume: 62 });
  });

  test('manual playback mode never turns a retained sound preference into swipe autoplay', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');

    const firstFacade = page.locator('.shorts-card.is-active .shorts-facade');
    await expect(firstFacade.locator('.shorts-tap')).toContainText('TAP TO PLAY');
    await firstFacade.click();
    await waitForFirstPlay(page);
    await setNativeSound(page, true, 58);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toContain('"desiredAudible":true');

    await swipeTo(page, 1);
    await page.waitForTimeout(300);

    expect((await fakeLog(page)).filter((entry) => entry.index === 1 && entry.method === 'playVideo')).toHaveLength(0);
    await expect(page.locator('.shorts-card.is-active .shorts-tap')).toContainText('TAP TO PLAY');
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
    const revisitLogStart = (await fakeLog(page)).length;
    await swipeTo(page, 1);
    await expect.poll(async () => (await fakeLog(page)).filter((entry) => entry.index === 1 && entry.method === 'playVideo').length).toBeGreaterThan(2);
    await expect(page.locator('.shorts-card.is-active .shorts-startup-surface')).toBeHidden();
    const identity = await activeLeaseIdentity(page);
    const revisitEvents = (await fakeLog(page)).slice(revisitLogStart).filter((entry) => (
      entry.index === identity.index &&
      entry.shortId === identity.shortId &&
      entry.generation === identity.generation
    ));
    expect(revisitEvents.some((entry) => entry.method === 'unMute')).toBe(true);
    expect(revisitEvents.some((entry) => entry.method === 'playVideo')).toBe(true);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound(1))).toEqual({
      muted: false,
      volume: 71,
    });
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 71 }),
    );
  });

  test('audible buffering then pauses recovers to muted motion without another tap', async ({ page }) => {
    await installFakeYouTube(page, {
      blockAudible: false,
      bufferThenPauseIndex: 1,
      bufferThenPauseCount: 1,
    });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await setNativeSound(page, true, 67);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 67 }),
    );

    await swipeTo(page, 1);

    await expect.poll(async () => (
      await fakeLog(page)
    ).filter((entry) => entry.index === 1 && entry.method === 'playVideo').length).toBe(2);
    await expect(page.locator('.shorts-card.is-active .shorts-player-layer')).toHaveClass(/is-revealed/);
    await expect(page.locator('.shorts-card.is-active .shorts-startup-surface')).toBeHidden();
    await expect(page.locator('.shorts-card.is-active .shorts-tap')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound(1))).toEqual({
      muted: true,
      volume: 67,
    });
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 67 }),
    );
    await page.waitForTimeout(400);
    expect((await fakeLog(page)).filter((entry) => entry.index === 1 && entry.method === 'playVideo')).toHaveLength(2);
  });

  test('delayed policy block after audible PLAYING falls back once to muted motion', async ({ page }) => {
    await installFakeYouTube(page, {
      blockAudible: false,
      delayedAutoplayBlockedAfterAudiblePlayMs: 350,
    });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await setNativeSound(page, true, 66);

    await swipeTo(page, 1);
    await expect.poll(async () => (
      await fakeLog(page)
    ).some((entry) => entry.index === 1 && entry.method === 'autoplayBlocked'), { timeout: 2_000 }).toBe(true);
    await expect.poll(async () => (
      await fakeLog(page)
    ).filter((entry) => entry.index === 1 && entry.method === 'playVideo').length).toBe(2);
    await expect(page.locator('.shorts-card.is-active .shorts-player-layer')).toHaveClass(/is-revealed/);
    await expect(page.locator('.shorts-card.is-active .shorts-startup-surface')).toBeHidden();
    await expect(page.locator('.shorts-card.is-active .shorts-tap')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound(1))).toEqual({
      muted: true,
      volume: 66,
    });
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 66 }),
    );
    await page.waitForTimeout(450);
    expect((await fakeLog(page)).filter((entry) => entry.index === 1 && entry.method === 'playVideo')).toHaveLength(2);
  });

  test('keeps retained sound when WebKit allows motion but silently strips audio', async ({ page }) => {
    await installFakeYouTube(page, { blockAudible: false, silentlyMuteAudiblePlay: true });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await setNativeSound(page, true, 71);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 71 }),
    );

    await swipeTo(page, 1);
    await page.waitForTimeout(350);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound(1))).toEqual({
      muted: true,
      volume: 71,
    });
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 71 }),
    );
    const firstTargetEvents = (await fakeLog(page)).filter((entry) => entry.index === 1);
    expect(firstTargetEvents.filter((entry) => entry.method === 'playVideo')).toHaveLength(1);
    expect(firstTargetEvents.some((entry) => entry.method === 'audiblePlaySilentlyMuted')).toBe(true);
    await expect(page.locator('.shorts-card.is-active .shorts-startup-surface')).toBeHidden();

    await swipeTo(page, 2);
    await page.waitForTimeout(350);
    const secondTargetEvents = (await fakeLog(page)).filter((entry) => entry.index === 2);
    expect(secondTargetEvents.some((entry) => entry.method === 'unMute')).toBe(true);
    expect(secondTargetEvents.some((entry) => entry.method === 'playVideo')).toBe(true);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 71 }),
    );
  });

  test('a delayed duplicate autoplay-block event cannot stop recovered muted motion', async ({ page }) => {
    await installFakeYouTube(page, {
      blockAudible: false,
      silentlyMuteAudiblePlay: true,
      delayedAutoplayBlockedAfterMutedPlayMs: 350,
    });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await setNativeSound(page, true, 72);

    await swipeTo(page, 1);
    await expect.poll(async () => (
      await fakeLog(page)
    ).some((entry) => entry.index === 1 && entry.method === 'autoplayBlocked'), { timeout: 2_000 }).toBe(true);
    await expect(page.locator('.shorts-card.is-active .shorts-player-layer')).toHaveClass(/is-revealed/);
    await expect(page.locator('.shorts-card.is-active .shorts-startup-surface')).toBeHidden();
    await expect(page.locator('.shorts-card.is-active .shorts-tap')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound(1))).toEqual({
      muted: true,
      volume: 72,
    });
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 72 }),
    );
  });

  test('native unmute then native mute retires an earlier policy fallback', async ({ page }) => {
    await installFakeYouTube(page, { blockAudible: true, blockAudibleCount: 1 });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await setNativeSound(page, true, 73);
    await swipeTo(page, 1);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound(1))).toEqual({
      muted: true,
      volume: 73,
    });

    await toggleNativeSound(page);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound(1))).toEqual({
      muted: false,
      volume: 73,
    });
    await page.waitForTimeout(300);
    await toggleNativeSound(page);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: false, volume: 73 }),
    );

    await swipeTo(page, 2);
    const targetEvents = (await fakeLog(page)).filter((entry) => entry.index === 2);
    expect(targetEvents.some((entry) => entry.method === 'unMute')).toBe(false);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound(2))).toEqual({
      muted: true,
      volume: 73,
    });
  });

  test('a native mute during confirmed audible buffering becomes the next-session-scroll preference', async ({ page }) => {
    await installFakeYouTube(page, {
      blockAudible: false,
      bufferAudibleBeforePlayingMs: 600,
    });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await setNativeSound(page, true, 69);

    await swipeTo(page, 1);
    await expect.poll(async () => (
      await fakeLog(page)
    ).some((entry) => entry.index === 1 && entry.method === 'audibleBuffering')).toBe(true);
    await setNativeSound(page, false, 69);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: false, volume: 69 }),
    );
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound(1))).toEqual({
      muted: true,
      volume: 69,
    });
  });

  test('an unready touch destination moves muted later and retries retained sound on the next swipe', async ({ page }) => {
    await installFakeYouTube(page, {
      blockAudible: false,
      // Index 4 sits just outside the initial directional five-player pool,
      // so its manual readiness cannot expire during a slow WebKit suite
      // before this test actually scrolls to it.
      manualReadyIndex: 4,
    });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await setNativeSound(page, true, 68);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toContain('"desiredAudible":true');

    await swipeTo(page, 4);
    await expect.poll(() => page.evaluate(() => (
      (window as any).__PUBCRAWL_FAKE_YT__?.states() || []
    ).some((entry: { index: number }) => entry.index === 4))).toBe(true);
    expect((await fakeLog(page)).some((entry) => entry.index === 4 && entry.method === 'playVideo')).toBe(false);
    await page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.ready(4));
    await expect.poll(async () => (
      await fakeLog(page)
    ).filter((entry) => entry.index === 4 && entry.method === 'playVideo').length, { timeout: 3_000 }).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound(4))).toEqual({
      muted: true,
      volume: 68,
    });
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 68 }),
    );

    await swipeTo(page, 5);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound(5))).toEqual({
      muted: false,
      volume: 68,
    });
  });

});

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

  test('passive native-scrollend handoffs keep every destination moving automatically', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);

    const destinations = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 9, 8, 7, 6, 5];
    for (const destination of destinations) {
      await scrollToWithoutTouch(page, destination);
      await expect(page.locator('.shorts-card.is-active .shorts-player-layer')).toHaveClass(/is-revealed/);
      await expect(page.locator('.shorts-card.is-active .shorts-startup-surface')).toBeHidden();
      await expect(page.locator('.shorts-card.is-active .shorts-tap')).toHaveCount(0);
      const states = await fakeStates(page);
      expect(states.filter((player) => player.state === 1).map((player) => player.index)).toEqual([destination]);
      expect(states.filter((player) => !player.muted && player.volume > 0)).toHaveLength(0);
    }
  });

  test('coarse-pointer swipe surface wires feed touch handlers while native control strips stay exposed', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);

    const sourceIndex = await activeIndex(page);
    const surface = page.locator(`.shorts-card[data-short-index="${sourceIndex}"] .shorts-swipe-surface`);
    await expect(surface).toBeVisible();
    const geometry = await page.evaluate(() => {
      const overlay = document.querySelector<HTMLElement>('.shorts-card.is-active .shorts-swipe-surface');
      const media = document.querySelector<HTMLElement>('.shorts-card.is-active .shorts-player-frame');
      if (!overlay || !media) return null;
      const overlayRect = overlay.getBoundingClientRect();
      const mediaRect = media.getBoundingClientRect();
      return {
        pointerEvents: getComputedStyle(overlay).pointerEvents,
        topGap: overlayRect.top - mediaRect.top,
        bottomGap: mediaRect.bottom - overlayRect.bottom,
      };
    });
    expect(geometry).not.toBeNull();
    expect(geometry!.pointerEvents).toBe('auto');
    expect(geometry!.topGap).toBeGreaterThanOrEqual(60);
    expect(geometry!.bottomGap).toBeGreaterThanOrEqual(92);

    await setNativeSound(page, true, 75);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 75 }),
    );
    const feed = page.locator('.shorts-feed');
    await surface.evaluate((element) => {
      const root = element.closest<HTMLElement>('.shorts-feed')!;
      root.style.setProperty('scroll-snap-type', 'none', 'important');
      for (const card of root.querySelectorAll<HTMLElement>('.shorts-card')) {
        card.style.setProperty('scroll-snap-align', 'none', 'important');
      }
      void root.offsetHeight;
      element.dispatchEvent(new TouchEvent('touchstart', { bubbles: true }));
      root.scrollTop = root.clientHeight;
      root.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await page.waitForTimeout(40);
    await surface.evaluate((element) => element.dispatchEvent(new TouchEvent('touchend', { bubbles: true })));
    await expect(feed).toHaveAttribute('data-controller-active', '1');
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound(1))).toEqual({
      muted: false,
      volume: 75,
    });
    await expect(page.locator('.shorts-card.is-active .shorts-player-layer')).toHaveClass(/is-revealed/);
  });

  test('same-card snap-back and natural looping preserve one revealed iframe', async ({ page }) => {
    await installFakeYouTube(page, { loopProgressDelayMs: 700 });
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

    // A slow platform loop can remain at time zero beyond the old one-shot
    // 350ms latch check. Once motion arrives, a later ENDED event must still
    // own exactly one additional seek/play pair.
    await page.waitForTimeout(850);
    const secondLoopBefore = (await fakeLog(page)).length;
    await page.evaluate((active) => {
      (window as any).__PUBCRAWL_FAKE_YT__?.emit(active, 0);
      (window as any).__PUBCRAWL_FAKE_YT__?.emit(active, 0);
    }, index);
    await expect.poll(async () => (
      await fakeLog(page)
    ).slice(secondLoopBefore).filter((entry) => entry.index === index && entry.method === 'playVideo').length).toBe(1);
    const secondLoopEvents = (await fakeLog(page)).slice(secondLoopBefore).filter((entry) => entry.index === index);
    expect(secondLoopEvents.filter((entry) => entry.method === 'seekTo')).toHaveLength(1);
    expect(secondLoopEvents.some((entry) => /cueVideoById|loadVideoById|destroy/.test(entry.method))).toBe(false);
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

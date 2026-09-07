import { test, expect } from '@playwright/test';
import { openRoute, seedStableDevice } from './helpers';
import {
  activeIndex,
  fakeLog,
  installFakeYouTube,
  setNativeSound,
  swipeTo,
  waitForFirstPlay,
} from './fixtures/shortsFakeYouTube';

test.describe('Shorts single-player route', () => {
  // Intercepted metrics belong to this fake-player fixture, not a service
  // worker. The separate preview suite exercises the real worker lifecycle.
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });

  test('renders one native-control iframe with no Make This or PubCrawl sound UI', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);

    await expect(page.locator('.shorts-player-host iframe')).toHaveCount(1);
    await expect(page.locator('.shorts-sound-toggle, .shorts-sound-prompt, .shorts-tap, .shorts-make, [aria-label*="Make This"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Share' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Previous Short' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Next Short' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Show Shorts tutorial' })).toHaveCount(1);
  });

  test('keeps the same iframe while navigating and preserves native sound preference', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    const instance = (await fakeLog(page)).find((entry) => entry.method === 'construct')?.instanceId;

    await setNativeSound(page, true, 72);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 72 }),
    );
    await swipeTo(page, 1);
    await expect(page.locator('.shorts-player-host iframe')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound())).toEqual({ muted: false, volume: 72 });
    const events = (await fakeLog(page)).filter((entry) => entry.shortId && entry.index === 1);
    expect(events.some((entry) => entry.method === 'loadVideoById')).toBe(true);
    expect(events.some((entry) => entry.method === 'unMute')).toBe(true);
    expect(events.some((entry) => entry.method === 'playVideo')).toBe(false);
    expect(new Set((await fakeLog(page)).filter((entry) => entry.method === 'construct').map((entry) => entry.instanceId))).toEqual(new Set([instance]));
  });

  test('issues one load per navigation generation and ignores late callbacks from the previous video', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);

    for (let index = 1; index <= 3; index += 1) await swipeTo(page, index);
    const before = await fakeLog(page);
    const loads = before.filter((entry) => entry.method === 'loadVideoById');
    expect(loads.length).toBe(3);
    const perGeneration = new Map<string, number>();
    for (const entry of loads) {
      const key = `${entry.shortId}:${entry.generation}`;
      perGeneration.set(key, (perGeneration.get(key) || 0) + 1);
    }
    expect([...perGeneration.values()]).toEqual([1, 1, 1]);

    const current = await page.locator('.shorts-card.is-active').getAttribute('data-short-id');
    const lease = await page.locator('.shorts-feed').getAttribute('data-controller-lease');
    const playCount = before.filter((entry) => entry.method === 'playVideo').length;
    await page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.staleCallbacks('previous-video-id'));

    await expect(page.locator('.shorts-card.is-active')).toHaveAttribute('data-short-id', current || '');
    await expect(page.locator('.shorts-feed')).toHaveAttribute('data-controller-lease', lease || '');
    await expect(page.locator('.shorts-player-layer')).toHaveClass(/is-revealed/);
    const after = await fakeLog(page);
    expect(after.filter((entry) => entry.method === 'playVideo').length).toBe(playCount);
    expect(after.filter((entry) => entry.method === 'loadVideoById')).toHaveLength(loads.length);
    expect(after.filter((entry) => entry.method === 'construct')).toHaveLength(1);
  });

  test('delayed sound acknowledgments and load resets cannot erase the saved native preference', async ({ page }) => {
    await installFakeYouTube(page, { soundAckDelayMs: 1200, resetSoundToZeroOnLoad: true });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await expect(page.locator('.shorts-player-layer')).toHaveAttribute('data-sound-acknowledged', 'true');
    await setNativeSound(page, true, 81);
    await swipeTo(page, 1);
    // Motion can precede API sound acknowledgment by more than the retired
    // 700ms guard. Neither polling nor the next navigation may learn zero.
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toBe(
      JSON.stringify({ version: 1, desiredAudible: true, volume: 81 }),
    );
    await expect(page.locator('.shorts-player-layer')).toHaveAttribute('data-sound-acknowledged', 'false');
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('pubcrawl.shorts.sound.v1')!))).toEqual({ version: 1, desiredAudible: true, volume: 81 });
    await swipeTo(page, 2);
    await expect(page.locator('.shorts-player-layer')).toHaveAttribute('data-sound-acknowledged', 'true');
    expect(await page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound())).toEqual({ muted: false, volume: 81 });
    expect((await fakeLog(page)).filter(entry => entry.method === 'construct')).toHaveLength(1);
  });

  test('automatically moves through ten forward and five backward destinations', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    for (let index = 1; index <= 10; index += 1) {
      await swipeTo(page, index);
      expect(await activeIndex(page)).toBe(index);
      await expect(page.locator('.shorts-player-layer')).toHaveClass(/is-revealed/);
    }
    for (let index = 9; index >= 5; index -= 1) {
      await swipeTo(page, index);
      expect(await activeIndex(page)).toBe(index);
      await expect(page.locator('.shorts-player-layer')).toHaveClass(/is-revealed/);
    }
    expect(await page.locator('.shorts-player-host iframe').count()).toBe(1);
  });

  test('uses centered loading before readiness and adjacent status without covering ready controls', async ({ page }) => {
    await installFakeYouTube(page, { readyDelayMs: 500, startDelayMs: 1_200 });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await expect(page.locator('.shorts-initial-status')).toHaveText('LOADING..');
    await expect(page.locator('.shorts-player-layer')).toHaveAttribute('data-player-ready', 'true');
    await expect(page.locator('.shorts-initial-status')).toHaveCount(0);
    await expect(page.locator('.shorts-status')).toHaveText('LOADING..');
    await expect(page.locator('.shorts-player-layer')).toHaveClass(/is-revealed/, { timeout: 4_000 });
    await expect(page.locator('.shorts-status')).toBeEmpty();
  });

  test('latest navigation wins when the single player becomes ready late', async ({ page }) => {
    await installFakeYouTube(page, { readyDelayMs: 1500, startDelayMs: 40 });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await expect(page.locator('.shorts-feed')).toHaveAttribute('data-layout-ready', 'true');
    await expect(page.locator('.shorts-player-layer')).toHaveAttribute('data-player-ready', 'false');
    await page.locator('.shorts-feed').evaluate(element => element.scrollTo({ top: element.clientHeight * 4, behavior: 'instant' }));
    await expect(page.locator('.shorts-feed')).toHaveAttribute('data-controller-active', '4');
    await waitForFirstPlay(page);
    const state = await page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.state());
    expect(state?.shortId).toBe(await page.locator('.shorts-card.is-active').getAttribute('data-short-id'));
    expect((await fakeLog(page)).filter((entry) => entry.method === 'construct')).toHaveLength(1);
  });

  test('audible autoplay rejection falls back to muted motion without a second control', async ({ page }) => {
    await installFakeYouTube(page, { blockAudible: true, blockAudibleCount: 1 });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await setNativeSound(page, true, 68);
    await swipeTo(page, 1);
    await expect.poll(() => page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.sound())).toEqual({ muted: true, volume: 68 });
    await expect(page.locator('.shorts-player-layer')).toHaveClass(/is-revealed/);
    await expect(page.locator('.shorts-tap, .shorts-sound-toggle, .shorts-sound-prompt')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pubcrawl.shorts.sound.v1'))).toContain('"desiredAudible":true');
  });

  test('does not retry forever when both audible and muted autoplay are blocked', async ({ page }) => {
    await installFakeYouTube(page, { blockAudible: true, blockAudibleCount: 20 });
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await setNativeSound(page, true, 68);
    await page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.setRejectMutedStarts(true));
    await page.locator('.shorts-feed').evaluate(element => element.scrollTo({ top: element.clientHeight, behavior: 'instant' }));
    await expect(page.locator('.shorts-status')).toHaveText('AUTOPLAY BLOCKED · USE THE VIDEO CONTROLS', { timeout: 3_000 });
    await page.waitForTimeout(1_700);
    const logs = await fakeLog(page);
    expect(logs.filter((entry) => entry.method === 'playVideo').length).toBeLessThanOrEqual(3);
    expect(logs.filter((entry) => entry.method === 'construct')).toHaveLength(1);
    await expect(page.locator('.shorts-player-layer')).toHaveAttribute('data-player-ready', 'true');
  });

  test('an unavailable video reports an error without rebuilding the iframe or navigating away', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    const current = await page.locator('.shorts-card.is-active').getAttribute('data-short-id');
    const before = await fakeLog(page);
    await page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.error(150));
    await expect(page.locator('.shorts-status')).toHaveText('VIDEO UNAVAILABLE');
    await expect(page.locator('.shorts-card.is-active')).toHaveAttribute('data-short-id', current || '');
    const after = await fakeLog(page);
    expect(after.filter((entry) => entry.method === 'construct')).toHaveLength(before.filter((entry) => entry.method === 'construct').length);
    expect(after.filter((entry) => entry.method === 'loadVideoById')).toHaveLength(before.filter((entry) => entry.method === 'loadVideoById').length);
  });

  test('offline startup keeps the route available and recovers when connectivity returns', async ({ page, context }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await context.setOffline(true);
    await expect(page.locator('.shorts-status')).toContainText('OFFLINE', { timeout: 3_000 });
    await expect(page.locator('.shorts-player-host iframe')).toHaveCount(1);

    await context.setOffline(false);
    await waitForFirstPlay(page);
    await expect(page.locator('.shorts-player-host iframe')).toHaveCount(1);
    await expect(page.locator('.shorts-player-layer')).toHaveClass(/is-revealed/);
  });

  test('natural looping seeks and resumes one iframe without a black restart', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    const before = (await fakeLog(page)).length;
    await page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.end());
    await expect.poll(async () => (await fakeLog(page)).slice(before).filter((entry) => entry.method === 'seekTo').length).toBe(1);
    await expect.poll(async () => (await fakeLog(page)).slice(before).filter((entry) => entry.method === 'playVideo').length).toBe(1);
    expect((await fakeLog(page)).slice(before).some((entry) => entry.method === 'loadVideoById' || entry.method === 'construct' || entry.method === 'destroy')).toBe(false);
    await expect(page.locator('.shorts-player-layer')).toHaveClass(/is-revealed/);
  });

  test('leaving Shorts destroys the iframe and leaves no hidden player behind', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await page.getByRole('link', { name: 'Watch' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-route', 'watch');
    await expect(page.locator('.shorts-player-host iframe')).toHaveCount(0);
    await expect(page.locator('body > .mobile-bottom-nav')).toBeVisible();
  });

  test('same-route deep links reuse the player and obsolete make parameters have no workflow', async ({ page }) => {
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    const destination = await page.locator('.shorts-card').nth(4).getAttribute('data-short-id');
    await page.evaluate(id => { location.hash = `/shorts?v=${id}&src=deep-link&make=1`; }, destination);
    await expect(page.locator('.shorts-feed')).toHaveAttribute('data-controller-active', '4');
    await expect(page.locator('.shorts-player-layer')).toHaveClass(/is-revealed/);
    expect((await fakeLog(page)).filter(entry => entry.method === 'construct')).toHaveLength(1);
    expect((await fakeLog(page)).filter(entry => entry.method === 'loadVideoById')).toHaveLength(1);
    await expect(page.locator('.shorts-recipe-modal,.shorts-make')).toHaveCount(0);
  });

  test('natural loops do not count as starts and route leave flushes one metrics session', async ({ page }) => {
    const sessions: any[] = [];
    await page.route('**/api/shorts/session', async route => {
      sessions.push(route.request().postDataJSON());
      await route.fulfill({ json: { ok: true } });
    });
    await installFakeYouTube(page);
    await seedStableDevice(page);
    await openRoute(page, '/#/shorts');
    await waitForFirstPlay(page);
    await swipeTo(page, 1);
    await page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.end());
    await expect.poll(async () => (await fakeLog(page)).filter(e => e.method === 'seekTo').length).toBe(1);
    await page.getByRole('link', { name: 'Watch', exact: true }).click();
    await expect.poll(() => sessions.length).toBe(1);
    expect(sessions[0]).toMatchObject({ videosStarted: 2, advances: 1, recipeClicks: 0 });
  });
});

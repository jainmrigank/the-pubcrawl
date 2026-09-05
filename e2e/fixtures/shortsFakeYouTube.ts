import { expect, type Page } from '@playwright/test';

export type FakePlayerOptions = {
  blockAudible: boolean;
  blockAudibleCount?: number;
  ignoreVolumeWhileMuted?: boolean;
  resetSoundToZeroOnCue?: boolean;
  resetSoundToZeroOnPlaying?: boolean;
  resetSoundToZeroAfterPlaying?: boolean;
  silentlyMuteAudiblePlay?: boolean;
  bufferAudibleBeforePlayingMs?: number;
  delayedAutoplayBlockedAfterMutedPlayMs?: number;
  delayedAutoplayBlockedAfterAudiblePlayMs?: number;
  stallReadyCount?: number;
  delayReadyIndex?: number;
  delayReadyMs?: number;
  manualReadyIndex?: number;
  accelerateInitializationTimeout?: boolean;
  blockPlayCount?: number;
  blockPlayIndex?: number;
  error5OnCueIndex?: number;
  error5OnPlayIndex?: number;
  accelerateErrorRetry?: boolean;
  bufferThenPauseCount?: number;
  bufferThenPauseIndex?: number;
  accelerateStartupStall?: boolean;
  stalePlayingAfterDestroyIndex?: number;
  stalePlayingDelayMs?: number;
  stalePreparedCallbackIndex?: number;
  loopProgressDelayMs?: number;
};

export type FakeLogEntry = {
  at: number;
  index: number;
  shortId: string;
  generation: number | null;
  method: string;
  value?: number;
};

/** Replace the network YouTube adapter with a deterministic iframe double. */
export async function installFakeYouTube(page: Page, options: FakePlayerOptions = { blockAudible: false }) {
  await page.addInitScript(({
    blockAudible,
    blockAudibleCount = 0,
    ignoreVolumeWhileMuted = false,
    resetSoundToZeroOnCue = false,
    resetSoundToZeroOnPlaying = false,
    resetSoundToZeroAfterPlaying = false,
    silentlyMuteAudiblePlay = false,
    bufferAudibleBeforePlayingMs = 0,
    delayedAutoplayBlockedAfterMutedPlayMs = 0,
    delayedAutoplayBlockedAfterAudiblePlayMs = 0,
    stallReadyCount = 0,
    delayReadyIndex = -1,
    delayReadyMs = 0,
    manualReadyIndex = -1,
    accelerateInitializationTimeout = false,
    blockPlayCount = 0,
    blockPlayIndex = -1,
    error5OnCueIndex = -1,
    error5OnPlayIndex = -1,
    accelerateErrorRetry = false,
    bufferThenPauseCount = 0,
    bufferThenPauseIndex = -1,
    accelerateStartupStall = false,
    stalePlayingAfterDestroyIndex = -1,
    stalePlayingDelayMs = 300,
    stalePreparedCallbackIndex = -1,
    loopProgressDelayMs = 0,
  }) => {
    type TestWindow = Window & {
      __PUBCRAWL_FAKE_YT_LOG__?: FakeLogEntry[];
      __PUBCRAWL_FAKE_YT__?: {
        nativeSound(index: number, audible: boolean, volume?: number): void;
        nativeToggle(index: number): void;
        sound(index: number): { muted: boolean; volume: number } | null;
        emit(index: number, state: number): void;
        error(index: number, code: number): void;
        autoplayBlocked(index: number, preserveState?: boolean): void;
        ready(index: number): void;
        states(): Array<{ index: number; state: number; muted: boolean; volume: number }>;
      };
    };
    const target = window as TestWindow;
    const log = target.__PUBCRAWL_FAKE_YT_LOG__ = [];
    const players = new Map<number, FakePlayer>();
    let constructed = 0;
    let cueErrorsEmitted = 0;
    let blockedPlaysEmitted = 0;
    let audibleBlocksEmitted = 0;
    if (accelerateInitializationTimeout || accelerateErrorRetry || accelerateStartupStall) {
      const nativeSetTimeout = window.setTimeout.bind(window);
      window.setTimeout = ((handler: TimerHandler, timeout = 0, ...args: unknown[]) => {
        let nextTimeout = timeout;
        if (accelerateInitializationTimeout && timeout === 12_000) nextTimeout = 40;
        if (accelerateErrorRetry && timeout === 1_500) nextTimeout = 40;
        if (accelerateStartupStall && timeout === 6_000) nextTimeout = 60;
        return nativeSetTimeout(handler, nextTimeout, ...args);
      }) as typeof window.setTimeout;
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
      private playErrorEmitted = false;
      private bufferedPauses = 0;
      private destroyed = false;
      private soundResetOnPlaying = false;
      private soundResetAfterPlaying = false;
      private audiblePlaySilentlyMuted = false;
      private audibleBufferingEmitted = false;
      private lastGeneration: number | null = null;
      private readyEmitted = false;
      private loopRestart = false;

      constructor(element: HTMLElement, playerOptions: any) {
        this.element = element;
        this.index = Number(element.closest('[data-short-index]')?.getAttribute('data-short-index') || -1);
        this.events = playerOptions.events;
        players.set(this.index, this);
        const iframe = document.createElement('iframe');
        iframe.title = 'Fake YouTube player';
        iframe.tabIndex = 0;
        iframe.setAttribute('data-fake-youtube', 'true');
        element.appendChild(iframe);
        this.record('construct');
        const shouldStall = constructed < stallReadyCount;
        constructed += 1;
        if (!shouldStall && this.index !== manualReadyIndex) {
          const readyDelay = this.index === delayReadyIndex ? delayReadyMs : 0;
          window.setTimeout(() => this.ready(), readyDelay);
        }
      }

      ready() {
        if (this.destroyed || this.readyEmitted) return;
        this.readyEmitted = true;
        this.record('ready');
        this.events.onReady?.({ target: this });
      }

      private identity() {
        const card = this.element.closest<HTMLElement>('[data-short-index]');
        const rawGeneration = Number(card?.dataset.leaseGeneration);
        if (Number.isInteger(rawGeneration) && rawGeneration > 0) this.lastGeneration = rawGeneration;
        return {
          shortId: card?.dataset.shortId || '',
          generation: this.lastGeneration,
        };
      }

      private record(method: string, value?: number) {
        const identity = this.identity();
        log.push({ at: performance.now(), index: this.index, method, value, ...identity });
      }

      cueVideoById() {
        if (this.destroyed) return;
        this.record('cueVideoById');
        // Physical YouTube iframes can briefly expose an unmuted/zero-volume
        // native state after cueing. This is not a user choice and must never
        // replace the last usable session volume.
        if (resetSoundToZeroOnCue) {
          this.muted = false;
          this.volume = 0;
          this.record('cueSoundReset', 0);
        }
        if (this.index === error5OnCueIndex && cueErrorsEmitted < 1) {
          cueErrorsEmitted += 1;
          this.state = -1;
          window.setTimeout(() => this.events.onError?.({ target: this, data: 5 }), 0);
          return;
        }
        this.state = 5;
        window.setTimeout(() => this.events.onStateChange?.({ target: this, data: 5 }), 0);
      }
      loadVideoById() { this.record('loadVideoById'); }
      playVideo() {
        if (this.destroyed) return;
        this.record('playVideo');
        if (this.index === error5OnPlayIndex && !this.playErrorEmitted) {
          this.playErrorEmitted = true;
          this.state = -1;
          this.events.onError?.({ target: this, data: 5 });
          return;
        }
        if (this.index === blockPlayIndex && blockedPlaysEmitted < blockPlayCount) {
          blockedPlaysEmitted += 1;
          this.state = 2;
          this.events.onAutoplayBlocked?.({ target: this });
          return;
        }
        const shouldBlockAudible = blockAudible && !this.muted && (
          blockAudibleCount > 0
            ? audibleBlocksEmitted < blockAudibleCount
            : !this.blockedOnce
        );
        if (shouldBlockAudible) {
          this.blockedOnce = true;
          audibleBlocksEmitted += 1;
          this.state = 2;
          this.events.onAutoplayBlocked?.({ target: this });
          return;
        }
        if (this.index === bufferThenPauseIndex && this.bufferedPauses < bufferThenPauseCount) {
          this.bufferedPauses += 1;
          this.state = 3;
          this.events.onStateChange?.({ target: this, data: 3 });
          window.setTimeout(() => {
            this.state = 2;
            this.events.onStateChange?.({ target: this, data: 2 });
          }, 0);
          return;
        }
        if (resetSoundToZeroOnPlaying && !this.soundResetOnPlaying) {
          this.soundResetOnPlaying = true;
          this.muted = false;
          this.volume = 0;
          this.record('playingSoundReset', 0);
        }
        if (silentlyMuteAudiblePlay && !this.muted && !this.audiblePlaySilentlyMuted) {
          this.audiblePlaySilentlyMuted = true;
          this.muted = true;
          this.record('audiblePlaySilentlyMuted');
        }
        if (bufferAudibleBeforePlayingMs > 0 && !this.muted && !this.audibleBufferingEmitted) {
          this.audibleBufferingEmitted = true;
          this.state = 3;
          this.record('audibleBuffering');
          this.events.onStateChange?.({ target: this, data: 3 });
          window.setTimeout(() => {
            this.state = 1;
            this.currentTime = 0.2;
            this.events.onStateChange?.({ target: this, data: 1 });
          }, bufferAudibleBeforePlayingMs);
          return;
        }
        this.state = 1;
        const delayLoopProgress = this.loopRestart && loopProgressDelayMs > 0;
        this.currentTime = delayLoopProgress ? 0 : 0.2;
        this.loopRestart = false;
        window.setTimeout(() => {
          this.events.onStateChange?.({ target: this, data: 1 });
          if (this.audiblePlaySilentlyMuted && delayedAutoplayBlockedAfterMutedPlayMs > 0) {
            window.setTimeout(() => this.autoplayBlocked(true), delayedAutoplayBlockedAfterMutedPlayMs);
          }
          if (resetSoundToZeroAfterPlaying && !this.soundResetAfterPlaying) {
            this.soundResetAfterPlaying = true;
            window.setTimeout(() => {
              this.muted = false;
              this.volume = 0;
              this.record('postPlayingSoundReset', 0);
            }, 0);
          }
          if (!this.muted && delayedAutoplayBlockedAfterAudiblePlayMs > 0) {
            window.setTimeout(() => {
              this.state = 2;
              this.autoplayBlocked(true);
            }, delayedAutoplayBlockedAfterAudiblePlayMs);
          }
          if (delayLoopProgress) {
            window.setTimeout(() => {
              this.state = 1;
              this.currentTime = 0.2;
              this.events.onStateChange?.({ target: this, data: 1 });
            }, loopProgressDelayMs);
          }
        }, 0);
      }
      pauseVideo() { if (!this.destroyed) { this.record('pauseVideo'); this.state = 2; } }
      mute() { if (!this.destroyed) { this.record('mute'); this.muted = true; } }
      unMute() { if (!this.destroyed) { this.record('unMute'); this.muted = false; } }
      isMuted() { return this.muted; }
      setVolume(volume: number) {
        if (this.destroyed) return;
        this.record('setVolume', volume);
        if (ignoreVolumeWhileMuted && this.muted) {
          this.record('setVolumeIgnoredWhileMuted', volume);
          return;
        }
        this.volume = volume;
      }
      getVolume() { return this.volume; }
      getCurrentTime() { return this.currentTime; }
      seekTo(seconds: number) {
        if (!this.destroyed) {
          this.record('seekTo');
          this.currentTime = seconds;
          if (seconds === 0) this.loopRestart = true;
        }
      }
      getPlayerState() { return this.state; }
      getPlaybackRate() { return 1; }
      setPlaybackRate() {}
      getAvailablePlaybackRates() { return [1, 2]; }
      getIframe() { return this.element.querySelector('iframe') as HTMLIFrameElement; }
      snapshot() { return { index: this.index, state: this.state, muted: this.muted, volume: this.volume }; }
      destroy() {
        this.record('destroy');
        this.destroyed = true;
        players.delete(this.index);
        if (this.index === stalePlayingAfterDestroyIndex) {
          window.setTimeout(() => {
            this.record('stalePlayingCallback');
            this.events.onStateChange?.({ target: this, data: 1 });
          }, stalePlayingDelayMs);
        }
        if (this.index === stalePreparedCallbackIndex) {
          // Preserve the generationless identity of a prepared-never-leased
          // iframe. The replacement player at this index must reject both late
          // callbacks through pool identity and live-state validation.
          this.lastGeneration = null;
          window.setTimeout(() => {
            const staleIdentity = {
              at: performance.now(),
              index: this.index,
              shortId: '',
              generation: null,
            };
            log.push({ ...staleIdentity, method: 'stalePreparedBufferingCallback' });
            this.events.onStateChange?.({ target: this, data: 3 });
            log.push({ ...staleIdentity, at: performance.now(), method: 'stalePreparedPlayingCallback' });
            this.events.onStateChange?.({ target: this, data: 1 });
          }, stalePlayingDelayMs);
        }
      }

      nativeSound(audible: boolean, volume = 64) {
        this.getIframe()?.focus();
        this.volume = volume;
        this.muted = !audible;
        this.record(audible ? 'nativeUnmute' : 'nativeMute');
      }

      nativeToggle() {
        this.getIframe()?.focus();
        if (this.muted) {
          this.muted = false;
          this.record('nativeUnmute', this.volume);
        } else {
          this.muted = true;
          this.record('nativeMute', this.volume);
        }
      }

      emit(state: number) {
        this.state = state;
        this.record(`emit:${state}`);
        this.events.onStateChange?.({ target: this, data: state });
      }

      error(code: number) {
        this.state = -1;
        this.record(`error:${code}`);
        this.events.onError?.({ target: this, data: code });
      }

      autoplayBlocked(preserveState = true) {
        if (!preserveState) this.state = 2;
        this.record('autoplayBlocked');
        this.events.onAutoplayBlocked?.({ target: this });
      }
    }

    target.__PUBCRAWL_FAKE_YT__ = {
      nativeSound(index, audible, volume = 64) { players.get(index)?.nativeSound(audible, volume); },
      nativeToggle(index) { players.get(index)?.nativeToggle(); },
      sound(index) {
        const player = players.get(index);
        return player ? { muted: player.isMuted(), volume: player.getVolume() } : null;
      },
      emit(index, state) { players.get(index)?.emit(state); },
      error(index, code) { players.get(index)?.error(code); },
      autoplayBlocked(index, preserveState = true) { players.get(index)?.autoplayBlocked(preserveState); },
      ready(index) { players.get(index)?.ready(); },
      states() { return [...players.values()].map((player) => player.snapshot()); },
    };
    (window as Window & { YT?: unknown }).YT = { Player: FakePlayer };
  }, options);
}

export async function waitForFirstPlay(page: Page) {
  await page.waitForLoadState('load');
  await page.waitForFunction(() => Boolean((window as any).__PUBCRAWL_FAKE_YT_LOG__?.some((entry: FakeLogEntry) => entry.method === 'playVideo')));
  // DOMContentLoaded and the fake player's first command can precede the
  // final responsive stylesheet layout in WebKit. Do not synthesize a swipe
  // until the real feed owns a scroll viewport; otherwise scrollTop is
  // correctly clamped to zero and the test exercises an unstyled document.
  await page.waitForFunction(() => {
    const root = document.querySelector<HTMLElement>('.shorts-feed');
    return Boolean(
      root &&
      getComputedStyle(root).overflowY === 'auto' &&
      root.clientHeight > 0 &&
      root.scrollHeight > root.clientHeight,
    );
  });
}

export async function fakeLog(page: Page): Promise<FakeLogEntry[]> {
  return page.evaluate(() => [...((window as any).__PUBCRAWL_FAKE_YT_LOG__ || [])]);
}

export async function fakeStates(page: Page): Promise<Array<{ index: number; state: number; muted: boolean; volume: number }>> {
  return page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.states() || []);
}

export async function activeIndex(page: Page): Promise<number> {
  return Number(await page.locator('.shorts-feed').getAttribute('data-controller-active'));
}

export async function activeLeaseIdentity(page: Page) {
  const feed = page.locator('.shorts-feed');
  const index = Number(await feed.getAttribute('data-controller-active'));
  const lease = (await feed.getAttribute('data-controller-lease')) || '';
  const generation = Number(lease.split(':')[1]);
  const shortId = (await page.locator(`.shorts-card[data-short-index="${index}"]`).getAttribute('data-short-id')) || '';
  return { index, generation, shortId };
}

export async function setNativeSound(page: Page, audible: boolean, volume = 64) {
  const index = await activeIndex(page);
  await page.evaluate(({ index, audible, volume }) => {
    (window as any).__PUBCRAWL_FAKE_YT__?.nativeSound(index, audible, volume);
  }, { index, audible, volume });
}

export async function toggleNativeSound(page: Page) {
  const index = await activeIndex(page);
  await page.evaluate((active) => {
    (window as any).__PUBCRAWL_FAKE_YT__?.nativeToggle(active);
  }, index);
}

export async function swipeTo(page: Page, index: number) {
  const feed = page.locator('.shorts-feed');
  await feed.evaluate((element, target) => {
    const root = element as HTMLElement;
    const blockNativeScrollEnd = (event: Event) => event.stopImmediatePropagation();
    root.addEventListener('scrollend', blockNativeScrollEnd, { capture: true });
    (root as HTMLElement & { __testScrollEndBlocker?: EventListener }).__testScrollEndBlocker = blockNativeScrollEnd;
    // WebKit may immediately snap a programmatic exact-card scroll back to
    // the current card while a synthetic touch is still open. Disable only
    // the test page's snap behavior so the application receives the intended
    // geometry deterministically; production CSS remains unchanged.
    root.style.setProperty('scroll-snap-type', 'none', 'important');
    root.style.scrollBehavior = 'auto';
    for (const card of root.querySelectorAll<HTMLElement>('.shorts-card')) {
      card.style.setProperty('scroll-snap-align', 'none', 'important');
    }
    // Force WebKit to commit the snap override before assigning scrollTop.
    void root.offsetHeight;
    root.dispatchEvent(new TouchEvent('touchstart', { bubbles: true }));
    root.scrollTop = target * root.clientHeight;
    root.dispatchEvent(new Event('scroll', { bubbles: true }));
  }, index);
  await expect.poll(() => feed.evaluate((element) => {
    const root = element as HTMLElement;
    return Math.round(root.scrollTop / Math.max(1, root.clientHeight));
  })).toBe(index);
  await page.waitForTimeout(40);
  await feed.evaluate((element) => {
    element.dispatchEvent(new TouchEvent('touchend', { bubbles: true }));
  });
  await expect(feed).toHaveAttribute('data-controller-active', String(index));
  await expect(feed).toHaveAttribute('data-controller-phase', 'idle');
  await feed.evaluate((element) => {
    const root = element as HTMLElement;
    const testRoot = root as HTMLElement & { __testScrollEndBlocker?: EventListener };
    if (testRoot.__testScrollEndBlocker) {
      root.removeEventListener('scrollend', testRoot.__testScrollEndBlocker, { capture: true });
      delete testRoot.__testScrollEndBlocker;
    }
    root.style.removeProperty('scroll-snap-type');
    root.style.scrollBehavior = '';
    for (const card of root.querySelectorAll<HTMLElement>('.shorts-card')) {
      card.style.removeProperty('scroll-snap-align');
    }
  });
}

export async function scrollToWithoutTouch(page: Page, index: number) {
  const feed = page.locator('.shorts-feed');
  await feed.evaluate((element, target) => {
    const root = element as HTMLElement;
    root.scrollTop = target * root.clientHeight;
    root.dispatchEvent(new Event('scroll', { bubbles: true }));
  }, index);
  await page.waitForTimeout(40);
  await feed.evaluate((element) => {
    element.dispatchEvent(new Event('scrollend', { bubbles: true }));
  });
  await expect(feed).toHaveAttribute('data-controller-active', String(index));
  await expect(feed).toHaveAttribute('data-controller-phase', 'idle');
}

export async function scrollToWithQuietFallback(page: Page, index: number) {
  const feed = page.locator('.shorts-feed');
  await feed.evaluate((element, target) => {
    const root = element as HTMLElement;
    // Chromium emits a native scrollend for programmatic scrollTop changes.
    // Suppress only that test event so the app's 120ms no-scrollend fallback
    // is the sole settlement owner in this scenario.
    root.addEventListener('scrollend', (event) => event.stopImmediatePropagation(), {
      capture: true,
      once: true,
    });
    root.scrollTop = target * root.clientHeight;
    root.dispatchEvent(new Event('scroll', { bubbles: true }));
  }, index);
  // Deliberately omit scrollend. The feed-wide 120ms quiet fallback owns this
  // settlement on browsers that do not provide a reliable native event.
  await expect(feed).toHaveAttribute('data-controller-active', String(index), { timeout: 2_000 });
  await expect(feed).toHaveAttribute('data-controller-phase', 'idle');
}

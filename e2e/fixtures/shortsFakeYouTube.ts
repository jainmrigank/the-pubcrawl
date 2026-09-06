import { expect, type Page } from '@playwright/test';

/** Options for the one-player YouTube test double. */
export type FakePlayerOptions = {
  blockAudible?: boolean;
  blockAudibleCount?: number;
  startDelayMs?: number;
  readyDelayMs?: number;
  loopProgressDelayMs?: number;
  resetSoundToZeroOnLoad?: boolean;
  rejectMutedStarts?: boolean;
};

export type FakeLogEntry = {
  at: number;
  timestamp?: number;
  instanceId: string;
  index: number;
  shortId: string;
  generation: number | null;
  method: string;
  value?: number;
  origin: 'application' | 'native-fixture';
};

/**
 * Install a deterministic one-iframe YouTube double. The real Shorts route
 * owns one player and changes its video with loadVideoById; this fixture does
 * the same so browser assertions cannot accidentally pass against the old
 * pooled-player implementation.
 */
export async function installFakeYouTube(page: Page, options: FakePlayerOptions = {}) {
  await page.addInitScript((config) => {
    type FakeWindow = Window & {
      __PUBCRAWL_FAKE_YT_LOG__?: FakeLogEntry[];
      __PUBCRAWL_FAKE_YT__?: {
        nativeSound(audible: boolean, volume?: number): void;
        nativeToggle(): void;
        nativeVolume(volume: number): void;
        nativeRate(rate: number): void;
        nativePause(): void;
        nativePlay(): void;
        emit(state: number): void;
        end(): void;
        autoplayBlocked(): void;
        buffering(): void;
        staleCallbacks(videoId?: string): void;
        error(code?: number): void;
        setRejectMutedStarts(reject: boolean): void;
        sound(): { muted: boolean; volume: number } | null;
        state(): { state: number; muted: boolean; volume: number; shortId: string } | null;
        iframeCount(): number;
      };
    };

    const target = window as FakeWindow;
    const log = target.__PUBCRAWL_FAKE_YT_LOG__ = [];
    const blockAudible = Boolean(config.blockAudible);
    const blockAudibleCount = Number(config.blockAudibleCount || 0);
    const startDelayMs = Math.max(0, Number(config.startDelayMs || 0));
    const readyDelayMs = Math.max(0, Number(config.readyDelayMs || 0));
    const loopProgressDelayMs = Math.max(0, Number(config.loopProgressDelayMs || 0));
    let rejectMutedStarts = Boolean(config.rejectMutedStarts);
    let audibleBlocks = 0;
    let instanceCounter = 0;

    const identity = (element: HTMLElement, videoId: string, instanceId: string) => {
      const card = element.closest<HTMLElement>('[data-short-id]');
      const rawGeneration = Number(card?.dataset.leaseGeneration);
      const now = performance.now();
      return {
        at: now,
        timestamp: now,
        instanceId,
        index: Number(card?.dataset.shortIndex || 0),
        shortId: card?.dataset.shortId || videoId,
        generation: Number.isInteger(rawGeneration) ? rawGeneration : null,
        origin: 'application' as const,
      };
    };

    class FakePlayer {
      private readonly element: HTMLElement;
      private readonly events: any;
      private readonly instanceId = `fake-${++instanceCounter}`;
      private videoId = '';
      private muted = true;
      private volume = 100;
      private rate = 1;
      private playerState = -1;
      private currentTime = 0;
      private destroyed = false;
      private readyEmitted = false;
      private loopPending = false;
      private playToken = 0;

      constructor(element: HTMLElement, playerOptions: any) {
        this.element = element;
        this.events = playerOptions.events;
        this.videoId = String(playerOptions.videoId || '');
        const iframe = document.createElement('iframe');
        iframe.title = 'Fake YouTube player';
        iframe.tabIndex = 0;
        iframe.setAttribute('data-fake-youtube', 'true');
        iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
        element.appendChild(iframe);
        this.record('construct');
        window.setTimeout(() => this.ready(), readyDelayMs);
      }

      private record(method: string, value?: number, origin: 'application' | 'native-fixture' = 'application') {
        log.push({ ...identity(this.element, this.videoId, this.instanceId), method, value, origin });
      }

      private setState(state: number, notify = true) {
        if (this.destroyed) return;
        this.playerState = state;
        if (notify) this.events.onStateChange?.({ target: this, data: state });
      }

      private beginPlay() {
        if (this.destroyed) return;
        if (blockAudible && !this.muted && (blockAudibleCount <= 0 || audibleBlocks < blockAudibleCount)) {
          audibleBlocks += 1;
          this.setState(2);
          this.events.onAutoplayBlocked?.({ target: this });
          return;
        }
        if (rejectMutedStarts && this.muted) {
          this.setState(2);
          this.events.onAutoplayBlocked?.({ target: this });
          return;
        }
        const token = ++this.playToken;
        this.setState(3);
        window.setTimeout(() => {
          if (this.destroyed || token !== this.playToken) return;
          const loop = this.loopPending;
          this.setState(1, false);
          this.currentTime = loop ? 0 : 0.2;
          this.loopPending = false;
          this.events.onStateChange?.({ target: this, data: 1 });
          if (loop && loopProgressDelayMs > 0) {
            window.setTimeout(() => {
              if (this.destroyed) return;
              this.currentTime = 0.2;
              this.events.onStateChange?.({ target: this, data: 1 });
            }, loopProgressDelayMs);
          }
        }, startDelayMs);
      }

      ready() {
        if (this.destroyed || this.readyEmitted) return;
        this.readyEmitted = true;
        this.record('ready');
        this.events.onReady?.({ target: this });
      }

      playVideo() {
        if (this.destroyed) return;
        this.record('playVideo');
        this.beginPlay();
      }

      pauseVideo() {
        if (this.destroyed) return;
        ++this.playToken;
        this.record('pauseVideo');
        this.setState(2);
      }

      mute() { if (!this.destroyed) { this.record('mute'); this.muted = true; } }
      unMute() { if (!this.destroyed) { this.record('unMute'); this.muted = false; } }
      isMuted() { return this.muted; }
      setVolume(value: number) {
        if (this.destroyed) return;
        this.volume = Math.max(0, Math.min(100, Math.round(value)));
        this.record('setVolume', this.volume);
      }
      getVolume() { return this.volume; }
      getCurrentTime() { return this.currentTime; }
      getPlayerState() { return this.playerState; }
      getVideoUrl() { return this.videoId ? `https://www.youtube.com/watch?v=${this.videoId}` : ''; }
      getPlaybackRate() { return this.rate; }
      setPlaybackRate(value: number) {
        if (!this.destroyed) {
          this.rate = value;
          this.record('setPlaybackRate', value);
          this.events.onPlaybackRateChange?.({ target: this, data: value });
        }
      }
      getAvailablePlaybackRates() { return [0.25, 0.5, 1, 1.5, 2]; }
      getIframe() { return this.element.querySelector('iframe') as HTMLIFrameElement; }

      loadVideoById(videoId: string) {
        if (this.destroyed) return;
        this.videoId = videoId;
        this.currentTime = 0;
        this.loopPending = false;
        this.record('loadVideoById');
        if (config.resetSoundToZeroOnLoad) {
          this.muted = false;
          this.volume = 0;
          this.record('loadSoundReset', 0);
        }
        this.setState(5);
        window.setTimeout(() => {
          if (!this.destroyed) this.beginPlay();
        }, 0);
      }

      seekTo(seconds: number) {
        if (!this.destroyed) {
          this.record('seekTo', seconds);
          this.currentTime = seconds;
          if (seconds === 0) this.loopPending = true;
        }
      }

      destroy() {
        if (this.destroyed) return;
        this.record('destroy');
        this.destroyed = true;
        this.element.replaceChildren();
      }

      nativeSound(audible: boolean, value = this.volume) {
        if (this.destroyed) return;
        this.getIframe()?.focus();
        this.volume = Math.max(0, Math.min(100, Math.round(value)));
        this.muted = !audible;
        this.record(audible ? 'nativeUnmute' : 'nativeMute', this.volume, 'native-fixture');
      }
      nativeToggle() { this.nativeSound(this.muted, this.volume); }
      nativeVolume(value: number) {
        if (this.destroyed) return;
        this.volume = Math.max(0, Math.min(100, Math.round(value)));
        this.record('nativeVolume', this.volume, 'native-fixture');
      }
      nativeRate(value: number) {
        this.rate = value;
        this.record('nativeRate', value, 'native-fixture');
        this.events.onPlaybackRateChange?.({ target: this, data: value });
      }
      nativePause() { this.pauseVideo(); }
      nativePlay() { this.record('nativePlay', undefined, 'native-fixture'); this.beginPlay(); }
      emit(state: number) { this.record(`emit:${state}`, undefined, 'native-fixture'); this.setState(state); }
      end() { this.currentTime = 0; this.emit(0); }
      autoplayBlocked() { this.record('autoplayBlocked', undefined, 'native-fixture'); this.events.onAutoplayBlocked?.({ target: this }); }
      buffering() { this.emit(3); }
      /**
       * Deliver callbacks from the previous video after a new load. Real
       * YouTube events do not carry PubCrawl's generation, so the production
       * guard must validate the player's current native URL before acting.
       */
      staleCallbacks(videoId = 'stale-video-id') {
        if (this.destroyed) return;
        const current = this.videoId;
        this.videoId = videoId;
        try {
          for (const state of [1, 2, 0]) {
            this.record(`stale:${state}`, undefined, 'native-fixture');
            this.events.onStateChange?.({ target: this, data: state });
          }
          this.record('stale:autoplayBlocked', undefined, 'native-fixture');
          this.events.onAutoplayBlocked?.({ target: this });
        } finally {
          this.videoId = current;
        }
      }
      error(code = 150) {
        if (this.destroyed) return;
        this.record('error', code, 'native-fixture');
        this.events.onError?.({ target: this, data: code });
      }
      setRejectMutedStarts(reject: boolean) { rejectMutedStarts = Boolean(reject); }
      sound() { return { muted: this.muted, volume: this.volume }; }
      snapshot() { return { state: this.playerState, muted: this.muted, volume: this.volume, shortId: this.videoId }; }
    }

    let player: FakePlayer | null = null;
    (window as Window & { YT?: unknown }).YT = {
      Player: class extends FakePlayer {
        constructor(element: HTMLElement, playerOptions: any) {
          super(element, playerOptions);
          player = this;
        }
      },
    };
    target.__PUBCRAWL_FAKE_YT__ = {
      nativeSound: (audible, volume) => player?.nativeSound(audible, volume),
      nativeToggle: () => player?.nativeToggle(),
      nativeVolume: (volume) => player?.nativeVolume(volume),
      nativeRate: (rate) => player?.nativeRate(rate),
      nativePause: () => player?.nativePause(),
      nativePlay: () => player?.nativePlay(),
      emit: (state) => player?.emit(state),
      end: () => player?.end(),
      autoplayBlocked: () => player?.autoplayBlocked(),
      buffering: () => player?.buffering(),
      staleCallbacks: (videoId) => player?.staleCallbacks(videoId),
      error: (code) => player?.error(code),
      setRejectMutedStarts: (reject) => player?.setRejectMutedStarts(reject),
      sound: () => player?.sound() || null,
      state: () => player?.snapshot() || null,
      iframeCount: () => document.querySelectorAll('iframe[data-fake-youtube]').length,
    };
  }, options);
}

export async function waitForFirstPlay(page: Page) {
  // The route helper already waits for the app document. Waiting for the
  // browser's full `load` event here makes WebKit depend on an iframe/network
  // event that the fake player intentionally does not provide. Wait on the
  // player-specific readiness signal instead.  The fake can become ready
  // before the hashed stylesheet finishes loading, so also wait for the
  // controls-first grid to be applied before measuring side rails.
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.shorts-stage') as Element | null).display === 'grid', null, { timeout: 20_000 });
  await page.waitForSelector('.shorts-player-layer[data-player-ready="true"]', { timeout: 20_000 });
  await expect.poll(async () => (await fakeLog(page)).some((entry) => entry.method === 'playVideo' || entry.method === 'loadVideoById')).toBe(true);
  await expect(page.locator('.shorts-player-layer')).toHaveClass(/is-revealed/, { timeout: 20_000 });
}

export async function fakeLog(page: Page): Promise<FakeLogEntry[]> {
  return page.evaluate(() => [...((window as any).__PUBCRAWL_FAKE_YT_LOG__ || [])]);
}

export async function fakeStates(page: Page) {
  return page.evaluate(() => {
    const state = (window as any).__PUBCRAWL_FAKE_YT__?.state?.();
    return state ? [{ index: Number(document.querySelector('.shorts-card.is-active')?.getAttribute('data-short-index') || 0), ...state }] : [];
  });
}

export async function activeIndex(page: Page): Promise<number> {
  return Number(await page.locator('.shorts-feed').getAttribute('data-controller-active'));
}

export async function activeLeaseIdentity(page: Page) {
  const index = await activeIndex(page);
  const lease = (await page.locator('.shorts-feed').getAttribute('data-controller-lease')) || '';
  const generation = Number(lease.split(':')[1]);
  const shortId = (await page.locator('.shorts-card.is-active').getAttribute('data-short-id')) || '';
  return { index, generation, shortId };
}

export async function setNativeSound(page: Page, audible: boolean, volume = 64) {
  await page.evaluate(({ audible, volume }) => (window as any).__PUBCRAWL_FAKE_YT__?.nativeSound(audible, volume), { audible, volume });
}

export async function toggleNativeSound(page: Page) {
  await page.evaluate(() => (window as any).__PUBCRAWL_FAKE_YT__?.nativeToggle());
}

export async function swipeTo(page: Page, target: number) {
  const current = await activeIndex(page);
  const direction = target >= current ? 'Next Short' : 'Previous Short';
  const count = Math.abs(target - current);
  for (let index = 0; index < count; index += 1) {
    await page.getByRole('button', { name: direction }).click();
    const expected = current + (target >= current ? index + 1 : -(index + 1));
    await expect(page.locator('.shorts-feed')).toHaveAttribute('data-controller-active', String(expected));
    await expect(page.locator('.shorts-player-layer')).toHaveClass(/is-revealed/, { timeout: 20_000 });
  }
}

/** Exercise the real side-zone pointer handler instead of the fallback buttons. */
export async function sideSwipeTo(page: Page, target: number) {
  const current = await activeIndex(page);
  if (target === current) return;
  const forward = target > current;
  const zone = page.locator(forward ? '.shorts-nav-zone-right' : '.shorts-nav-zone-left');
  const box = await zone.boundingBox();
  if (!box) throw new Error('Shorts side navigation zone is not measurable');
  const x = box.x + box.width / 2;
  // Start in the open part of the side rail rather than on one of its
  // buttons.  The rail deliberately contains the Back/Help/Previous (or
  // Share/Next) controls, so its midpoint can land on a button and the
  // production handler will correctly ignore that pointer sequence as a
  // button interaction.  A quarter-height point is stable across the
  // portrait WebKit viewport while still leaving room for a 120px swipe.
  const y = box.y + Math.max(24, Math.min(box.height - 24, box.height * 0.25));
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + (forward ? -120 : 120), { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('.shorts-feed')).toHaveAttribute('data-controller-active', String(target));
  await expect(page.locator('.shorts-player-layer')).toHaveClass(/is-revealed/, { timeout: 20_000 });
}

export async function scrollToWithoutTouch(page: Page, target: number) { await swipeTo(page, target); }
export async function scrollToWithQuietFallback(page: Page, target: number) { await swipeTo(page, target); }

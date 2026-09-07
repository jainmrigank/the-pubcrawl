import { YT_PLAYER_STATES as YT, type YouTubePlayer } from './shortsPlayer.ts';
import { clampShortsVolume, type ShortsSessionSoundPreference } from './shortsSoundPolicy.ts';

export type ShortsPhase = 'initializing' | 'loading' | 'playing' | 'paused' | 'buffering' | 'blocked' | 'offline' | 'error';
export interface ShortsSelection { videoId: string; index: number }
export interface ShortsSnapshot {
  phase: ShortsPhase;
  videoId: string;
  index: number;
  generation: number;
  ready: boolean;
  motion: boolean;
  suspended: boolean;
  effectiveMuted: boolean;
  desiredAudible: boolean;
  volume: number;
  soundAcknowledged: boolean;
}
interface SoundState { muted: boolean; volume: number }
interface Activation extends ShortsSelection {
  generation: number;
  issued: boolean;
  recoveryUsed: boolean;
  motion: boolean;
  startedAt: number;
}
interface ControllerOptions {
  sound: ShortsSessionSoundPreference;
  preferredRate: number;
  onSnapshot(snapshot: ShortsSnapshot): void;
  onSound(sound: ShortsSessionSoundPreference): void;
  onRate(rate: number): void;
  onMotion(sample: { videoId: string; generation: number; startupMs: number; muted: boolean; recoveryUsed: boolean }): void;
  onFailure(): void;
  onBuffering(): void;
  now?: () => number;
}

/** One owner for application-issued player commands. React only renders snapshots. */
export class ShortsController {
  private player: YouTubePlayer | null = null;
  private activation: Activation | null = null;
  private sound: ShortsSessionSoundPreference;
  private preferredRate: number;
  private phase: ShortsPhase = 'initializing';
  private reasons = new Set<string>();
  private disposed = false;
  private commanding = false;
  private manualPause = false;
  private resumeIntent = false;
  private resuming = false;
  private pendingSound: SoundState | null = null;
  private baseline: SoundState | null = null;
  private pendingRate: number | null = null;
  private rateApplied = false;
  private loopPending = false;
  private failed = false;
  private observation: ReturnType<typeof setInterval> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private loopTimer: ReturnType<typeof setTimeout> | null = null;
  private options: ControllerOptions;
  private now: () => number;

  constructor(options: ControllerOptions) {
    this.options = options;
    this.sound = { ...options.sound };
    this.preferredRate = options.preferredRate;
    this.now = options.now ?? (() => performance.now());
  }

  snapshot(): ShortsSnapshot {
    return {
      phase: this.reasons.has('offline') ? 'offline' : this.phase,
      videoId: this.activation?.videoId ?? '', index: this.activation?.index ?? 0,
      generation: this.activation?.generation ?? 0, ready: Boolean(this.player),
      motion: this.activation?.motion ?? false, suspended: this.reasons.size > 0,
      effectiveMuted: this.readSound()?.muted ?? true,
      desiredAudible: this.sound.desiredAudible, volume: this.sound.volume,
      soundAcknowledged: Boolean(this.baseline && !this.pendingSound),
    };
  }

  private emit() { if (!this.disposed) this.options.onSnapshot(this.snapshot()); }

  select(selection: ShortsSelection) {
    if (this.disposed || !selection.videoId || selection.index < 0) return;
    if (this.activation?.videoId === selection.videoId) return;
    this.captureNativeSound();
    this.clearTimers();
    this.activation = {
      ...selection, generation: (this.activation?.generation ?? 0) + 1,
      issued: false, recoveryUsed: false, motion: false, startedAt: this.now(),
    };
    this.manualPause = false;
    this.resumeIntent = true;
    this.resuming = false;
    this.loopPending = false;
    this.failed = false;
    this.baseline = null;
    this.pendingSound = null;
    this.rateApplied = false;
    this.pendingRate = null;
    this.phase = this.player ? 'loading' : 'initializing';
    this.start();
    this.emit();
  }

  attach(player: YouTubePlayer) {
    if (this.disposed) return;
    this.player = player;
    this.start();
    this.emit();
  }

  private nativeId() {
    try { return new URL(this.player?.getVideoUrl?.() ?? '').searchParams.get('v'); }
    catch { return null; }
  }

  private current() {
    return !this.disposed && this.reasons.size === 0 && Boolean(this.player && this.activation)
      && this.nativeId() === this.activation?.videoId;
  }

  private nativeState() {
    try { return this.player?.getPlayerState() ?? YT.UNSTARTED; }
    catch { return YT.UNSTARTED; }
  }

  private time() {
    try { return this.player?.getCurrentTime() ?? 0; } catch { return 0; }
  }

  private readSound(): SoundState | null {
    try {
      if (!this.player) return null;
      const volume = this.player.getVolume();
      if (!Number.isFinite(volume)) return null;
      return { muted: this.player.isMuted(), volume: clampShortsVolume(volume) };
    } catch { return null; }
  }

  private writeSound(muted: boolean) {
    if (!this.player) return;
    // Publish the expected state BEFORE commands: native API acknowledgment
    // arrives asynchronously. A transient reset is never user consent.
    this.pendingSound = { muted, volume: this.sound.volume };
    this.baseline = null;
    this.player.setVolume(this.sound.volume);
    if (muted) this.player.mute(); else this.player.unMute();
  }

  private start() {
    const a = this.activation;
    const p = this.player;
    if (!p || !a || a.issued || this.disposed || this.reasons.size) return;
    a.issued = true;
    a.startedAt = this.now();
    this.phase = 'loading';
    this.commanding = true;
    try {
      if (this.nativeId() !== a.videoId) {
        // load initiates playback; don't follow it with another play command.
        // Apply sound AFTER load so a synchronous load reset cannot win.
        p.loadVideoById(a.videoId);
        this.writeSound(!this.sound.desiredAudible);
      } else {
        this.writeSound(!this.sound.desiredAudible);
        p.playVideo();
      }
    } catch { this.phase = 'error'; }
    finally { this.commanding = false; }
    this.startObservation();
    // Some adapters can report a policy block during the command itself.
    // Its recovery already owns verification; don't create a second timer.
    if (a.recoveryUsed || this.phase === 'error') return;
    this.retry = setTimeout(() => {
      this.retry = null;
      if (this.activation !== a || !this.current() || this.manualPause || a.motion) return;
      const state = this.nativeState();
      if ((state === YT.CUED || state === YT.UNSTARTED) && this.time() === 0) this.recover();
    }, 1500);
  }

  /** This is also the final pre-navigation read: no weaker fast path exists. */
  captureNativeSound() {
    if (!this.current() || this.commanding || !this.activation?.motion) return;
    const state = this.nativeState();
    if (state !== YT.PLAYING && state !== YT.PAUSED) return;
    const actual = this.readSound();
    if (!actual) return;
    if (this.pendingSound) {
      if (actual.muted !== this.pendingSound.muted || actual.volume !== this.pendingSound.volume) return;
      this.pendingSound = null;
      this.baseline = actual;
      this.emit();
      return;
    }
    const before = this.baseline;
    this.baseline = actual;
    if (!before || (before.muted === actual.muted && before.volume === actual.volume)) return;
    this.sound = { version: 1, desiredAudible: !actual.muted, volume: actual.volume };
    this.options.onSound({ ...this.sound });
    this.emit();
  }

  private startObservation() {
    if (this.observation != null || this.reasons.size || this.disposed) return;
    // Bounded and read-only: never use observation to repeatedly unmute/play.
    this.observation = setInterval(() => this.sample(), 200);
  }

  sample() {
    const a = this.activation;
    if (!this.current() || !a || this.commanding) return;
    if (this.nativeState() === YT.PLAYING && this.time() > 0.08) {
      this.loopPending = false;
      if (!a.motion) {
        a.motion = true;
        this.cancelRetry();
        this.phase = 'playing';
        this.options.onMotion({ videoId: a.videoId, generation: a.generation,
          startupMs: Math.max(0, this.now() - a.startedAt),
          muted: this.readSound()?.muted ?? true, recoveryUsed: a.recoveryUsed });
        this.emit();
      }
    }
    this.captureNativeSound();
    if (this.pendingRate != null && a.motion && this.player?.getPlaybackRate?.() === this.pendingRate) {
      this.pendingRate = null;
    }
  }

  onState(player: YouTubePlayer, state: number) {
    if (player !== this.player || !this.current() || state !== this.nativeState() || this.commanding) return;
    if (state === YT.PLAYING) {
      this.resuming = false;
      this.manualPause = false;
      this.cancelRetry();
      this.phase = this.activation?.motion ? 'playing' : 'loading';
      if (!this.rateApplied) {
        this.rateApplied = true;
        const rates = player.getAvailablePlaybackRates?.() ?? [1];
        this.pendingRate = rates.includes(this.preferredRate) ? this.preferredRate : 1;
        player.setPlaybackRate?.(this.pendingRate);
      }
      this.sample();
    } else if (state === YT.BUFFERING) {
      this.cancelRetry();
      this.phase = 'buffering';
      this.options.onBuffering();
    } else if (state === YT.PAUSED && !this.resuming && !this.loopPending) {
      this.manualPause = true;
      this.cancelRetry();
      this.phase = 'paused';
    } else if (state === YT.ENDED && !this.manualPause && this.activation?.motion && !this.loopPending) {
      this.loopPending = true;
      const a = this.activation;
      player.seekTo(0, true);
      this.loopTimer = setTimeout(() => {
        this.loopTimer = null;
        if (!this.current() || this.activation !== a || !this.loopPending || this.manualPause) return;
        if (this.nativeState() !== YT.PLAYING && this.nativeState() !== YT.BUFFERING) player.playVideo();
      }, 120);
    }
    this.emit();
  }

  onRate(player: YouTubePlayer, rate: number) {
    if (player !== this.player || !this.current() || !this.activation?.motion || !this.rateApplied || this.pendingRate != null) return;
    if (!Number.isFinite(rate) || rate <= 0 || player.getPlaybackRate?.() !== rate) return;
    if (rate !== this.preferredRate) {
      this.preferredRate = rate;
      this.options.onRate(rate);
    }
  }

  onBlocked(player: YouTubePlayer) {
    if (player !== this.player || !this.current()) return;
    if (this.nativeState() === YT.PLAYING || this.nativeState() === YT.BUFFERING) return;
    // An old policy notification is not consent to undo a native pause after
    // this activation has already played. Resumption is tracked separately.
    if (this.activation?.motion && this.manualPause && !this.resuming) return;
    // This explicit policy event, unlike an ordinary PAUSED event, may
    // authorize recovery. It does not change desired sound.
    this.manualPause = false;
    this.recover();
  }

  private recover() {
    const a = this.activation;
    const p = this.player;
    if (!a || !p || !this.current()) return;
    if (a.recoveryUsed) {
      this.phase = 'blocked';
      if (!this.failed) { this.failed = true; this.options.onFailure(); }
      this.emit();
      return;
    }
    a.recoveryUsed = true;
    this.cancelRetry();
    this.commanding = true;
    this.phase = 'loading';
    try { this.writeSound(true); p.playVideo(); }
    catch { this.phase = 'error'; }
    finally { this.commanding = false; }
    // Recovery has one command budget. If it silently remains cued, report
    // the failure rather than leaving LOADING forever or issuing more plays.
    if (this.phase === 'loading') this.retry = setTimeout(() => {
      this.retry = null;
      if (this.activation !== a || !this.current() || this.manualPause || a.motion) return;
      const state = this.nativeState();
      if ((state === YT.CUED || state === YT.UNSTARTED) && this.time() === 0) this.recover();
    }, 1500);
    this.emit();
  }

  onError(player: YouTubePlayer) {
    if (player !== this.player || !this.current()) return;
    this.clearTimers();
    this.phase = 'error';
    this.emit();
  }

  suspend(reason: string, enabled: boolean) {
    if (this.disposed || this.reasons.has(reason) === enabled) return;
    if (enabled) {
      this.captureNativeSound();
      if (!this.reasons.size) {
        this.resumeIntent = !this.manualPause && this.phase !== 'error' && this.phase !== 'blocked';
        this.clearTimers();
      }
      this.reasons.add(reason);
      this.player?.pauseVideo();
    } else {
      this.reasons.delete(reason);
      if (!this.reasons.size) {
        if (!this.activation?.issued) this.start();
        else if (this.resumeIntent && this.current() && this.player) {
          this.resuming = true;
          this.commanding = true;
          try { this.writeSound(!this.sound.desiredAudible); this.player.playVideo(); }
          catch { this.phase = 'error'; }
          finally { this.commanding = false; }
        }
        this.startObservation();
      }
    }
    this.emit();
  }

  private cancelRetry() {
    if (this.retry != null) clearTimeout(this.retry);
    this.retry = null;
  }

  private clearTimers() {
    this.cancelRetry();
    if (this.observation != null) clearInterval(this.observation);
    if (this.loopTimer != null) clearTimeout(this.loopTimer);
    this.observation = null;
    this.loopTimer = null;
  }

  dispose() {
    this.captureNativeSound();
    this.disposed = true;
    this.clearTimers();
    this.player?.pauseVideo();
    this.player = null;
  }
}

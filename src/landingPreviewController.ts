import type { YouTubePlayer } from './shortsPlayer.ts';
import { YT_PLAYER_STATES } from './shortsPlayer.ts';

export type LandingPreviewPhase = 'idle' | 'loading' | 'playing' | 'paused' | 'failed';

export interface LandingPreviewSnapshot {
  videoId: string | null;
  token: number;
  phase: LandingPreviewPhase;
  playedMs: number;
  firstMotionConfirmed: boolean;
}

interface LandingPreviewCallbacks {
  onStatus?: (snapshot: LandingPreviewSnapshot) => void;
  onProgress?: (videoId: string, playedMs: number) => void;
  onComplete?: (videoId: string) => void;
  onFailure?: (videoId: string) => void;
  onManualPause?: (videoId: string) => void;
}

const PREVIEW_DURATION_MS = 2500;
const STARTUP_TIMEOUT_MS = 5000;
const OBSERVE_MS = 200;

/**
 * The sole owner of application-issued commands for a landing preview.
 * Iframe creation/destruction remains in the React host; the controller owns
 * mute, play, pause, timing, stale-token rejection, and completion.
 */
export class LandingPreviewController {
  private readonly callbacks: LandingPreviewCallbacks;
  private token = 0;
  private videoId: string | null = null;
  private player: YouTubePlayer | null = null;
  private phase: LandingPreviewPhase = 'idle';
  private playedMs = 0;
  private lastTime: number | null = null;
  private firstMotionConfirmed = false;
  private allowed = false;
  private appPausePending = false;
  private startupTimer: ReturnType<typeof setTimeout> | null = null;
  private observationTimer: ReturnType<typeof setInterval> | null = null;

  constructor(callbacks: LandingPreviewCallbacks = {}) {
    this.callbacks = callbacks;
  }

  snapshot(): LandingPreviewSnapshot {
    return {
      videoId: this.videoId,
      token: this.token,
      phase: this.phase,
      playedMs: this.playedMs,
      firstMotionConfirmed: this.firstMotionConfirmed,
    };
  }

  activate(videoId: string, alreadyPlayedMs = 0): number {
    this.stopCurrent(false);
    this.appPausePending = false;
    this.token += 1;
    this.videoId = videoId;
    this.playedMs = Math.max(0, Math.min(PREVIEW_DURATION_MS, alreadyPlayedMs));
    this.lastTime = null;
    this.firstMotionConfirmed = false;
    this.allowed = true;
    this.phase = 'loading';
    const capturedToken = this.token;
    this.startupTimer = setTimeout(() => {
      if (!this.matches(capturedToken)) return;
      this.fail();
    }, STARTUP_TIMEOUT_MS);
    this.emit();
    return capturedToken;
  }

  attach(token: number, player: YouTubePlayer): boolean {
    if (!this.matches(token)) return false;
    this.player = player;
    // Landing previews are always isolated from full-Shorts sound settings.
    player.setVolume(100);
    player.mute();
    // Readiness can arrive while scrolling, Help, or document visibility has
    // suspended playback. Retain the prepared player so the later resume does
    // not need to recreate it, but do not autoplay during the suspension.
    if (!this.allowed) {
      this.phase = 'paused';
      this.emit();
      return true;
    }
    player.playVideo();
    this.beginObservation(token, player);
    return true;
  }

  detach(token: number, player: YouTubePlayer) {
    if (!this.matches(token) || this.player !== player) return;
    this.player = null;
    this.clearObservation();
  }

  handleState(token: number, player: YouTubePlayer, state: number) {
    if (!this.matchesPlayer(token, player)) return;
    if (state === YT_PLAYER_STATES.PLAYING) {
      this.phase = 'playing';
      this.emit();
      return;
    }
    if (state === YT_PLAYER_STATES.BUFFERING || state === YT_PLAYER_STATES.CUED || state === YT_PLAYER_STATES.UNSTARTED) {
      this.phase = 'loading';
      this.emit();
      return;
    }
    if (state === YT_PLAYER_STATES.PAUSED) {
      if (this.appPausePending) {
        this.appPausePending = false;
        return;
      }
      // A pre-motion PAUSED callback is an autoplay outcome, not proof that a
      // person pressed pause. The five-second startup guard owns that case.
      if (!this.firstMotionConfirmed) return;
      this.allowed = false;
      this.phase = 'paused';
      this.clearTimers();
      this.emit();
      if (this.videoId) this.callbacks.onManualPause?.(this.videoId);
    }
  }

  handleAutoplayBlocked(token: number, player: YouTubePlayer) {
    if (this.matchesPlayer(token, player)) this.fail();
  }

  handleError(token: number, player: YouTubePlayer) {
    if (this.matchesPlayer(token, player)) this.fail();
  }

  handleCreationFailure(token: number) {
    if (this.matches(token)) this.fail();
  }

  suspend() {
    if (!this.videoId || !this.allowed) return;
    this.allowed = false;
    if (this.player && (this.phase === 'playing' || this.phase === 'loading')) {
      this.appPausePending = true;
      this.player.pauseVideo();
    }
    this.phase = 'paused';
    this.clearTimers();
    this.emit();
  }

  resume() {
    if (!this.videoId || this.phase === 'failed' || this.playedMs >= PREVIEW_DURATION_MS) return;
    if (this.allowed && (this.phase === 'playing' || this.phase === 'loading')) return;
    this.allowed = true;
    this.phase = 'loading';
    const capturedToken = this.token;
    this.startupTimer = setTimeout(() => {
      if (this.matches(capturedToken)) this.fail();
    }, STARTUP_TIMEOUT_MS);
    if (this.player) {
      this.player.setVolume(100);
      this.player.mute();
      this.player.playVideo();
      this.beginObservation(capturedToken, this.player);
    }
    this.emit();
  }

  deactivate(): number {
    const progress = this.playedMs;
    this.stopCurrent(true);
    return progress;
  }

  destroy() {
    this.stopCurrent(true);
  }

  private beginObservation(token: number, player: YouTubePlayer) {
    this.clearObservation();
    this.observationTimer = setInterval(() => {
      if (!this.matchesPlayer(token, player) || !this.allowed) return;
      const current = Number(player.getCurrentTime());
      if (!Number.isFinite(current) || current < 0) return;
      if (this.lastTime != null && current > this.lastTime) {
        const deltaMs = Math.min(500, (current - this.lastTime) * 1000);
        if (deltaMs > 0) {
          this.playedMs = Math.min(PREVIEW_DURATION_MS, this.playedMs + deltaMs);
          this.firstMotionConfirmed = true;
          this.clearStartup();
          this.phase = 'playing';
          if (this.videoId) this.callbacks.onProgress?.(this.videoId, this.playedMs);
          this.emit();
        }
      }
      this.lastTime = current;
      if (this.playedMs < PREVIEW_DURATION_MS) return;
      const completedId = this.videoId;
      this.appPausePending = true;
      player.pauseVideo();
      this.allowed = false;
      this.phase = 'idle';
      this.clearTimers();
      this.emit();
      if (completedId) this.callbacks.onComplete?.(completedId);
    }, OBSERVE_MS);
  }

  private fail() {
    const failedId = this.videoId;
    if (this.player && (this.phase === 'playing' || this.phase === 'loading')) {
      this.appPausePending = true;
      this.player.pauseVideo();
    }
    this.allowed = false;
    this.phase = 'failed';
    this.clearTimers();
    this.emit();
    if (failedId) this.callbacks.onFailure?.(failedId);
  }

  private stopCurrent(invalidate: boolean) {
    if (this.player && (this.phase === 'playing' || this.phase === 'loading')) {
      this.appPausePending = true;
      this.player.pauseVideo();
    }
    this.clearTimers();
    this.player = null;
    this.allowed = false;
    this.phase = 'idle';
    this.lastTime = null;
    if (invalidate) this.token += 1;
    if (invalidate) this.videoId = null;
    this.emit();
  }

  private matches(token: number) {
    return token === this.token && Boolean(this.videoId);
  }

  private matchesPlayer(token: number, player: YouTubePlayer) {
    return this.matches(token) && this.player === player;
  }

  private clearStartup() {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    this.startupTimer = null;
  }

  private clearObservation() {
    if (this.observationTimer) clearInterval(this.observationTimer);
    this.observationTimer = null;
  }

  private clearTimers() {
    this.clearStartup();
    this.clearObservation();
  }

  private emit() {
    this.callbacks.onStatus?.(this.snapshot());
  }
}

export const LANDING_PREVIEW_DURATION_MS = PREVIEW_DURATION_MS;
export const LANDING_PREVIEW_STARTUP_TIMEOUT_MS = STARTUP_TIMEOUT_MS;

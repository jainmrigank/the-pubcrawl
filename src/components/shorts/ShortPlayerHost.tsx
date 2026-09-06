import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { ShortVideo } from '../../types';
import {
  applyMutedSound,
  applySound,
  createYouTubePlayer,
  YT_PLAYER_STATES,
  type YouTubePlayer,
} from '../../shortsPlayer';

/**
 * The Shorts route deliberately has one playback owner. The host owns only
 * the iframe's lifetime and reports native events; all navigation decisions
 * are represented by the selected video's generation.
 */
export interface ShortPlayerHostProps {
  active: boolean;
  short: ShortVideo;
  index: number;
  generation: number;
  startAudible: boolean;
  desiredAudible: boolean;
  volume: number;
  preferredRate: number;
  online: boolean;
  suspended?: boolean;
  onReady?: (player: YouTubePlayer) => void;
  onStateChange?: (state: number, player: YouTubePlayer) => void;
  onPlaying?: (startupMs: number, player: YouTubePlayer) => void;
  onBuffering?: (player: YouTubePlayer) => void;
  onError?: (code: number, player: YouTubePlayer) => void;
  onAutoplayBlocked?: (player: YouTubePlayer) => void;
  onPlaybackRateChange?: (rate: number) => void;
  onNativeSound?: (muted: boolean, volume: number) => void;
}

export interface ShortPlayerHostHandle {
  /** Read the current native control state before a navigation gesture. */
  syncNativeSound: () => void;
}

type HostPhase = 'initializing' | 'loading' | 'playing' | 'paused' | 'buffering' | 'blocked' | 'offline' | 'error';

interface StartCommand {
  videoId: string;
  generation: number;
  issued: boolean;
  retryUsed: boolean;
  progressed: boolean;
  manualPause: boolean;
}

const MOTION_THRESHOLD = 0.08;
const SOUND_OBSERVE_MS = 200;
const STARTUP_RETRY_MS = 1500;
const LOADING_STATUS_MS = 700;

function clampVolume(value: number): number {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 100)));
}

function clampRate(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.min(2, Math.max(0.25, value)) : 1;
}

function currentVideoId(player: YouTubePlayer): string | null {
  try {
    const url = player.getVideoUrl?.();
    if (!url) return null;
    const match = url.match(/[?&]v=([^&#]+)/) || url.match(/\/shorts\/([^/?#]+)/);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

export const ShortPlayerHost = forwardRef<ShortPlayerHostHandle, ShortPlayerHostProps>(function ShortPlayerHost({
  active,
  short,
  index,
  generation,
  startAudible,
  desiredAudible,
  volume,
  preferredRate,
  online,
  suspended = false,
  onReady,
  onStateChange,
  onPlaying,
  onBuffering,
  onError,
  onAutoplayBlocked,
  onPlaybackRateChange,
  onNativeSound,
}: ShortPlayerHostProps, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const expectedIdRef = useRef(short.id);
  const generationRef = useRef(generation);
  const activeRef = useRef(active);
  const suspendedRef = useRef(suspended);
  const desiredAudibleRef = useRef(desiredAudible);
  const startAudibleRef = useRef(startAudible);
  const volumeRef = useRef(clampVolume(volume));
  const preferredRateRef = useRef(clampRate(preferredRate));
  const onReadyRef = useRef(onReady);
  const onStateChangeRef = useRef(onStateChange);
  const onPlayingRef = useRef(onPlaying);
  const onBufferingRef = useRef(onBuffering);
  const onErrorRef = useRef(onError);
  const onAutoplayBlockedRef = useRef(onAutoplayBlocked);
  const onPlaybackRateChangeRef = useRef(onPlaybackRateChange);
  const onNativeSoundRef = useRef(onNativeSound);
  const commandRef = useRef<StartCommand>({
    videoId: short.id,
    generation,
    issued: false,
    retryUsed: false,
    progressed: false,
    manualPause: false,
  });
  const firstMotionRef = useRef(false);
  const startupAtRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const loadingTimerRef = useRef<number | null>(null);
  const postLoadRestoreTimerRef = useRef<number | null>(null);
  const loopEpochRef = useRef(0);
  const loopRestartedEpochRef = useRef<number | null>(null);
  const soundObservationSuppressedUntilRef = useRef(0);
  const observedSoundRef = useRef<{ muted: boolean; volume: number } | null>(null);
  const observedRateRef = useRef<number | null>(null);
  const applyingRateRef = useRef(false);
  // `manualPauseRef` describes a pause made through YouTube's native
  // controls. `appPauseRef` describes a pause we issued for a route,
  // visibility, or tutorial transition. Keeping them separate prevents a
  // hidden/overlay pause from being mistaken for a user pause (and vice
  // versa), which is what used to make a later Short wait for a tap.
  const manualPauseRef = useRef(false);
  const appPauseRef = useRef(false);
  const resumeIntentRef = useRef(false);
  const disposedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<HostPhase>(online ? 'initializing' : 'offline');
  const [revealed, setRevealed] = useState(false);
  const [showLoading, setShowLoading] = useState(true);

  generationRef.current = generation;
  activeRef.current = active;
  suspendedRef.current = suspended;
  expectedIdRef.current = short.id;
  desiredAudibleRef.current = desiredAudible;
  startAudibleRef.current = startAudible;
  volumeRef.current = clampVolume(volume);
  preferredRateRef.current = clampRate(preferredRate);
  onReadyRef.current = onReady;
  onStateChangeRef.current = onStateChange;
  onPlayingRef.current = onPlaying;
  onBufferingRef.current = onBuffering;
  onErrorRef.current = onError;
  onAutoplayBlockedRef.current = onAutoplayBlocked;
  onPlaybackRateChangeRef.current = onPlaybackRateChange;
  onNativeSoundRef.current = onNativeSound;

  const clearTimer = (ref: { current: number | null }) => {
    if (ref.current != null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  };

  const isCurrent = (player: YouTubePlayer, command = commandRef.current) => {
    if (disposedRef.current || !activeRef.current || suspendedRef.current) return false;
    if (playerRef.current !== player) return false;
    if (command.generation !== generationRef.current || command.videoId !== expectedIdRef.current) return false;
    const nativeId = currentVideoId(player);
    return !nativeId || nativeId === expectedIdRef.current;
  };

  const rememberSound = (player: YouTubePlayer) => {
    try {
      observedSoundRef.current = { muted: Boolean(player.isMuted()), volume: clampVolume(player.getVolume()) };
    } catch {
      observedSoundRef.current = null;
    }
  };

  const suppressSoundObservation = (duration = 700) => {
    soundObservationSuppressedUntilRef.current = Math.max(
      soundObservationSuppressedUntilRef.current,
      performance.now() + duration,
    );
  };

  const syncNativeSound = () => {
    const player = playerRef.current;
    if (!player || !activeRef.current || suspendedRef.current) return;
    try {
      const next = { muted: Boolean(player.isMuted()), volume: clampVolume(player.getVolume()) };
      const previous = observedSoundRef.current;
      observedSoundRef.current = next;
      volumeRef.current = next.volume;
      if (previous && (previous.muted !== next.muted || previous.volume !== next.volume)) {
        onNativeSoundRef.current?.(next.muted, next.volume);
      }
    } catch {}
  };

  useImperativeHandle(ref, () => ({ syncNativeSound }), []);

  const applyRate = (player: YouTubePlayer) => {
    if (!player.setPlaybackRate) return;
    const rate = clampRate(preferredRateRef.current);
    applyingRateRef.current = true;
    try {
      player.setPlaybackRate(rate);
      observedRateRef.current = rate;
    } catch {
      // Older/mobile players may reject the rate briefly.
    } finally {
      window.setTimeout(() => { applyingRateRef.current = false; }, 0);
    }
  };

  const beginLoadingStatus = () => {
    clearTimer(loadingTimerRef);
    setShowLoading(true);
    loadingTimerRef.current = window.setTimeout(() => {
      loadingTimerRef.current = null;
      if (!firstMotionRef.current && activeRef.current && !suspendedRef.current) setShowLoading(true);
    }, LOADING_STATUS_MS);
  };

  const confirmMotion = (player: YouTubePlayer, command: StartCommand) => {
    if (!isCurrent(player, command) || firstMotionRef.current) return;
    let moving = false;
    try {
      moving = player.getPlayerState() === YT_PLAYER_STATES.PLAYING && player.getCurrentTime() > MOTION_THRESHOLD;
    } catch {}
    if (!moving) return;
    firstMotionRef.current = true;
    command.progressed = true;
    clearTimer(retryTimerRef);
    clearTimer(loadingTimerRef);
    setShowLoading(false);
    setPhase('playing');
    setRevealed(true);
    const startupAt = startupAtRef.current;
    startupAtRef.current = null;
    onPlayingRef.current?.(startupAt == null ? 0 : Math.max(0, Math.round(performance.now() - startupAt)), player);
  };

  /**
   * A few mobile YouTube/WebKit builds reset the native level while a new
   * video is loading. Repair that one load-time reset without issuing another
   * playback command or taking ownership away from the native controls.
   */
  const restoreSoundAfterLoad = (
    player: YouTubePlayer,
    command: StartCommand,
    requestedAudible: boolean,
  ) => {
    if (!isCurrent(player, command) || command.manualPause || firstMotionRef.current) return;
    let muted = true;
    let currentVolume = volumeRef.current;
    let state: number = YT_PLAYER_STATES.UNSTARTED;
    try {
      muted = Boolean(player.isMuted());
      currentVolume = clampVolume(player.getVolume());
      state = player.getPlayerState();
    } catch {
      return;
    }
    // A load may already have handed control to the autoplay fallback. Do
    // not re-unmute that recovery while it is buffering or playing.
    if (state === YT_PLAYER_STATES.PLAYING || command.retryUsed) return;
    if (state !== YT_PLAYER_STATES.CUED && state !== YT_PLAYER_STATES.UNSTARTED && state !== YT_PLAYER_STATES.PAUSED && state !== YT_PLAYER_STATES.BUFFERING) return;
    const targetVolume = clampVolume(volumeRef.current);
    if (currentVolume !== targetVolume || (requestedAudible && muted) || (!requestedAudible && !muted)) {
      if (requestedAudible) applySound(player, false, targetVolume);
      else applyMutedSound(player, targetVolume);
      suppressSoundObservation();
      rememberSound(player);
    }
  };

  const schedulePostLoadSoundRestore = (
    player: YouTubePlayer,
    command: StartCommand,
    requestedAudible: boolean,
  ) => {
    clearTimer(postLoadRestoreTimerRef);
    // Repair a synchronous load reset before YouTube's autoplay task runs,
    // then make one bounded follow-up pass for implementations that reset the
    // native level asynchronously.
    restoreSoundAfterLoad(player, command, requestedAudible);
    postLoadRestoreTimerRef.current = window.setTimeout(() => {
      postLoadRestoreTimerRef.current = null;
      restoreSoundAfterLoad(player, command, requestedAudible);
    }, 0);
  };

  const issueMutedRecovery = (player: YouTubePlayer, command: StartCommand) => {
    if (!isCurrent(player, command) || command.retryUsed || command.manualPause || manualPauseRef.current) return false;
    let state: number = YT_PLAYER_STATES.UNSTARTED;
    let time = 0;
    try {
      state = player.getPlayerState();
      time = player.getCurrentTime();
    } catch {}
    if (command.progressed || time > MOTION_THRESHOLD || (state !== YT_PLAYER_STATES.CUED && state !== YT_PLAYER_STATES.UNSTARTED && state !== YT_PLAYER_STATES.PAUSED)) return false;
    command.retryUsed = true;
    try {
      applyMutedSound(player, volumeRef.current);
      player.playVideo();
      suppressSoundObservation();
      rememberSound(player);
      setPhase('loading');
      beginLoadingStatus();
      return true;
    } catch {
      return false;
    }
  };

  const issueInitialStart = (player: YouTubePlayer) => {
    const command = commandRef.current;
    if (!isCurrent(player, command) || command.issued || command.manualPause) return;
    command.issued = true;
    startupAtRef.current = performance.now();
    beginLoadingStatus();
    try {
      // Audible playback is attempted only once. If WebKit rejects it, the
      // autoplay callback or the bounded timer invokes muted recovery without
      // changing the saved preference.
      if (desiredAudibleRef.current && (startAudibleRef.current || activeRef.current)) {
        applySound(player, false, volumeRef.current);
      } else {
        applyMutedSound(player, volumeRef.current);
      }
      suppressSoundObservation();
      applyRate(player);
      player.playVideo();
      rememberSound(player);
      setPhase('loading');
    } catch {
      setPhase('blocked');
    }
    clearTimer(retryTimerRef);
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      if (!isCurrent(player, command) || firstMotionRef.current) return;
      issueMutedRecovery(player, command);
    }, STARTUP_RETRY_MS);
  };

  // One iframe is created for the lifetime of this active route. The mount
  // node is never keyed by the selected video, so React renders cannot
  // recreate or re-cue the player.
  useEffect(() => {
    disposedRef.current = false;
    // A connectivity transition tears down and recreates the iframe while
    // this React host stays mounted. The previous activation's motion marker
    // must not prevent the replacement player from revealing its first frame.
    firstMotionRef.current = false;
    startupAtRef.current = null;
    if (!active || !online || !hostRef.current) {
      setPhase(online ? 'initializing' : 'offline');
      setReady(false);
      setRevealed(false);
      setShowLoading(!online);
      return;
    }

    const mount = document.createElement('div');
    mount.className = 'shorts-player-mount';
    hostRef.current.replaceChildren(mount);
    const effectGeneration = generation;
    let cancelled = false;

    const onReadyForMount = (player: YouTubePlayer) => {
      if (cancelled || disposedRef.current || !activeRef.current) {
        try { player.destroy(); } catch {}
        return;
      }
      playerRef.current = player;
      // A user can navigate while the YouTube API is still loading. Use the
      // latest refs rather than the mount effect's initial closure so the
      // obsolete constructor video is never started first.
      const readyId = expectedIdRef.current;
      const readyGeneration = generationRef.current;
      commandRef.current = {
        videoId: readyId,
        generation: readyGeneration,
        issued: false,
        retryUsed: false,
        progressed: false,
        manualPause: false,
      };
      manualPauseRef.current = false;
      appPauseRef.current = false;
      resumeIntentRef.current = false;
      const iframe = mount.querySelector('iframe');
      iframe?.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      setReady(true);
      setPhase('loading');
      onReadyRef.current?.(player);
      if (readyId !== short.id || readyGeneration !== effectGeneration) {
        startupAtRef.current = performance.now();
        beginLoadingStatus();
        try {
          if (desiredAudibleRef.current && startAudibleRef.current) applySound(player, false, volumeRef.current);
          else applyMutedSound(player, volumeRef.current);
          suppressSoundObservation();
          applyRate(player);
          rememberSound(player);
          // The constructor was created with autoplay disabled. Loading the
          // latest selected id is the only start command needed here.
          player.loadVideoById(readyId);
          rememberSound(player);
          schedulePostLoadSoundRestore(
            player,
            commandRef.current,
            Boolean(desiredAudibleRef.current && startAudibleRef.current),
          );
        } catch {
          setPhase('error');
        }
      } else {
        applyRate(player);
        issueInitialStart(player);
      }
    };

    const onStateForMount = (player: YouTubePlayer, state: number) => {
      if (cancelled || !isCurrent(player)) return;
      const command = commandRef.current;
      onStateChangeRef.current?.(state, player);
      if (state === YT_PLAYER_STATES.PLAYING) {
        // Any genuine progress means the application has successfully started
        // this activation. A later native PAUSED event is therefore a manual
        // pause unless we explicitly marked it as an app lifecycle pause.
        manualPauseRef.current = false;
        command.manualPause = false;
        clearTimer(retryTimerRef);
        let currentTime = 0;
        try { currentTime = player.getCurrentTime(); } catch {}
        if (currentTime > MOTION_THRESHOLD) command.progressed = true;
        if (currentTime > MOTION_THRESHOLD && loopRestartedEpochRef.current === loopEpochRef.current) {
          // A natural loop has produced a fresh frame. Release the duplicate
          // END guard so the next real end can loop once as well.
          loopRestartedEpochRef.current = null;
        }
        if (currentTime > MOTION_THRESHOLD) confirmMotion(player, command);
        else {
          setPhase('loading');
          window.setTimeout(() => confirmMotion(player, command), 120);
        }
        return;
      }
      if (state === YT_PLAYER_STATES.BUFFERING) {
        clearTimer(retryTimerRef);
        setPhase(firstMotionRef.current ? 'playing' : 'buffering');
        if (!firstMotionRef.current) beginLoadingStatus();
        onBufferingRef.current?.(player);
        return;
      }
      if (state === YT_PLAYER_STATES.PAUSED) {
        if (appPauseRef.current || suspendedRef.current) {
          setPhase('paused');
          return;
        }
        // Once this activation has produced motion, PAUSED is a native user
        // pause unless an app lifecycle pause is in flight. Before first
        // motion it may be the browser's audible-autoplay rejection, so let
        // the one-shot muted recovery decide instead of stranding the card.
        if (firstMotionRef.current || manualPauseRef.current) {
          manualPauseRef.current = true;
          command.manualPause = true;
          resumeIntentRef.current = false;
          setPhase('paused');
          return;
        }
        if (!issueMutedRecovery(player, command)) setPhase('paused');
        return;
      }
      if (state === YT_PLAYER_STATES.ENDED) {
        if (loopRestartedEpochRef.current === loopEpochRef.current) return;
        loopRestartedEpochRef.current = loopEpochRef.current;
        try {
          player.seekTo(0, true);
          player.playVideo();
          setPhase('loading');
          if (!firstMotionRef.current) beginLoadingStatus();
        } catch {}
        return;
      }
      if (state === YT_PLAYER_STATES.CUED || state === YT_PLAYER_STATES.UNSTARTED) setPhase('loading');
    };

    const onErrorForMount = (player: YouTubePlayer, code: number) => {
      if (cancelled || !isCurrent(player)) return;
      clearTimer(retryTimerRef);
      setPhase('error');
      onErrorRef.current?.(code, player);
    };

    const onAutoplayBlockedForMount = (player: YouTubePlayer) => {
      if (cancelled || !isCurrent(player)) return;
      const recovered = issueMutedRecovery(player, commandRef.current);
      if (!recovered) setPhase('blocked');
      onAutoplayBlockedRef.current?.(player);
    };

    const onRateForMount = (player: YouTubePlayer, rate: number) => {
      if (cancelled || !isCurrent(player)) return;
      const normalized = clampRate(rate);
      if (applyingRateRef.current && observedRateRef.current === normalized) return;
      observedRateRef.current = normalized;
      onPlaybackRateChangeRef.current?.(normalized);
    };

    let creationCancelled = false;
    void createYouTubePlayer(mount, short.id, {
      onReady: onReadyForMount,
      onStateChange: onStateForMount,
      onError: onErrorForMount,
      onAutoplayBlocked: onAutoplayBlockedForMount,
      onPlaybackRateChange: onRateForMount,
    }, () => creationCancelled || cancelled || disposedRef.current).catch(() => {
      if (!cancelled) {
        setPhase('error');
        setReady(false);
      }
    });

    return () => {
      cancelled = true;
      creationCancelled = true;
      // Route changes unmount the host before the parent can navigate again.
      // Capture a native YouTube change made immediately before leaving so a
      // same-session re-entry restores the user's sound and volume choice.
      syncNativeSound();
      disposedRef.current = true;
      firstMotionRef.current = false;
      startupAtRef.current = null;
      clearTimer(retryTimerRef);
      clearTimer(loadingTimerRef);
      clearTimer(postLoadRestoreTimerRef);
      loopEpochRef.current += 1;
      try { playerRef.current?.pauseVideo(); } catch {}
      try { playerRef.current?.destroy(); } catch {}
      playerRef.current = null;
      mount.remove();
      setReady(false);
      setRevealed(false);
    };
    // This effect intentionally mounts once for the active route. Video
    // changes are handled by the navigation effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, online]);

  // Navigation changes the video inside the same player instance. Mark the
  // command before loading so no React effect can issue a duplicate start.
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !ready || !active || !online) return;
    const previous = commandRef.current;
    if (previous.videoId === short.id && previous.generation === generation) return;
    clearTimer(retryTimerRef);
    clearTimer(loadingTimerRef);
    clearTimer(postLoadRestoreTimerRef);
    expectedIdRef.current = short.id;
    commandRef.current = {
      videoId: short.id,
      generation,
      issued: true,
      retryUsed: false,
      progressed: false,
      manualPause: false,
    };
    manualPauseRef.current = false;
    appPauseRef.current = false;
    resumeIntentRef.current = false;
    firstMotionRef.current = false;
    loopEpochRef.current += 1;
    loopRestartedEpochRef.current = null;
    startupAtRef.current = performance.now();
    setRevealed(false);
    setPhase('loading');
    beginLoadingStatus();
    try {
      if (desiredAudible && startAudible) applySound(player, false, clampVolume(volume));
      else applyMutedSound(player, clampVolume(volume));
      suppressSoundObservation();
      applyRate(player);
      rememberSound(player);
      // loadVideoById is the single navigation start command. YouTube begins
      // playback from this call; no unconditional playVideo follows it.
      player.loadVideoById(short.id);
      schedulePostLoadSoundRestore(player, commandRef.current, Boolean(desiredAudible && startAudible));
    } catch {
      setPhase('error');
    }
  }, [active, generation, online, ready, short.id, startAudible, desiredAudible, volume, preferredRate]);

  // Native YouTube controls are the only sound UI. Observe the active iframe
  // without writing to it, and persist changes through the parent callback.
  useEffect(() => {
    const player = playerRef.current;
    if (!active || !ready || !player || suspended) return;
    rememberSound(player);
    const timer = window.setInterval(() => {
      if (!activeRef.current || suspendedRef.current || playerRef.current !== player) return;
      try {
        const next = { muted: Boolean(player.isMuted()), volume: clampVolume(player.getVolume()) };
        const suppressed = performance.now() < soundObservationSuppressedUntilRef.current;
        // During the short window after an application-controlled load/mute,
        // keep the last known baseline intact.  YouTube can apply those
        // commands asynchronously; recording the transient value here would
        // make a real native change disappear before the observer is allowed
        // to persist it.  The next unsuppressed tick compares the settled
        // native state against the baseline captured by rememberSound().
        if (suppressed) return;
        const previous = observedSoundRef.current;
        observedSoundRef.current = next;
        volumeRef.current = next.volume;
        if (previous && (previous.muted !== next.muted || previous.volume !== next.volume)) onNativeSoundRef.current?.(next.muted, next.volume);
      } catch {}
    }, SOUND_OBSERVE_MS);
    return () => window.clearInterval(timer);
  }, [active, ready, suspended, short.id, generation]);

  // Pause/resume for visibility, tutorial, and route overlays without
  // destroying the iframe or changing the selected video.
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !ready) return;
    if (!active || !online || suspended) {
      let state: number = YT_PLAYER_STATES.PAUSED;
      try { state = player.getPlayerState(); } catch {}
      resumeIntentRef.current = !manualPauseRef.current && (
        state === YT_PLAYER_STATES.PLAYING ||
        state === YT_PLAYER_STATES.BUFFERING ||
        state === YT_PLAYER_STATES.CUED ||
        state === YT_PLAYER_STATES.UNSTARTED ||
        (commandRef.current.issued && !firstMotionRef.current)
      );
      appPauseRef.current = true;
      clearTimer(retryTimerRef);
      try { player.pauseVideo(); } catch {}
      return;
    }
    if (appPauseRef.current) {
      appPauseRef.current = false;
      const shouldResume = resumeIntentRef.current && !manualPauseRef.current;
      resumeIntentRef.current = false;
      if (shouldResume) {
        try {
          // Resuming after a lifecycle transition is no longer a user
          // activation. Start muted so WebKit cannot strand the card; the
          // desired-audible preference remains stored for the next gesture.
          applyMutedSound(player, volumeRef.current);
          suppressSoundObservation();
          // Establish the application-controlled muted state as the observer
          // baseline. Without this, the next 200ms read could mistake our
          // lifecycle fallback for a native user mute and overwrite the
          // desired-audible session preference.
          rememberSound(player);
          player.playVideo();
          setPhase('loading');
        } catch {}
      }
    }
    commandRef.current.manualPause = manualPauseRef.current;
  }, [active, online, ready, suspended]);

  useEffect(() => {
    const onVisibility = () => {
      const player = playerRef.current;
      if (!player || !ready) return;
      if (document.hidden) {
        // Capture a native YouTube volume/mute change before pausing. The
        // browser may background the iframe immediately after this event, so
        // waiting for the 200ms observer would lose the user's latest choice.
        syncNativeSound();
        let state: number = YT_PLAYER_STATES.PAUSED;
        try { state = player.getPlayerState(); } catch {}
        resumeIntentRef.current = !manualPauseRef.current && (
          state === YT_PLAYER_STATES.PLAYING ||
          state === YT_PLAYER_STATES.BUFFERING ||
          state === YT_PLAYER_STATES.CUED ||
          state === YT_PLAYER_STATES.UNSTARTED
        );
        appPauseRef.current = true;
        clearTimer(retryTimerRef);
        try { player.pauseVideo(); } catch {}
      } else if (activeRef.current && !suspendedRef.current && appPauseRef.current) {
        appPauseRef.current = false;
        const shouldResume = resumeIntentRef.current && !manualPauseRef.current;
        resumeIntentRef.current = false;
        if (shouldResume) {
          try {
            applyMutedSound(player, volumeRef.current);
            suppressSoundObservation();
            rememberSound(player);
            player.playVideo();
            setPhase('loading');
          } catch {}
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [ready]);

  useEffect(() => {
    loopRestartedEpochRef.current = null;
  }, [generation]);

  const status = !online
    ? 'OFFLINE · RECONNECT TO PLAY'
    : phase === 'blocked'
      ? 'TAP TO PLAY'
      : phase === 'error'
        ? 'VIDEO UNAVAILABLE'
        : phase === 'buffering'
          ? 'LOADING..'
          : showLoading && !firstMotionRef.current
          ? 'LOADING..'
          : '';

  return (
    <div
      className={`shorts-player-layer ${revealed ? 'is-revealed' : ''}`}
      data-player-phase={phase}
      data-player-ready={ready ? 'true' : 'false'}
      data-player-id={short.id}
      data-player-index={index}
      data-player-generation={generation}
    >
      <div ref={hostRef} className="shorts-player-host" aria-label={`${short.title} YouTube player`} />
      {!ready && <div className="shorts-startup-surface" aria-hidden="true" />}
      {status && (
        <div
          className={`shorts-player-status ${ready ? '' : 'is-startup'}`.trim()}
          role="status"
          aria-live="polite"
        >
          {status}
        </div>
      )}
    </div>
  );
});

import { useEffect, useRef, useState } from 'react';
import type { ShortVideo } from '../../types';
import { createYouTubePlayer, YT_PLAYER_STATES, type YouTubePlayer } from '../../shortsPlayer';
import { Play } from '../../icons';
import type { ShortsStartAttempt, ShortsStartAuthorization } from '../../shortsSoundPolicy';
import {
  waitForShortsInitialization,
  type InitializationLease,
} from '../../shortsPlayerPool';
interface ShortPlayerHostProps {
  index: number;
  short: ShortVideo;
  enabled: boolean;
  initPriority: number;
  shouldPlay: boolean;
  manualMode: boolean;
  manualToken: number;
  playLeaseGeneration: number | null;
  startAuthorization: ShortsStartAuthorization | null;
  muted: boolean;
  volume: number;
  online: boolean;
  failed: boolean;
  onManual: (index: number) => void;
  onRegister: (index: number, player: YouTubePlayer) => void;
  onUnregister: (index: number, player: YouTubePlayer) => void;
  onPlaying: (index: number, generation: number | null, startupMs: number, player: YouTubePlayer) => void;
  onCued: (index: number, generation: number | null, player: YouTubePlayer) => void;
  onBuffering: (index: number, generation: number | null) => void;
  onError: (index: number, generation: number | null, code: number) => void;
  onAutoplayBlocked: (index: number, generation: number | null, player: YouTubePlayer) => boolean;
  onPlaybackRateChange: (index: number, generation: number | null, rate: number) => void;
  onClaimStart: (index: number, generation: number, attempt: ShortsStartAttempt, requestedAudible: boolean) => boolean;
  onStartProgress: (index: number, generation: number | null) => void;
  onRequestInitialize: (index: number, priority: number, start: (signal: AbortSignal) => Promise<void>) => InitializationLease;
}

type ShortPlayerPhase = 'initializing' | 'cued' | 'starting' | 'confirming' | 'playing' | 'blocked' | 'stalled';

const STARTUP_REVEAL_DELAY_MS = 220;
const STARTUP_REVEAL_TIME_SECONDS = 0.08;
const IFRAME_INITIALIZATION_TIMEOUT_MS = 12_000;

/** A slide owns its player shell; the parent decides which directional pool slots stay mounted. */
export function ShortPlayerHost({
  index,
  short,
  enabled,
  initPriority,
  shouldPlay,
  manualMode,
  manualToken,
  playLeaseGeneration,
  startAuthorization,
  muted,
  volume,
  online,
  failed,
  onManual,
  onRegister,
  onUnregister,
  onPlaying,
  onCued,
  onBuffering,
  onError,
  onAutoplayBlocked,
  onPlaybackRateChange,
  onClaimStart,
  onStartProgress,
  onRequestInitialize,
}: ShortPlayerHostProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const initializationLeaseRef = useRef<InitializationLease | null>(null);
  const shouldPlayRef = useRef(shouldPlay);
  const leaseGenerationRef = useRef<number | null>(playLeaseGeneration);
  const startAuthorizationRef = useRef<ShortsStartAuthorization | null>(startAuthorization);
  const mutedRef = useRef(muted);
  const volumeRef = useRef(volume);
  const onRegisterRef = useRef(onRegister);
  const onUnregisterRef = useRef(onUnregister);
  const onPlayingRef = useRef(onPlaying);
  const onCuedRef = useRef(onCued);
  const onBufferingRef = useRef(onBuffering);
  const onErrorRef = useRef(onError);
  const onAutoplayBlockedRef = useRef(onAutoplayBlocked);
  const onPlaybackRateChangeRef = useRef(onPlaybackRateChange);
  const onClaimStartRef = useRef(onClaimStart);
  const onStartProgressRef = useRef(onStartProgress);
  const onRequestInitializeRef = useRef(onRequestInitialize);
  const requestStartedAt = useRef<number | null>(null);
  const startupTimerRef = useRef<number | null>(null);
  const loadingCopyTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const confirmPlaybackRef = useRef<(player: YouTubePlayer, generation: number | null) => void>(() => {});
  const playRequestRef = useRef(false);
  const cueIssuedRef = useRef(false);
  const cuedRef = useRef(false);
  const playbackConfirmedRef = useRef(false);
  const loopRestartPendingRef = useRef(false);
  const loopReleaseTimerRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [cued, setCued] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [phase, setPhase] = useState<ShortPlayerPhase>('initializing');
  const [showLoadingCopy, setShowLoadingCopy] = useState(false);
  const [initializationAttempt, setInitializationAttempt] = useState(0);

  shouldPlayRef.current = shouldPlay;
  leaseGenerationRef.current = playLeaseGeneration;
  startAuthorizationRef.current = startAuthorization;
  mutedRef.current = muted;
  volumeRef.current = volume;
  onRegisterRef.current = onRegister;
  onUnregisterRef.current = onUnregister;
  onPlayingRef.current = onPlaying;
  onCuedRef.current = onCued;
  onBufferingRef.current = onBuffering;
  onErrorRef.current = onError;
  onAutoplayBlockedRef.current = onAutoplayBlocked;
  onPlaybackRateChangeRef.current = onPlaybackRateChange;
  onClaimStartRef.current = onClaimStart;
  onStartProgressRef.current = onStartProgress;
  onRequestInitializeRef.current = onRequestInitialize;

  useEffect(() => {
    initializationLeaseRef.current?.updatePriority(initPriority);
  }, [initPriority]);

  useEffect(() => {
    let disposed = false;
    const clearStartupTimer = () => {
      if (startupTimerRef.current != null) {
        window.clearTimeout(startupTimerRef.current);
        startupTimerRef.current = null;
      }
    };
    const clearLoadingCopyTimer = () => {
      if (loadingCopyTimerRef.current != null) {
        window.clearTimeout(loadingCopyTimerRef.current);
        loadingCopyTimerRef.current = null;
      }
    };
    const clearRetryTimer = () => {
      if (retryTimerRef.current != null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
    const clearRevealTimer = () => {
      if (revealTimerRef.current != null) {
        window.clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };
    const clearLoopReleaseTimer = () => {
      if (loopReleaseTimerRef.current != null) {
        window.clearTimeout(loopReleaseTimerRef.current);
        loopReleaseTimerRef.current = null;
      }
    };

    const confirmPlayback = (player: YouTubePlayer, generation: number | null) => {
      clearRevealTimer();
      clearLoopReleaseTimer();
      revealTimerRef.current = window.setTimeout(() => {
        revealTimerRef.current = null;
        if (disposed || !shouldPlayRef.current || leaseGenerationRef.current !== generation) return;
        try {
          const state = player.getPlayerState();
          const currentTime = Math.max(0, player.getCurrentTime() || 0);
          if (state === YT_PLAYER_STATES.PLAYING && currentTime >= STARTUP_REVEAL_TIME_SECONDS) {
            playbackConfirmedRef.current = true;
            setPhase('playing');
            setRevealed(true);
            return;
          }
          if (state === YT_PLAYER_STATES.PLAYING) confirmPlayback(player, generation);
        } catch {
          // A later state event retries confirmation while the iframe settles.
        }
      }, STARTUP_REVEAL_DELAY_MS);
    };
    confirmPlaybackRef.current = confirmPlayback;

    if (!enabled || !online || failed || !hostRef.current) {
      clearStartupTimer();
      clearLoadingCopyTimer();
      clearRetryTimer();
      clearRevealTimer();
      const old = playerRef.current;
      if (old) {
        onUnregisterRef.current(index, old);
        old.destroy();
        playerRef.current = null;
      }
      setReady(false);
      setCued(false);
      setRevealed(false);
      setShowLoadingCopy(false);
      setPhase('initializing');
      playRequestRef.current = false;
      cueIssuedRef.current = false;
      cuedRef.current = false;
      playbackConfirmedRef.current = false;
      loopRestartPendingRef.current = false;
      return;
    }

    let created: YouTubePlayer | null = null;
    let cancelQueued: InitializationLease | null = null;
    let releaseInitialization = () => {};
    let initializationExpired = false;
    // YouTube mutates the element passed to YT.Player. Give it a DOM shell
    // React does not reconcile so StrictMode/effect teardown cannot race the
    // iframe API's own child removal.
    const mount = document.createElement('div');
    hostRef.current.appendChild(mount);
    setReady(false);
    setCued(false);
    setRevealed(false);
    setShowLoadingCopy(false);
    setAutoplayBlocked(false);
    setPhase('initializing');
    playRequestRef.current = false;
    cueIssuedRef.current = false;
    cuedRef.current = false;
    playbackConfirmedRef.current = false;
    loopRestartPendingRef.current = false;

    const start = async (signal: AbortSignal) => {
      const initialized = new Promise<void>((resolve) => {
        releaseInitialization = resolve;
      });
      try {
        // Build a shell first. The reviewed id is cued exactly once from
        // onReady; this avoids YouTube racing an implicit loadVideoById call.
        created = await createYouTubePlayer(mount, undefined, {
          onReady: (player) => {
            if (disposed || initializationExpired) {
              releaseInitialization();
              player.destroy();
              return;
            }
            created = player;
            playerRef.current = player;
            const iframe = mount.querySelector('iframe');
            iframe?.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
            onRegisterRef.current(index, player);
            const gestureStart = startAuthorizationRef.current;
            const audibleGesture = Boolean(
              gestureStart &&
              gestureStart.index === index &&
              gestureStart.generation === leaseGenerationRef.current &&
              gestureStart.mode === 'gesture-audible' &&
              !gestureStart.fallbackUsed &&
              !mutedRef.current,
            );
            // Every prepared/automatic player is muted. Only a still-valid
            // direct gesture may preserve an audible start for this lease.
            try {
              player.setVolume(volumeRef.current);
              if (!audibleGesture) player.mute();
            } catch {}
            if (!cueIssuedRef.current) {
              cueIssuedRef.current = true;
              player.cueVideoById(short.id);
            }
            setReady(true);
            releaseInitialization();
          },
          onStateChange: (player, state) => {
            if (disposed || initializationExpired) return;
            if (state === YT_PLAYER_STATES.PLAYING) {
              clearStartupTimer();
              clearRetryTimer();
              // A browser may reject the first audible command and then
              // accept the one muted recovery. Once motion is confirmed the
              // player is no longer blocked; retaining this flag would force
              // a tap when the same prepared iframe becomes active again.
              setAutoplayBlocked(false);
              playRequestRef.current = true;
              const generation = leaseGenerationRef.current;
              onStartProgressRef.current(index, generation);
              if (loopRestartPendingRef.current && loopReleaseTimerRef.current == null) {
                loopReleaseTimerRef.current = window.setTimeout(() => {
                  loopReleaseTimerRef.current = null;
                  if (disposed || !shouldPlayRef.current || leaseGenerationRef.current !== generation) return;
                  try {
                    if (player.getPlayerState() === YT_PLAYER_STATES.PLAYING && player.getCurrentTime() >= STARTUP_REVEAL_TIME_SECONDS) {
                      loopRestartPendingRef.current = false;
                    }
                  } catch {}
                }, 350);
              }
              if (playbackConfirmedRef.current) {
                setPhase('playing');
                setRevealed(true);
              } else {
                setPhase('confirming');
                confirmPlayback(player, generation);
              }
              const startedAt = requestStartedAt.current;
              requestStartedAt.current = null;
              onPlayingRef.current(index, generation, startedAt == null ? 0 : Math.max(0, Math.round(performance.now() - startedAt)), player);
            } else if (state === YT_PLAYER_STATES.BUFFERING) {
              onStartProgressRef.current(index, leaseGenerationRef.current);
              // Reveal is monotonic for a mounted video. Buffering before the
              // first frame keeps the black surface; buffering after motion
              // leaves the iframe visible and never re-cues it.
              if (!playbackConfirmedRef.current) clearRevealTimer();
              // Buffering is progress, not a retry condition. Never interrupt
              // this player with a second play command.
              setPhase(playbackConfirmedRef.current ? 'playing' : 'starting');
              onBufferingRef.current(index, leaseGenerationRef.current);
            } else if (state === YT_PLAYER_STATES.CUED) {
              cuedRef.current = true;
              setCued(true);
              setPhase('cued');
              onCuedRef.current(index, leaseGenerationRef.current, player);
            } else if (state === YT_PLAYER_STATES.PAUSED && !shouldPlayRef.current) {
              // YouTube can emit PAUSED after the parent has already revoked
              // a lease. Keep the DOM phase honest so a stopped neighbour is
              // never mistaken for a second concurrently playing player. A
              // confirmed mounted iframe stays revealed so revisiting it
              // cannot create an app-induced black flash.
              setPhase(cuedRef.current ? 'cued' : 'initializing');
            } else if (state === YT_PLAYER_STATES.ENDED && shouldPlayRef.current && leaseGenerationRef.current != null && cuedRef.current) {
              if (loopRestartPendingRef.current) return;
              loopRestartPendingRef.current = true;
              // One host owns looping. Seeking the existing player keeps its
              // revealed iframe and avoids a cue/recreate/black-flash cycle.
              player.seekTo(0, true);
              player.playVideo();
            }
          },
          onError: (_player, code) => {
            if (disposed || initializationExpired) return;
            releaseInitialization();
            clearStartupTimer();
            clearRetryTimer();
            clearRevealTimer();
            setRevealed(false);
            if (code === 153) setPhase('blocked');
            onErrorRef.current(index, leaseGenerationRef.current, code);
          },
          onAutoplayBlocked: (player) => {
            if (disposed || initializationExpired) return;
            releaseInitialization();
            clearStartupTimer();
            clearRetryTimer();
            clearRevealTimer();
            const retryMuted = onAutoplayBlockedRef.current(index, leaseGenerationRef.current, player);
            if (retryMuted) {
              // Keep the host in its blocked state while the parent performs
              // the one muted recovery.  Clearing this flag here would let
              // the automatic play effect observe the same paused iframe and
              // issue a second retry, defeating the one-shot fallback.
              setAutoplayBlocked(true);
              setPhase('starting');
            } else {
              setAutoplayBlocked(true);
              setPhase('blocked');
            }
          },
          onPlaybackRateChange: (_player, rate) => {
            if (disposed || initializationExpired) return;
            onPlaybackRateChangeRef.current(index, leaseGenerationRef.current, rate);
          },
        }, () => disposed || signal.aborted);
        // Do not let the queue launch another shell until this one has
        // actually fired onReady (or a terminal callback). The constructor
        // promise resolves before that event in the IFrame API.
        if (disposed || signal.aborted || initializationExpired) {
          created.destroy();
          return;
        }
        await waitForShortsInitialization(initialized, IFRAME_INITIALIZATION_TIMEOUT_MS, () => {
          initializationExpired = true;
          const stalledPlayer = created || playerRef.current;
          if (stalledPlayer) {
            onUnregisterRef.current(index, stalledPlayer);
            try { stalledPlayer.destroy(); } catch {}
          }
          if (playerRef.current === stalledPlayer) playerRef.current = null;
          created = null;
        });
      } catch {
        // A failed API bootstrap is a configuration/network problem, not a
        // dead video. Keep the facade and expose tap-to-play rather than
        // cycling the whole visit into manual mode.
        if (!disposed) {
          setAutoplayBlocked(true);
          setPhase('blocked');
          // A readiness timeout is local to this iframe. It releases the
          // bounded queue and can be retried through the facade without
          // labelling the entire YouTube configuration as invalid.
          if (!initializationExpired) onErrorRef.current(index, leaseGenerationRef.current, 153);
        }
      }
    };

    cancelQueued = onRequestInitializeRef.current(index, initPriority, start);
    initializationLeaseRef.current = cancelQueued;

    return () => {
      disposed = true;
      cancelQueued?.();
      releaseInitialization();
      clearStartupTimer();
      clearLoadingCopyTimer();
      clearRetryTimer();
      clearRevealTimer();
      clearLoopReleaseTimer();
      playRequestRef.current = false;
      loopRestartPendingRef.current = false;
      const player = created || playerRef.current;
      if (player) {
        onUnregisterRef.current(index, player);
        player.destroy();
      }
      if (playerRef.current === player) playerRef.current = null;
      initializationLeaseRef.current = null;
      if (mount.parentNode) mount.parentNode.removeChild(mount);
      if (confirmPlaybackRef.current === confirmPlayback) confirmPlaybackRef.current = () => {};
    };
  }, [enabled, failed, index, initializationAttempt, online, short.id]);

  // Revoking a lease is an imperative boundary: clear delayed commands even
  // before the next state event arrives from the iframe.
  useEffect(() => {
    if (playLeaseGeneration != null) return;
    playRequestRef.current = false;
    if (startupTimerRef.current != null) {
      window.clearTimeout(startupTimerRef.current);
      startupTimerRef.current = null;
    }
    if (loadingCopyTimerRef.current != null) {
      window.clearTimeout(loadingCopyTimerRef.current);
      loadingCopyTimerRef.current = null;
    }
    setShowLoadingCopy(false);
    if (retryTimerRef.current != null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (revealTimerRef.current != null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    try {
      playerRef.current?.pauseVideo();
    } catch {}
    setPhase(cuedRef.current ? 'cued' : 'initializing');
  }, [playLeaseGeneration]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !ready) return;
    if (startupTimerRef.current != null) {
      window.clearTimeout(startupTimerRef.current);
      startupTimerRef.current = null;
    }
    if (retryTimerRef.current != null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (!shouldPlay || playLeaseGeneration == null) {
      player.pauseVideo();
      setShowLoadingCopy(false);
      playRequestRef.current = false;
      setPhase(cuedRef.current ? 'cued' : 'initializing');
      return;
    }
    const generation = playLeaseGeneration;
    if (autoplayBlocked && manualToken === 0) return;
    if (manualToken > 0 && autoplayBlocked) setAutoplayBlocked(false);
    // Activation may beat the asynchronous CUED event. Keep the request
    // pending; only CUED is allowed to transition into playVideo.
    playRequestRef.current = true;
    if (!cued) return;
    const authorization = startAuthorizationRef.current;
    const gestureAuthorized = Boolean(
      authorization &&
      authorization.index === index &&
      authorization.generation === generation &&
      authorization.mode === 'gesture-audible' &&
      !authorization.fallbackUsed &&
      !mutedRef.current,
    );
    try {
      const state = player.getPlayerState();
      if (state === YT_PLAYER_STATES.PLAYING) {
        // A harmless lease refresh can happen while YouTube is already
        // playing. Re-arm first-frame confirmation for the current generation
        // instead of waiting for another PLAYING event that may never arrive.
        if (playbackConfirmedRef.current) {
          setPhase('playing');
          setRevealed(true);
        } else {
          setPhase('confirming');
          confirmPlaybackRef.current(player, generation);
        }
        return;
      }
      if (state === YT_PLAYER_STATES.BUFFERING) return;
      // Prepared players and passive settlements are always muted. A direct
      // gesture may already have unmuted this active player in the same input
      // task; never remute it from a later React effect.
      player.setVolume(Math.max(0, Math.min(100, Math.round(volume))));
      if (!gestureAuthorized) player.mute();
    } catch {}
    if (!onClaimStartRef.current(index, generation, 'initial', gestureAuthorized)) return;
    requestStartedAt.current = performance.now();
    setPhase('starting');
    if (loadingCopyTimerRef.current != null) {
      window.clearTimeout(loadingCopyTimerRef.current);
      loadingCopyTimerRef.current = null;
    }
    setShowLoadingCopy(false);
    loadingCopyTimerRef.current = window.setTimeout(() => {
      loadingCopyTimerRef.current = null;
      if (leaseGenerationRef.current === generation && shouldPlayRef.current && !revealed) {
        setShowLoadingCopy(true);
      }
    }, 700);
    player.playVideo();
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      if (leaseGenerationRef.current !== generation || !shouldPlayRef.current || !playRequestRef.current || !cuedRef.current) return;
      try {
        const state = player.getPlayerState();
        if (state === YT_PLAYER_STATES.PLAYING || state === YT_PLAYER_STATES.BUFFERING) return;
        if (state === YT_PLAYER_STATES.CUED || state === YT_PLAYER_STATES.PAUSED || state === YT_PLAYER_STATES.UNSTARTED) {
          if (onClaimStartRef.current(index, generation, 'retry', false)) {
            player.mute();
            player.playVideo();
          }
        }
      } catch {}
    }, 1500);
    startupTimerRef.current = window.setTimeout(() => {
      startupTimerRef.current = null;
      if (leaseGenerationRef.current !== generation || !shouldPlayRef.current || revealed || !playRequestRef.current) return;
      try {
        const state = player.getPlayerState();
        if (state === YT_PLAYER_STATES.PLAYING || state === YT_PLAYER_STATES.BUFFERING) return;
      } catch {}
      setPhase('stalled');
      // Keep the facade calm during normal startup, but do not leave a stalled
      // active card in an indefinite waiting state. Six seconds gives the
      // queued iframe and a slow mobile connection room to reach PLAYING while
      // still offering an explicit tap when startup is genuinely stuck.
    }, 6000);
    return () => {
      if (startupTimerRef.current != null) {
        window.clearTimeout(startupTimerRef.current);
        startupTimerRef.current = null;
      }
      if (loadingCopyTimerRef.current != null) {
        window.clearTimeout(loadingCopyTimerRef.current);
        loadingCopyTimerRef.current = null;
      }
      setShowLoadingCopy(false);
      if (retryTimerRef.current != null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  // `startAuthorization` is read through a ref on purpose.  A direct sound
  // gesture can synchronously issue unmute + play; re-running this effect just
  // because React committed the authorization would turn the same gesture
  // into a second passive play attempt (and could re-trigger iOS autoplay
  // policy).  Changes that affect automatic playback still flow through the
  // existing lease/cued/ready dependencies.
  }, [autoplayBlocked, cued, manualToken, playLeaseGeneration, ready, shouldPlay, volume]);

  const waitingForAutoplay = shouldPlay && !autoplayBlocked && phase !== 'blocked' && phase !== 'stalled';
  const interactiveFacade = shouldPlay || manualMode || failed || autoplayBlocked || phase === 'blocked' || phase === 'stalled' || !online;
  const facadeLabel = !interactiveFacade
    ? ''
    : !online
      ? 'OFFLINE · RECONNECT TO PLAY'
      : failed
        ? 'SKIPPED'
        : manualMode && !shouldPlay
          ? 'TAP TO PLAY'
          : autoplayBlocked || phase === 'blocked'
            ? 'TAP TO PLAY'
            : phase === 'stalled'
              ? 'TAP TO PLAY · SWIPE TO SKIP'
              : waitingForAutoplay
                ? ''
                : 'TAP TO PLAY';
  const showPlayControl = interactiveFacade && !waitingForAutoplay && !failed;

  return (
    <div
      className={`shorts-player-layer ${revealed ? 'is-revealed' : ''}`}
      data-player-phase={phase}
      data-player-ready={ready ? 'true' : 'false'}
      data-player-cued={cued ? 'true' : 'false'}
    >
      {enabled && online && !failed && <div ref={hostRef} className="shorts-player-host" aria-hidden={!(revealed && shouldPlay)} />}
      {!revealed && (
        <button
          className={`shorts-facade ${online ? '' : 'is-offline'} ${waitingForAutoplay ? 'is-waiting' : ''}`}
          onClick={() => {
            if (!playerRef.current && (phase === 'blocked' || phase === 'stalled')) {
              setInitializationAttempt((attempt) => attempt + 1);
            }
            onManual(index);
          }}
          aria-label={online && !failed ? (waitingForAutoplay ? short.title : `Play ${short.title}`) : `${short.title}. ${facadeLabel}`}
          disabled={!online || failed}
        >
          <span className="shorts-startup-surface" aria-hidden="true" />
          {showPlayControl && <span className="shorts-facade-play"><Play size={24} /></span>}
          {showLoadingCopy && <span className="k-label shorts-loading-copy" role="status">LOADING VIDEO…</span>}
          {facadeLabel && <span className="k-label shorts-tap">{facadeLabel}</span>}
        </button>
      )}
    </div>
  );
}

/**
 * Small, dependency-free adapter around the YouTube IFrame Player API.
 * Keeping the API surface here makes the Shorts feed testable without making
 * YouTube (or its network) part of the React component's state machine.
 */

export const YT_PLAYER_STATES = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

export type YouTubePlayerState = (typeof YT_PLAYER_STATES)[keyof typeof YT_PLAYER_STATES];

export interface YouTubePlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo?: () => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  getCurrentTime: () => number;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  cueVideoById: (videoId: string) => void;
  loadVideoById: (videoId: string) => void;
  getPlayerState: () => number;
  getPlaybackRate?: () => number;
  setPlaybackRate?: (rate: number) => void;
  getAvailablePlaybackRates?: () => number[];
  getIframe?: () => HTMLIFrameElement;
  destroy: () => void;
}

interface YouTubeEvent<T = YouTubePlayer> {
  target: T;
  data?: number;
}

export interface YouTubePlayerHandlers {
  onReady?: (player: YouTubePlayer) => void;
  onStateChange?: (player: YouTubePlayer, state: number) => void;
  onError?: (player: YouTubePlayer, code: number) => void;
  onAutoplayBlocked?: (player: YouTubePlayer) => void;
  onPlaybackRateChange?: (player: YouTubePlayer, rate: number) => void;
}

interface YouTubePlayerOptions {
  host?: string;
  videoId?: string;
  playerVars: Record<string, string | number>;
  events: {
    onReady?: (event: YouTubeEvent) => void;
    onStateChange?: (event: YouTubeEvent) => void;
    onError?: (event: YouTubeEvent) => void;
    onAutoplayBlocked?: (event: YouTubeEvent) => void;
    onPlaybackRateChange?: (event: YouTubeEvent) => void;
  };
}

interface YouTubeNamespace {
  Player: new (element: HTMLElement, options: YouTubePlayerOptions) => YouTubePlayer;
}

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YouTubeNamespace> | null = null;

/** Load the API script once per page, including when another component began loading it. */
export function loadYouTubeApi(): Promise<YouTubeNamespace> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('YouTube is only available in a browser'));
  }
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
    const scriptSelector = 'script[src="https://www.youtube.com/iframe_api"]';
    const existing = document.querySelector<HTMLScriptElement>(scriptSelector);
    const previousReady = window.onYouTubeIframeAPIReady;
    let timer: number | undefined;

    const fail = () => {
      if (timer != null) window.clearTimeout(timer);
      apiPromise = null;
      reject(new Error('Could not load the YouTube player'));
    };
    const ready = () => {
      if (timer != null) window.clearTimeout(timer);
      previousReady?.();
      if (window.YT?.Player) resolve(window.YT);
      else fail();
    };

    window.onYouTubeIframeAPIReady = ready;
    timer = window.setTimeout(fail, 15000);
    if (existing) {
      existing.addEventListener('error', fail, { once: true });
    } else {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.addEventListener('error', fail, { once: true });
      document.head.appendChild(script);
    }
  });
  return apiPromise;
}

function playerVars(id?: string | null): Record<string, string | number> {
  const vars: Record<string, string | number> = {
    autoplay: 0,
    controls: 1,
    enablejsapi: 1,
    // Shorts owns natural looping in the active host. Enabling YouTube's loop
    // at the same time produces duplicate restarts and visible rebuffering.
    loop: 0,
    playsinline: 1,
    rel: 0,
    origin: window.location.origin,
  };
  if (id) vars.playlist = id;
  return vars;
}

/** Create one privacy-enhanced player in a supplied shell. */
export async function createYouTubePlayer(
  element: HTMLElement,
  id: string | null | undefined,
  handlers: YouTubePlayerHandlers = {},
  isCancelled: () => boolean = () => false
): Promise<YouTubePlayer> {
  const YT = await loadYouTubeApi();
  // React StrictMode intentionally mounts effects twice in development. Do
  // not construct an iframe for an effect that was already cleaned up while
  // the shared API script was loading.
  if (isCancelled() || !element.isConnected) throw new Error('player creation cancelled');
  const options: YouTubePlayerOptions = {
    host: 'https://www.youtube-nocookie.com',
    playerVars: playerVars(id),
    events: {
      onReady: (event) => handlers.onReady?.(event.target),
      onStateChange: (event) => handlers.onStateChange?.(event.target, event.data ?? YT_PLAYER_STATES.UNSTARTED),
      onError: (event) => handlers.onError?.(event.target, event.data ?? 0),
      onAutoplayBlocked: (event) => handlers.onAutoplayBlocked?.(event.target),
      onPlaybackRateChange: (event) => handlers.onPlaybackRateChange?.(event.target, event.data ?? 1),
    },
  };
  // A shell without a video is intentional. Shorts cues the reviewed id once
  // onReady; passing a videoId here makes YouTube race its implicit load with
  // our activation command and is the source of most retry facades.
  if (id) options.videoId = id;
  return new YT.Player(element, options);
}

export function applySound(player: YouTubePlayer, muted: boolean, volume: number): void {
  try {
    if (muted) {
      player.setVolume(Math.max(0, Math.min(100, Math.round(volume))));
      player.mute();
    } else {
      // Some WebKit/YouTube combinations ignore a level written while the
      // iframe is muted.  Unmute first, then apply the retained level while
      // the same user-activation task is still running.  Otherwise the next
      // player can expose the misleading "sound on at zero" state and make
      // the native control require two presses.
      player.unMute();
      player.setVolume(Math.max(0, Math.min(100, Math.round(volume))));
    }
  } catch {
    // The API can briefly reject commands between iframe creation and ready.
  }
}

/**
 * Apply the safe preparation state used by every non-active Shorts iframe.
 * Keeping this separate from applySound makes it impossible for a queue or
 * React effect to accidentally unmute a player outside a user gesture.
 */
export function applyMutedSound(player: YouTubePlayer, volume: number): void {
  try {
    player.setVolume(Math.max(0, Math.min(100, Math.round(volume))));
    player.mute();
  } catch {
    // The API can briefly reject commands between iframe creation and ready.
  }
}

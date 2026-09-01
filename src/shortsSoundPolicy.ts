/** Pure, browser-independent sound/start decisions for the Shorts host. */

export type ShortsStartMode = 'muted-autoplay' | 'gesture-audible';

export interface ShortsStartAuthorization {
  index: number;
  generation: number;
  mode: ShortsStartMode;
  fallbackUsed: boolean;
}

/** A direct gesture can request sound only when the preference is unmuted. */
export function startModeForGesture(muted: boolean, directGesture: boolean): ShortsStartMode {
  return directGesture && !muted ? 'gesture-audible' : 'muted-autoplay';
}

/** The player states that are safe to start synchronously from a gesture. */
export function playerReadyForStart(state: number): boolean {
  return state === 1 || state === 2 || state === 3 || state === 5;
}

/** Guard every delayed callback against route, index, and generation changes. */
export function audibleAuthorizationMatches(
  authorization: ShortsStartAuthorization | null | undefined,
  index: number,
  generation: number,
  desiredMuted: boolean,
): boolean {
  return Boolean(
    authorization &&
    authorization.index === index &&
    authorization.generation === generation &&
    authorization.mode === 'gesture-audible' &&
    !authorization.fallbackUsed &&
    !desiredMuted,
  );
}

/** Permit exactly one audible-to-muted recovery for a still-current lease. */
export function mutedFallbackAuthorization(
  authorization: ShortsStartAuthorization | null | undefined,
  index: number,
  generation: number,
): ShortsStartAuthorization | null {
  if (!audibleAuthorizationMatches(authorization, index, generation, false)) return null;
  return { ...authorization!, mode: 'muted-autoplay', fallbackUsed: true };
}

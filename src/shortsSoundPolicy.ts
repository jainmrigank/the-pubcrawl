/** Pure, browser-independent sound/start decisions for the Shorts host. */

export type ShortsStartMode = 'muted-autoplay' | 'gesture-audible';

export interface ShortsStartAuthorization {
  index: number;
  generation: number;
  mode: ShortsStartMode;
  fallbackUsed: boolean;
}

export interface ShortsSessionSoundPreference {
  version: 1;
  desiredAudible: boolean;
  volume: number;
}

export const SHORTS_SOUND_SESSION_KEY = 'pubcrawl.shorts.sound.v1';

export interface ShortsStartCommand {
  shortId: string;
  index: number;
  generation: number;
  requestedAudible: boolean;
  issued: boolean;
  retryUsed: boolean;
  progressed: boolean;
}

export type ShortsStartAttempt = 'initial' | 'retry';

export function clampShortsVolume(volume: number): number {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(volume) ? volume : 100)));
}

export function defaultShortsSoundPreference(): ShortsSessionSoundPreference {
  return { version: 1, desiredAudible: false, volume: 100 };
}

export function parseShortsSoundPreference(raw: string | null | undefined): ShortsSessionSoundPreference {
  if (!raw) return defaultShortsSoundPreference();
  try {
    const value = JSON.parse(raw) as Partial<ShortsSessionSoundPreference>;
    if (value.version !== 1 || typeof value.desiredAudible !== 'boolean' || typeof value.volume !== 'number') {
      return defaultShortsSoundPreference();
    }
    return { version: 1, desiredAudible: value.desiredAudible, volume: clampShortsVolume(value.volume) };
  } catch {
    return defaultShortsSoundPreference();
  }
}

export function readShortsSoundPreference(storage?: Pick<Storage, 'getItem'> | null): ShortsSessionSoundPreference {
  const target = storage ?? (typeof window === 'undefined' ? null : window.sessionStorage);
  if (!target) return defaultShortsSoundPreference();
  try { return parseShortsSoundPreference(target.getItem(SHORTS_SOUND_SESSION_KEY)); }
  catch { return defaultShortsSoundPreference(); }
}

export function writeShortsSoundPreference(
  preference: ShortsSessionSoundPreference,
  storage?: Pick<Storage, 'setItem'> | null,
): ShortsSessionSoundPreference {
  const normalized = {
    version: 1 as const,
    desiredAudible: Boolean(preference.desiredAudible),
    volume: clampShortsVolume(preference.volume),
  };
  const target = storage ?? (typeof window === 'undefined' ? null : window.sessionStorage);
  try { target?.setItem(SHORTS_SOUND_SESSION_KEY, JSON.stringify(normalized)); } catch {}
  return normalized;
}

export function createShortsStartCommand(
  shortId: string,
  index: number,
  generation: number,
  requestedAudible: boolean,
): ShortsStartCommand {
  return { shortId, index, generation, requestedAudible, issued: false, retryUsed: false, progressed: false };
}

/** Claim is pure so the browser arbiter and deterministic policy tests share the same rules. */
export function claimShortsStart(
  command: ShortsStartCommand,
  attempt: ShortsStartAttempt,
): { allowed: boolean; command: ShortsStartCommand } {
  if (command.progressed) return { allowed: false, command };
  if (attempt === 'initial') {
    if (command.issued) return { allowed: false, command };
    return { allowed: true, command: { ...command, issued: true } };
  }
  if (!command.issued || command.retryUsed) return { allowed: false, command };
  return { allowed: true, command: { ...command, retryUsed: true } };
}

export function markShortsStartProgress(command: ShortsStartCommand): ShortsStartCommand {
  return command.progressed ? command : { ...command, progressed: true };
}

/** Return the only automatic attempt still available for this lease. */
export function nextShortsStartAttempt(
  command: ShortsStartCommand | null | undefined,
): ShortsStartAttempt | null {
  if (!command || !command.issued) return 'initial';
  if (command.progressed || command.retryUsed) return null;
  return 'retry';
}

/**
 * A fresh, explicit tap may recover a player after the automatic command is
 * exhausted or an earlier BUFFERING/PLAYING signal cancelled passive retries
 * without producing a frame. This deliberately does not mint a new lease
 * generation: the caller must still prove that the current index/generation
 * owns playback before calling it.
 */
export function resetShortsStartForManualRecovery(
  command: ShortsStartCommand,
): ShortsStartCommand {
  if (!command.issued) return command;
  return { ...command, issued: false, retryUsed: false, progressed: false };
}

/** Same-card snap corrections keep their lease until a real destination wins. */
export function shouldRevokeShortsLease(
  settledIndex: number,
  intendedIndex: number,
  displacement: number,
  feedHeight: number,
): boolean {
  if (intendedIndex !== settledIndex) return true;
  return Math.abs(displacement) >= Math.max(1, feedHeight) * 0.35;
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

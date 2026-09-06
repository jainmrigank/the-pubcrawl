/**
 * Browser-independent persistence helpers for the Shorts native controls.
 *
 * Playback commands deliberately do not live here. The persistent YouTube
 * host is the only command owner; this module only validates the session
 * preferences that the host reads and the native-control observer writes.
 */

export interface ShortsSessionSoundPreference {
  version: 1;
  desiredAudible: boolean;
  volume: number;
}

export interface ShortsSessionRatePreference {
  version: 1;
  preferredRate: number;
}

export const SHORTS_SOUND_SESSION_KEY = 'pubcrawl.shorts.sound.v1';
export const SHORTS_SOUND_NORMALIZED_KEY = 'pubcrawl.shorts.sound.normalized.v1';
// A second marker lets the one-time migration distinguish a deliberately
// selected native volume of zero from the unusable zero left by the retired
// player implementation. It is session-scoped and contains no user data.
export const SHORTS_SOUND_ZERO_INTENT_KEY = 'pubcrawl.shorts.sound.zero-intent.v1';
export const SHORTS_RATE_SESSION_KEY = 'pubcrawl.shorts.rate.v1';

export function clampShortsVolume(value: number): number {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 100)));
}

export function defaultShortsSoundPreference(): ShortsSessionSoundPreference {
  return { version: 1, desiredAudible: false, volume: 100 };
}

/**
 * Repair the contradictory state written by the retired pooled-player
 * implementation. This is intentionally a pure one-time migration helper:
 * a deliberate native volume of zero remains valid after the marker is set.
 */
export function healShortsSoundPreference(
  preference: ShortsSessionSoundPreference,
): ShortsSessionSoundPreference {
  if (!preference.desiredAudible || preference.volume > 0) return preference;
  return { ...preference, volume: 100 };
}

export function parseShortsSoundPreference(raw: string | null | undefined): ShortsSessionSoundPreference {
  if (!raw) return defaultShortsSoundPreference();
  try {
    const value = JSON.parse(raw) as Partial<ShortsSessionSoundPreference>;
    if (
      value.version !== 1 ||
      typeof value.desiredAudible !== 'boolean' ||
      typeof value.volume !== 'number'
    ) return defaultShortsSoundPreference();
    return {
      version: 1,
      desiredAudible: value.desiredAudible,
      volume: clampShortsVolume(value.volume),
    };
  } catch {
    return defaultShortsSoundPreference();
  }
}

export function readShortsSoundPreference(
  storage?: Pick<Storage, 'getItem'> & Partial<Pick<Storage, 'setItem'>> | null,
): ShortsSessionSoundPreference {
  const target = storage ?? (typeof window === 'undefined' ? null : window.sessionStorage);
  if (!target) return defaultShortsSoundPreference();
  try {
    const parsed = parseShortsSoundPreference(target.getItem(SHORTS_SOUND_SESSION_KEY));
    const explicitlySelectedZero = target.getItem(SHORTS_SOUND_ZERO_INTENT_KEY) === '1';
    // Existing releases could have already written the normalized marker
    // before the zero-volume repair shipped. Heal that stale state too, but
    // leave a zero that this release observed from an intentional native
    // control change untouched.
    if (!explicitlySelectedZero && parsed.desiredAudible && parsed.volume === 0) {
      const healed = healShortsSoundPreference(parsed);
      target.setItem?.(SHORTS_SOUND_SESSION_KEY, JSON.stringify(healed));
      target.setItem?.(SHORTS_SOUND_NORMALIZED_KEY, '1');
      return healed;
    }
    if (target.getItem(SHORTS_SOUND_NORMALIZED_KEY) !== '1') {
      const healed = healShortsSoundPreference(parsed);
      target.setItem?.(SHORTS_SOUND_SESSION_KEY, JSON.stringify(healed));
      target.setItem?.(SHORTS_SOUND_NORMALIZED_KEY, '1');
      return healed;
    }
    return parsed;
  } catch {
    return defaultShortsSoundPreference();
  }
}

export function writeShortsSoundPreference(
  preference: ShortsSessionSoundPreference,
  storage?: Pick<Storage, 'setItem'> & Partial<Pick<Storage, 'removeItem'>> | null,
): ShortsSessionSoundPreference {
  const normalized: ShortsSessionSoundPreference = {
    version: 1,
    desiredAudible: Boolean(preference.desiredAudible),
    volume: clampShortsVolume(preference.volume),
  };
  const target = storage ?? (typeof window === 'undefined' ? null : window.sessionStorage);
  try {
    target?.setItem(SHORTS_SOUND_SESSION_KEY, JSON.stringify(normalized));
    if (normalized.desiredAudible && normalized.volume === 0) {
      target?.setItem(SHORTS_SOUND_ZERO_INTENT_KEY, '1');
    } else {
      target?.removeItem?.(SHORTS_SOUND_ZERO_INTENT_KEY);
    }
  } catch {}
  return normalized;
}

export function defaultShortsRatePreference(): ShortsSessionRatePreference {
  return { version: 1, preferredRate: 1 };
}

export function clampShortsRate(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.min(2, Math.max(0.25, value)) : 1;
}

export function parseShortsRatePreference(raw: string | null | undefined): ShortsSessionRatePreference {
  if (!raw) return defaultShortsRatePreference();
  try {
    const value = JSON.parse(raw) as Partial<ShortsSessionRatePreference>;
    if (value.version !== 1 || typeof value.preferredRate !== 'number') return defaultShortsRatePreference();
    return { version: 1, preferredRate: clampShortsRate(value.preferredRate) };
  } catch {
    return defaultShortsRatePreference();
  }
}

export function readShortsRatePreference(storage?: Pick<Storage, 'getItem'> | null): ShortsSessionRatePreference {
  const target = storage ?? (typeof window === 'undefined' ? null : window.sessionStorage);
  if (!target) return defaultShortsRatePreference();
  try { return parseShortsRatePreference(target.getItem(SHORTS_RATE_SESSION_KEY)); }
  catch { return defaultShortsRatePreference(); }
}

export function writeShortsRatePreference(
  preference: ShortsSessionRatePreference,
  storage?: Pick<Storage, 'setItem'> | null,
): ShortsSessionRatePreference {
  const normalized: ShortsSessionRatePreference = {
    version: 1,
    preferredRate: clampShortsRate(preference.preferredRate),
  };
  const target = storage ?? (typeof window === 'undefined' ? null : window.sessionStorage);
  try { target?.setItem(SHORTS_RATE_SESSION_KEY, JSON.stringify(normalized)); } catch {}
  return normalized;
}

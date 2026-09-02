/** Pure policy helpers for the adaptive Shorts player pool. */

/**
 * Return the iframe slots to keep warm around the current scroll intent.
 *
 * On a normal connection we bias the five-slot window towards the direction
 * of travel (one slot behind and three ahead while moving forward, mirrored
 * while moving backward). `focusIndex` lets the UI move this preparation
 * window during a fling before the 50% visibility threshold changes the
 * actively playing card. The active slot is always retained.
 */
export function poolWindow(activeIndex, length, mode = 'pool', direction = 'forward', focusIndex = activeIndex) {
  if (!Number.isInteger(activeIndex) || !Number.isInteger(length) || length <= 0) return [];
  if (activeIndex < 0 || activeIndex >= length) return [];
  if (mode === 'manual') return [activeIndex];

  const anchor = Number.isInteger(focusIndex) && focusIndex >= 0 && focusIndex < length ? focusIndex : activeIndex;
  const isBackward = direction === 'backward';
  const wanted = mode === 'balanced'
    ? [activeIndex, anchor, anchor + (isBackward ? -1 : 1)]
    : isBackward
      ? [activeIndex, anchor, anchor - 1, anchor - 2, anchor - 3]
      : [activeIndex, anchor, anchor + 1, anchor + 2, anchor + 3];
  const unique = [];
  for (const index of wanted) {
    if (index >= 0 && index < length && !unique.includes(index)) unique.push(index);
  }
  const limit = mode === 'balanced' ? 3 : 5;
  if (!unique.includes(activeIndex)) {
    if (unique.length < limit) unique.push(activeIndex);
    else unique[unique.length - 1] = activeIndex;
  }
  // At a catalogue edge, use spare slots on the opposite side so the active
  // player still has a useful warm runway instead of collapsing to two slots.
  const fallbackStep = isBackward ? 1 : -1;
  let probe = anchor + fallbackStep;
  while (unique.length < limit && probe >= 0 && probe < length) {
    if (!unique.includes(probe)) unique.push(probe);
    probe += fallbackStep;
  }
  return unique.sort((a, b) => a - b);
}

/** Pause every registered player except the active slot. */
export function pauseOthers(players, activeIndex) {
  for (const [index, player] of players) {
    if (index === activeIndex) continue;
    // Pausing alone can leave an iframe audibly armed on iOS. Keep the pure
    // policy mirror aligned with the browser host: every inactive player is
    // muted before it is paused.
    player.mute?.();
    player.pauseVideo();
  }
}

/** Read the native YouTube state without losing the last useful volume while muted. */
export function soundPreference(player, previous = { muted: true, volume: 100 }) {
  try {
    const muted = Boolean(player.isMuted());
    const volume = Math.max(0, Math.min(100, Math.round(Number(player.getVolume()) || 0)));
    return { muted, volume: muted ? previous.volume : volume };
  } catch {
    return previous;
  }
}

/**
 * Prepare every cued player without ever making a prepared iframe audible.
 * The active player is unmuted separately by the browser gesture handler; a
 * passive pool update must only set volume, mute, and pause.
 */
export function preparePlayerSound(players, volume = 100) {
  const nextVolume = Math.max(0, Math.min(100, Math.round(Number(volume) || 0)));
  for (const player of players) {
    player.setVolume(nextVolume);
    player.mute();
    player.pauseVideo?.();
  }
  return { muted: true, volume: nextVolume };
}

/** Pure mirror of the browser's first-frame reveal gate. */
export function startupFacadeState(
  previous = { revealed: false, confirmed: false },
  { state = 'starting', currentTime = 0, stable = false } = {}
) {
  // Reveal is monotonic for a mounted video. Buffering and a natural loop can
  // temporarily report time zero; neither event may restore the black facade.
  if (previous.confirmed) return previous;
  if (state === 'buffering' && (!previous.confirmed || currentTime < 0.75)) {
    return { revealed: false, confirmed: false };
  }
  if (state === 'playing' && stable && currentTime >= 0.08) {
    return { revealed: true, confirmed: true };
  }
  return previous.confirmed ? previous : { revealed: false, confirmed: false };
}

export function playbackMode({ reducedMotion = false, saveData = false, effectiveType = '' } = {}) {
  const slow = effectiveType === 'slow-2g' || effectiveType === '2g';
  if (reducedMotion || saveData || slow) return 'manual';
  return effectiveType === '3g' ? 'balanced' : 'pool';
}

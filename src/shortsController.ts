/**
 * The Shorts feed's ownership model.  This module deliberately contains no
 * DOM or YouTube code: scroll/lifecycle events can be reduced synchronously,
 * and every player command can be guarded by the resulting lease.
 */

export type ShortsControllerPhase = 'idle' | 'scrolling' | 'overlay' | 'hidden' | 'route-inactive';
export type ShortsControllerDirection = 'forward' | 'backward';
export type ShortsControllerMode = 'pool' | 'balanced' | 'manual';

export interface PlayerLease {
  index: number;
  generation: number;
}

export interface ShortsControllerState {
  phase: ShortsControllerPhase;
  settledIndex: number;
  intentIndex: number;
  direction: ShortsControllerDirection;
  generation: number;
  lease: PlayerLease | null;
}

export type ShortsControllerEvent =
  | { type: 'route-enter'; index?: number }
  | { type: 'scroll-start'; direction?: ShortsControllerDirection }
  | { type: 'scroll-intent'; index: number; direction?: ShortsControllerDirection }
  | { type: 'scroll-settle'; index: number }
  | { type: 'overlay-open' }
  | { type: 'overlay-close'; resume: boolean }
  | { type: 'hidden' }
  | { type: 'route-inactive' }
  | { type: 'visible' };

export function createShortsControllerState(index = 0): ShortsControllerState {
  const safe = Number.isInteger(index) && index >= 0 ? index : 0;
  return {
    phase: 'route-inactive',
    settledIndex: safe,
    intentIndex: safe,
    direction: 'forward',
    generation: 0,
    lease: null,
  };
}

/** Apply one controller event and mint a new lease only on a real activation. */
export function transitionShortsController(
  state: ShortsControllerState,
  event: ShortsControllerEvent
): ShortsControllerState {
  const direction = event.type === 'scroll-start' || event.type === 'scroll-intent'
    ? event.direction || state.direction
    : state.direction;
  switch (event.type) {
    case 'route-enter': {
      const index = Number.isInteger(event.index) && (event.index || 0) >= 0 ? event.index || 0 : state.settledIndex;
      const generation = state.generation + 1;
      return {
        ...state,
        phase: 'idle',
        settledIndex: index,
        intentIndex: index,
        generation,
        lease: { index, generation },
      };
    }
    case 'scroll-start':
      return {
        ...state,
        phase: 'scrolling',
        direction,
        generation: state.generation + 1,
        lease: null,
      };
    case 'scroll-intent':
      // Intent is meaningful only inside an acknowledged gesture. Mobile
      // scroll snapping can emit a final sub-pixel correction after we have
      // already settled; treating that correction as a new gesture revokes
      // the freshly-issued play lease and leaves the thumbnail over a video
      // that has already started.
      if (state.phase !== 'scrolling') return state;
      return {
        ...state,
        phase: 'scrolling',
        intentIndex: Math.max(0, event.index),
        direction,
        lease: null,
      };
    case 'scroll-settle': {
      const index = Math.max(0, event.index);
      // `scrollend` and the quiet-scroll fallback can both report the same
      // destination (and programmatic initial positioning can do so too).
      // Keep the existing lease so in-flight PLAYING/reveal callbacks remain
      // valid instead of requiring a user tap to recover autoplay.
      if (
        state.phase === 'idle' &&
        state.settledIndex === index &&
        state.intentIndex === index &&
        state.lease?.index === index
      ) return state;
      const generation = state.generation + 1;
      return {
        ...state,
        phase: 'idle',
        settledIndex: index,
        intentIndex: index,
        generation,
        lease: { index, generation },
      };
    }
    case 'overlay-open':
      return { ...state, phase: 'overlay', generation: state.generation + 1, lease: null };
    case 'overlay-close': {
      if (!event.resume) {
        return { ...state, phase: 'idle', generation: state.generation + 1, lease: null };
      }
      const generation = state.generation + 1;
      return { ...state, phase: 'idle', generation, lease: { index: state.settledIndex, generation } };
    }
    case 'hidden':
      return { ...state, phase: 'hidden', generation: state.generation + 1, lease: null };
    case 'route-inactive':
      return { ...state, phase: 'route-inactive', generation: state.generation + 1, lease: null };
    case 'visible': {
      const generation = state.generation + 1;
      return state.phase === 'hidden'
        ? { ...state, phase: 'idle', generation, lease: { index: state.settledIndex, generation } }
        : state;
    }
    default:
      return state;
  }
}

/**
 * Return the five slots kept around a settled card and the current scroll
 * intent.  During a fling the exact intent is slot zero in the scheduler, not
 * an incidental neighbour of the old settled card.
 */
export function shortsPreparationWindow(
  settledIndex: number,
  intentIndex: number,
  length: number,
  mode: ShortsControllerMode = 'pool',
  direction: ShortsControllerDirection = 'forward'
): number[] {
  if (!Number.isInteger(length) || length <= 0) return [];
  if (!Number.isInteger(settledIndex) || settledIndex < 0 || settledIndex >= length) return [];
  if (mode === 'manual') return [settledIndex];
  const anchor = Number.isInteger(intentIndex) ? Math.max(0, Math.min(length - 1, intentIndex)) : settledIndex;
  // Keep the card that was actually settled mounted while intent moves ahead.
  // It is the only player that can be resumed immediately if a fling reverses
  // before the destination settles. The remaining slots form a runway in the
  // direction of travel, with the exact intent target first in scheduler
  // priority (see shortsPreparationPriority below).
  const wanted = mode === 'balanced'
    ? [settledIndex, anchor, anchor + (direction === 'backward' ? -1 : 1)]
    : direction === 'backward'
      ? [settledIndex, anchor, anchor - 1, anchor - 2, anchor - 3]
      : [settledIndex, anchor, anchor + 1, anchor + 2, anchor + 3];
  const unique: number[] = [];
  for (const index of wanted) {
    if (index >= 0 && index < length && !unique.includes(index)) unique.push(index);
  }
  const fallbackStep = direction === 'backward' ? 1 : -1;
  let probe = anchor + fallbackStep;
  while (unique.length < (mode === 'balanced' ? 3 : 5) && probe >= 0 && probe < length) {
    if (!unique.includes(probe)) unique.push(probe);
    probe += fallbackStep;
  }
  return unique.slice(0, mode === 'balanced' ? 3 : 5).sort((a, b) => a - b);
}

/** Lower number wins. The actual intent target is always first. */
export function shortsPreparationPriority(
  index: number,
  settledIndex: number,
  intentIndex: number,
  direction: ShortsControllerDirection
): number {
  if (index === intentIndex) return 0;
  const step = direction === 'backward' ? -1 : 1;
  if (index === intentIndex + step) return 1;
  if (index === settledIndex) return 2;
  if (index === intentIndex + step * 2) return 3;
  if (index === intentIndex + step * 3) return 4;
  return 10 + Math.abs(index - intentIndex);
}

export function leaseMatches(
  state: ShortsControllerState,
  index: number,
  generation: number | null | undefined
): boolean {
  return Boolean(
    generation != null &&
    state.phase === 'idle' &&
    state.lease &&
    state.lease.index === index &&
    state.lease.generation === generation
  );
}

/** Find the card whose top edge is nearest the feed's top edge. */
export function nearestShortIndex(cardTops: readonly number[], feedTop: number): number {
  if (!cardTops.length) return -1;
  let best = 0;
  let distance = Math.abs(cardTops[0] - feedTop);
  for (let index = 1; index < cardTops.length; index += 1) {
    const next = Math.abs(cardTops[index] - feedTop);
    if (next < distance) {
      best = index;
      distance = next;
    }
  }
  return best;
}

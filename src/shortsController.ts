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

/** Fixed-height shells can be prepared five cards either side of the active
 * card without creating any players. This keeps native snap geometry stable
 * while the iframe pool remains much smaller. */
export function shortsContentWindow(activeIndex: number, length: number, radius = 5): number[] {
  if (!Number.isInteger(length) || length <= 0) return [];
  if (!Number.isInteger(activeIndex) || activeIndex < 0 || activeIndex >= length) return [];
  const span = Math.max(0, Math.floor(radius));
  const start = Math.max(0, activeIndex - span);
  const end = Math.min(length - 1, activeIndex + span);
  return Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
}

/** Live iframe slots are intentionally capped at five (active ±2). */
export function shortsPlayerWindow(activeIndex: number, length: number, maxPlayers = 5): number[] {
  if (!Number.isInteger(length) || length <= 0) return [];
  if (!Number.isInteger(activeIndex) || activeIndex < 0 || activeIndex >= length) return [];
  const cap = Math.max(1, Math.floor(maxPlayers));
  const radius = Math.floor((cap - 1) / 2);
  const candidates = shortsContentWindow(activeIndex, length, radius);
  if (candidates.length <= cap) return candidates;
  const start = Math.max(0, Math.min(activeIndex - radius, length - cap));
  return Array.from({ length: cap }, (_, offset) => start + offset);
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

/*
 * Canonical feed reducer contract.
 *
 * The original controller exports the lower-case event vocabulary used by the
 * current Shorts host. These aliases intentionally expose the product
 * specification's public, upper-case vocabulary as a small pure reducer too.
 * Keeping this boundary independent means future hosts cannot accidentally
 * reintroduce a second playback owner while the existing adapter migrates.
 */
export type ShortsFeedPhase = 'inactive' | 'settled' | 'scrolling' | 'overlay' | 'hidden';
export type ScrollDirection = 'forward' | 'backward';

export interface ShortsFeedState {
  phase: ShortsFeedPhase;
  activeIndex: number;
  intentIndex: number;
  direction: ScrollDirection;
  generation: number;
  lease: PlayerLease | null;
}

export type ShortsFeedEvent =
  | { type: 'ROUTE_ENTER'; index: number }
  | { type: 'SCROLL_START'; direction: ScrollDirection }
  | { type: 'SCROLL_INTENT'; index: number; direction: ScrollDirection }
  | { type: 'SCROLL_SETTLE'; index: number }
  | { type: 'OVERLAY_OPEN' }
  | { type: 'OVERLAY_CLOSE'; resume: boolean }
  | { type: 'VISIBILITY_HIDDEN' }
  | { type: 'VISIBILITY_VISIBLE'; resume: boolean }
  | { type: 'ROUTE_LEAVE' };

export function createShortsFeedState(index = 0): ShortsFeedState {
  const safe = Number.isInteger(index) && index >= 0 ? index : 0;
  return {
    phase: 'inactive',
    activeIndex: safe,
    intentIndex: safe,
    direction: 'forward',
    generation: 0,
    lease: null,
  };
}

/** Pure reducer used by the feed host: only settle/visibility/route entry can mint a lease. */
export function shortsFeedReducer(state: ShortsFeedState, event: ShortsFeedEvent): ShortsFeedState {
  switch (event.type) {
    case 'ROUTE_ENTER': {
      const index = Number.isInteger(event.index) && event.index >= 0 ? event.index : state.activeIndex;
      const generation = state.generation + 1;
      return { ...state, phase: 'settled', activeIndex: index, intentIndex: index, generation, lease: { index, generation } };
    }
    case 'SCROLL_START':
      return { ...state, phase: 'scrolling', direction: event.direction, generation: state.generation + 1, lease: null };
    case 'SCROLL_INTENT':
      // A late IntersectionObserver/scroll correction cannot revoke a settled
      // lease. Intent is advisory until the one settle event commits it.
      if (state.phase !== 'scrolling') return state;
      return { ...state, phase: 'scrolling', intentIndex: Math.max(0, event.index), direction: event.direction, lease: null };
    case 'SCROLL_SETTLE': {
      const index = Math.max(0, event.index);
      if (
        state.phase === 'settled' &&
        state.activeIndex === index &&
        state.intentIndex === index &&
        state.lease?.index === index
      ) return state;
      const generation = state.generation + 1;
      return { ...state, phase: 'settled', activeIndex: index, intentIndex: index, generation, lease: { index, generation } };
    }
    case 'OVERLAY_OPEN':
      return { ...state, phase: 'overlay', generation: state.generation + 1, lease: null };
    case 'OVERLAY_CLOSE': {
      const generation = state.generation + 1;
      return {
        ...state,
        phase: 'settled',
        generation,
        lease: event.resume ? { index: state.activeIndex, generation } : null,
      };
    }
    case 'VISIBILITY_HIDDEN':
      return { ...state, phase: 'hidden', generation: state.generation + 1, lease: null };
    case 'VISIBILITY_VISIBLE': {
      if (state.phase !== 'hidden') return state;
      const generation = state.generation + 1;
      return {
        ...state,
        phase: 'settled',
        generation,
        lease: event.resume ? { index: state.activeIndex, generation } : null,
      };
    }
    case 'ROUTE_LEAVE':
      return { ...state, phase: 'inactive', generation: state.generation + 1, lease: null };
    default:
      return state;
  }
}

export function shortsFeedLeaseMatches(
  state: ShortsFeedState,
  index: number,
  generation: number | null | undefined
): boolean {
  return Boolean(
    generation != null &&
    state.phase === 'settled' &&
    state.lease?.index === index &&
    state.lease?.generation === generation &&
    state.activeIndex === index
  );
}

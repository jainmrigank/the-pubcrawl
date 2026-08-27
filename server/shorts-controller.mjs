/** Pure Shorts controller policies used by unit tests and the browser model. */

export function createShortsControllerState(index = 0) {
  const safe = Number.isInteger(index) && index >= 0 ? index : 0;
  return { phase: 'route-inactive', settledIndex: safe, intentIndex: safe, direction: 'forward', generation: 0, lease: null };
}

export function transitionShortsController(state, event) {
  const direction = (event.type === 'scroll-start' || event.type === 'scroll-intent') && event.direction
    ? event.direction
    : state.direction;
  switch (event.type) {
    case 'route-enter': {
      const index = Number.isInteger(event.index) && event.index >= 0 ? event.index : state.settledIndex;
      const generation = state.generation + 1;
      return { ...state, phase: 'idle', settledIndex: index, intentIndex: index, generation, lease: { index, generation } };
    }
    case 'scroll-start': return { ...state, phase: 'scrolling', direction, generation: state.generation + 1, lease: null };
    case 'scroll-intent': return { ...state, phase: 'scrolling', intentIndex: Math.max(0, event.index), direction, lease: null };
    case 'scroll-settle': {
      const index = Math.max(0, event.index);
      const generation = state.generation + 1;
      return { ...state, phase: 'idle', settledIndex: index, intentIndex: index, generation, lease: { index, generation } };
    }
    case 'overlay-open': return { ...state, phase: 'overlay', generation: state.generation + 1, lease: null };
    case 'overlay-close': {
      if (!event.resume) return { ...state, phase: 'idle', generation: state.generation + 1, lease: null };
      const generation = state.generation + 1;
      return { ...state, phase: 'idle', generation, lease: { index: state.settledIndex, generation } };
    }
    case 'hidden': return { ...state, phase: 'hidden', generation: state.generation + 1, lease: null };
    case 'route-inactive': return { ...state, phase: 'route-inactive', generation: state.generation + 1, lease: null };
    case 'visible': {
      if (state.phase !== 'hidden') return state;
      const generation = state.generation + 1;
      return { ...state, phase: 'idle', generation, lease: { index: state.settledIndex, generation } };
    }
    default: return state;
  }
}

export function shortsPreparationWindow(settledIndex, intentIndex, length, mode = 'pool', direction = 'forward') {
  if (!Number.isInteger(length) || length <= 0 || !Number.isInteger(settledIndex) || settledIndex < 0 || settledIndex >= length) return [];
  if (mode === 'manual') return [settledIndex];
  const anchor = Number.isInteger(intentIndex) ? Math.max(0, Math.min(length - 1, intentIndex)) : settledIndex;
  const wanted = mode === 'balanced'
    ? [settledIndex, anchor, anchor + (direction === 'backward' ? -1 : 1)]
    : direction === 'backward'
      ? [settledIndex, anchor, anchor - 1, anchor - 2, anchor - 3]
      : [settledIndex, anchor, anchor + 1, anchor + 2, anchor + 3];
  const unique = [];
  for (const index of wanted) if (index >= 0 && index < length && !unique.includes(index)) unique.push(index);
  const fallbackStep = direction === 'backward' ? 1 : -1;
  let probe = anchor + fallbackStep;
  while (unique.length < (mode === 'balanced' ? 3 : 5) && probe >= 0 && probe < length) {
    if (!unique.includes(probe)) unique.push(probe);
    probe += fallbackStep;
  }
  return unique.slice(0, mode === 'balanced' ? 3 : 5).sort((a, b) => a - b);
}

export function shortsPreparationPriority(index, settledIndex, intentIndex, direction = 'forward') {
  if (index === intentIndex) return 0;
  const step = direction === 'backward' ? -1 : 1;
  if (index === intentIndex + step) return 1;
  if (index === settledIndex) return 2;
  if (index === intentIndex + step * 2) return 3;
  if (index === intentIndex + step * 3) return 4;
  return 10 + Math.abs(index - intentIndex);
}

export function leaseMatches(state, index, generation) {
  return generation != null && state.phase === 'idle' && state.lease?.index === index && state.lease?.generation === generation;
}

export function nearestShortIndex(cardTops, feedTop) {
  if (!Array.isArray(cardTops) || !cardTops.length) return -1;
  let best = 0;
  let distance = Math.abs(cardTops[0] - feedTop);
  for (let index = 1; index < cardTops.length; index += 1) {
    const next = Math.abs(cardTops[index] - feedTop);
    if (next < distance) { best = index; distance = next; }
  }
  return best;
}

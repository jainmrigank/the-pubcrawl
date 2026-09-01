import type { TourDefinition, TourId, TourOutcome, TourStep } from './types';

export const BAR_TOUR_STORAGE_KEY = 'pubcrawl.tour.bar.v1';
export const SHORTS_TOUR_STORAGE_KEY = 'pubcrawl.tour.shorts.v1';

export const TOURS: Record<TourId, TourDefinition> = {
  bar: {
    id: 'bar',
    storageKey: BAR_TOUR_STORAGE_KEY,
    steps: [
      { id: 'entry', target: '[data-tour="shelf-entry"]', label: 'ADD WHAT YOU HAVE', body: 'Type an ingredient, or use the camera to add what is already on your shelf.', preferredSide: 'bottom' },
      { id: 'results', target: '[data-tour="shelf-results"]', label: 'YOUR COCKTAILS APPEAR HERE', body: 'The best matches come first. Tap any card to see what you have and what is missing.', preferredSide: 'top' },
      { id: 'invent', target: '[data-tour="invent-drink"]', label: 'WANT SOMETHING ORIGINAL?', body: 'Invent a new drink using the ingredients on your shelf.', preferredSide: 'top' },
    ],
  },
  shorts: {
    id: 'shorts',
    storageKey: SHORTS_TOUR_STORAGE_KEY,
    steps: [
      { id: 'feed', target: '[data-tour="shorts-feed"]', label: 'SWIPE UP FOR THE NEXT POUR', body: 'Each Short plays when it settles in the frame.', preferredSide: 'bottom' },
      { id: 'actions', target: '[data-tour="shorts-actions"]', label: 'SHARE IT OR OPEN THE RECIPE', body: 'Use these actions without leaving your place in the feed.', preferredSide: 'left' },
    ],
  },
};

export function readTourOutcome(id: TourId): TourOutcome | null {
  try {
    const value = localStorage.getItem(TOURS[id].storageKey);
    return value === 'completed' || value === 'skipped' ? value : null;
  } catch {
    return null;
  }
}

export function saveTourOutcome(id: TourId, outcome: TourOutcome) {
  try { localStorage.setItem(TOURS[id].storageKey, outcome); } catch {}
}

export function clearTourOutcome(id: TourId) {
  try { localStorage.removeItem(TOURS[id].storageKey); } catch {}
}

export function tourStep(id: TourId, index: number): TourStep | null {
  return TOURS[id].steps[index] || null;
}

export function requestTourReplay(id: TourId) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('pubcrawl:replay-tour', { detail: id }));
}


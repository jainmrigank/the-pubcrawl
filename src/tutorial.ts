import type { TourDefinition, TourId, TourOutcome, TourStep } from './types';

export const TOUR_STORAGE_KEYS: Record<TourId, string> = {
  landing: 'pubcrawl.tour.landing.v1',
  menu: 'pubcrawl.tour.menu.v1',
  'taste-map': 'pubcrawl.tour.taste-map.v1',
  bar: 'pubcrawl.tour.bar.v1',
  basics: 'pubcrawl.tour.basics.v1',
  tab: 'pubcrawl.tour.tab.v1',
  quiz: 'pubcrawl.tour.quiz.v1',
  watch: 'pubcrawl.tour.watch.v1',
  shorts: 'pubcrawl.tour.shorts.v1',
};

export const BAR_TOUR_STORAGE_KEY = TOUR_STORAGE_KEYS.bar;
export const SHORTS_TOUR_STORAGE_KEY = TOUR_STORAGE_KEYS.shorts;

export const TOURS: Record<TourId, TourDefinition> = {
  landing: {
    id: 'landing',
    storageKey: TOUR_STORAGE_KEYS.landing,
    steps: [
      { id: 'make', target: '[data-tour="landing-make"]', label: 'Start with your shelf', body: 'Add ingredients to Shelf. Browse the library or explore Taste Map.', preferredSide: 'bottom' },
      { id: 'browse', target: '[data-tour="landing-browse"]', label: 'Browse the full Menu', body: 'Search the full recipe library.', preferredSide: 'bottom' },
      { id: 'discovery', target: '[data-tour="landing-discovery"]', label: 'Know your pour', body: 'Open a study for ingredients, calories or recipe ratios. Find quiz and lessons in Explore.', preferredSide: 'top' },
    ],
  },
  menu: {
    id: 'menu',
    storageKey: TOUR_STORAGE_KEYS.menu,
    steps: [
      { id: 'controls', target: '[data-tour="menu-controls"]', label: 'Find your drink', body: 'Search by name or ingredient. More filters narrows results.', preferredSide: 'bottom' },
      { id: 'cards', target: '[data-tour="menu-grid"]', label: 'Flip a cocktail card', body: 'Tap a card for the recipe.', preferredSide: 'top', optional: true },
      { id: 'actions', target: '[data-tour="menu-card-actions"]', label: 'Build your night', body: 'Save, share or like a drink. Watch its video when available.', preferredSide: 'left', optional: true },
    ],
  },
  'taste-map': {
    id: 'taste-map',
    storageKey: TOUR_STORAGE_KEYS['taste-map'],
    steps: [
      { id: 'map', target: '[data-tour="taste-map"]', label: 'Choose a glass', body: 'Choose a glass to preview its recipe or compare drinks.', preferredSide: 'top' },
      { id: 'flavours', target: '[data-tour="taste-flavours"]', label: 'Start with a flavour', body: 'Choose a flavour above the map, then narrow it down.', preferredSide: 'top' },
    ],
  },
  bar: {
    id: 'bar',
    storageKey: TOUR_STORAGE_KEYS.bar,
    steps: [
      { id: 'entry', target: '[data-tour="shelf-entry"]', label: 'Add what you have', body: 'Type ingredients or add a photo.', preferredSide: 'bottom' },
      { id: 'results', target: '[data-tour="shelf-results"]', label: 'Your cocktails appear here', body: 'Best matches first. Tap a card for ingredients.', preferredSide: 'top', optional: true },
      { id: 'invent', target: '[data-tour="invent-drink"]', label: 'Want something original?', body: 'Create a drink from your ingredients.', preferredSide: 'top', optional: true },
    ],
  },
  basics: {
    id: 'basics',
    storageKey: TOUR_STORAGE_KEYS.basics,
    steps: [
      { id: 'search', target: '[data-tour="basics-search"]', label: 'Search the manual', body: 'Find a spirit, tool or technique.', preferredSide: 'bottom' },
      { id: 'groups', target: '[data-tour="basics-groups"]', label: 'Open a subject', body: 'Browse by subject.', preferredSide: 'top' },
      { id: 'terms', target: '[data-tour="basics-terms"]', label: 'Expand a term', body: 'Open a term for its meaning.', preferredSide: 'top' },
    ],
  },
  tab: {
    id: 'tab',
    storageKey: TOUR_STORAGE_KEYS.tab,
    steps: [
      { id: 'lineup', target: '[data-tour="tab-lineup"]', label: 'Your saved lineup', body: 'Saved drinks stay on this device.', preferredSide: 'top' },
      { id: 'cards', target: '[data-tour="tab-cards"]', label: 'Your recipes stay live', body: 'Tap a card for its recipe.', preferredSide: 'top', optional: true },
      { id: 'actions', target: '[data-tour="tab-actions"]', label: 'Share or clear the Tab', body: 'Share your Tab or clear it.', preferredSide: 'bottom', optional: true },
    ],
  },
  quiz: {
    id: 'quiz',
    storageKey: TOUR_STORAGE_KEYS.quiz,
    steps: [
      { id: 'start', target: '[data-tour="quiz-start"]', label: 'Start the round', body: 'Correct answers earn one point. The record is shared.', preferredSide: 'top' },
      { id: 'round', target: '[data-tour="quiz-round"]', label: 'One miss ends the run', body: 'Questions get harder. One miss ends the round.', preferredSide: 'top' },
      { id: 'score', target: '[data-tour="quiz-score"]', label: 'Chase the House Record', body: 'Your score and the record stay visible.', preferredSide: 'bottom' },
    ],
  },
  watch: {
    id: 'watch',
    storageKey: TOUR_STORAGE_KEYS.watch,
    steps: [
      { id: 'controls', target: '[data-tour="watch-controls"]', label: 'Find something to watch', body: 'Search videos, then filter by kind.', preferredSide: 'bottom' },
      { id: 'ranking', target: '[data-tour="watch-tabs"]', label: 'Choose a shelf', body: 'Browse popular, new or surprise picks.', preferredSide: 'bottom' },
      { id: 'videos', target: '[data-tour="watch-grid"]', label: 'Play in place', body: 'Tap a thumbnail to play. Show more loads more videos.', preferredSide: 'top' },
    ],
  },
  shorts: {
    id: 'shorts',
    storageKey: TOUR_STORAGE_KEYS.shorts,
    steps: [
      { id: 'feed', target: '[data-tour="shorts-feed"]', label: 'Scroll to the next Short', body: 'Swipe up or scroll down for the next video. Reverse to return.', preferredSide: 'bottom' },
      { id: 'actions', target: '[data-tour="shorts-actions"]', label: 'Use the video controls', body: 'Use YouTube’s controls for sound and playback. Back and Share are above.', preferredSide: 'bottom' },
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

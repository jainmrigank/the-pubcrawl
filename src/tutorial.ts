import type { TourDefinition, TourId, TourOutcome, TourStep } from './types';

export const TOUR_STORAGE_KEYS: Record<TourId, string> = {
  landing: 'pubcrawl.tour.landing.v1',
  menu: 'pubcrawl.tour.menu.v1',
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
      { id: 'make', target: '[data-tour="landing-make"]', label: 'Start with what you have', body: 'Add ingredients from your kitchen and see the cocktails you can make right now.', preferredSide: 'bottom' },
      { id: 'browse', target: '[data-tour="landing-browse"]', label: 'Browse the full Menu', body: 'Explore every reviewed drink when you already know what you want.', preferredSide: 'bottom' },
      { id: 'discovery', target: '[data-tour="landing-discovery"]', label: 'Discover the rest', body: 'Preview Shorts and Watch, or open Quiz, Bar Basics, and your saved Tab.', preferredSide: 'top' },
    ],
  },
  menu: {
    id: 'menu',
    storageKey: TOUR_STORAGE_KEYS.menu,
    steps: [
      { id: 'controls', target: '[data-tour="menu-controls"]', label: 'Find your drink', body: 'Search by name or ingredient, then narrow the Menu by category or collection.', preferredSide: 'bottom' },
      { id: 'cards', target: '[data-tour="menu-grid"]', label: 'Flip a cocktail card', body: 'Tap a card for ingredients and the full method.', preferredSide: 'top' },
      { id: 'actions', target: '[data-tour="menu-card-actions"]', label: 'Build your night', body: 'Put a drink on your Tab, share it, like it, or open its exact video when one is available.', preferredSide: 'left' },
    ],
  },
  bar: {
    id: 'bar',
    storageKey: TOUR_STORAGE_KEYS.bar,
    steps: [
      { id: 'entry', target: '[data-tour="shelf-entry"]', label: 'Add what you have', body: 'Type an ingredient, or use the camera to add what is already on your shelf.', preferredSide: 'bottom' },
      { id: 'results', target: '[data-tour="shelf-results"]', label: 'Your cocktails appear here', body: 'The best matches come first. Tap any card to see what you have and what is missing.', preferredSide: 'top', optional: true },
      { id: 'invent', target: '[data-tour="invent-drink"]', label: 'Want something original?', body: 'Invent a new drink using the ingredients on your shelf.', preferredSide: 'top', optional: true },
    ],
  },
  basics: {
    id: 'basics',
    storageKey: TOUR_STORAGE_KEYS.basics,
    steps: [
      { id: 'search', target: '[data-tour="basics-search"]', label: 'Search the manual', body: 'Look up a spirit, measure, tool, or technique in plain language.', preferredSide: 'bottom' },
      { id: 'groups', target: '[data-tour="basics-groups"]', label: 'Open a subject', body: 'Each subject keeps related bar knowledge together.', preferredSide: 'top' },
      { id: 'terms', target: '[data-tour="basics-terms"]', label: 'Expand a term', body: 'Open any entry for its practical definition.', preferredSide: 'top' },
    ],
  },
  tab: {
    id: 'tab',
    storageKey: TOUR_STORAGE_KEYS.tab,
    steps: [
      { id: 'lineup', target: '[data-tour="tab-lineup"]', label: 'Your saved lineup', body: 'Drinks you add stay on this device, ready for the night.', preferredSide: 'top' },
      { id: 'cards', target: '[data-tour="tab-cards"]', label: 'Your recipes stay live', body: 'Flip saved cards for ingredients and methods without rebuilding the list.', preferredSide: 'top', optional: true },
      { id: 'actions', target: '[data-tour="tab-actions"]', label: 'Share or clear the Tab', body: 'Send the whole lineup to friends, or clear it when the night is over.', preferredSide: 'bottom', optional: true },
    ],
  },
  quiz: {
    id: 'quiz',
    storageKey: TOUR_STORAGE_KEYS.quiz,
    steps: [
      { id: 'start', target: '[data-tour="quiz-start"]', label: 'Start the round', body: 'The House Record loads from the shared scoreboard; one correct answer earns one point.', preferredSide: 'top' },
      { id: 'round', target: '[data-tour="quiz-round"]', label: 'One miss ends the run', body: 'Questions get harder as your score rises. Choose carefully: the round is sudden death.', preferredSide: 'top' },
      { id: 'score', target: '[data-tour="quiz-score"]', label: 'Chase the House Record', body: 'Your score and the verified House Record stay visible throughout the round.', preferredSide: 'bottom' },
    ],
  },
  watch: {
    id: 'watch',
    storageKey: TOUR_STORAGE_KEYS.watch,
    steps: [
      { id: 'controls', target: '[data-tour="watch-controls"]', label: 'Find something to watch', body: 'Search a title or channel, then narrow the shelf by kind.', preferredSide: 'bottom' },
      { id: 'ranking', target: '[data-tour="watch-tabs"]', label: 'Choose a shelf', body: 'Switch between most watched, new and rising, or three surprise picks.', preferredSide: 'bottom' },
      { id: 'videos', target: '[data-tour="watch-grid"]', label: 'Play in place', body: 'Tap a still to open YouTube inside its card; Show More stays centered below the shelf.', preferredSide: 'top' },
    ],
  },
  shorts: {
    id: 'shorts',
    storageKey: TOUR_STORAGE_KEYS.shorts,
    steps: [
      { id: 'feed', target: '[data-tour="shorts-feed"]', label: 'Scroll to the next Short', body: 'Swipe up or scroll down for the next video. Reverse direction to go back.', preferredSide: 'bottom' },
      { id: 'actions', target: '[data-tour="shorts-actions"]', label: 'Use the video controls', body: 'Use YouTube’s controls for sound and playback. Back and Share stay above the video.', preferredSide: 'bottom' },
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

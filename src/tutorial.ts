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
      { id: 'make', target: '[data-tour="landing-make"]', label: 'START WITH WHAT YOU HAVE', body: 'Add ingredients from your kitchen and see the cocktails you can make right now.', preferredSide: 'bottom' },
      { id: 'browse', target: '[data-tour="landing-browse"]', label: 'BROWSE THE FULL MENU', body: 'Explore every reviewed drink when you already know what you want.', preferredSide: 'bottom' },
      { id: 'steps', target: '[data-tour="landing-steps"]', label: 'THREE STEPS TO A POUR', body: 'Add ingredients, see your matches, then save a lineup or invent something original.', preferredSide: 'top' },
    ],
  },
  menu: {
    id: 'menu',
    storageKey: TOUR_STORAGE_KEYS.menu,
    steps: [
      { id: 'controls', target: '[data-tour="menu-controls"]', label: 'FIND YOUR DRINK', body: 'Search by name or ingredient, then narrow the menu by category or collection.', preferredSide: 'bottom' },
      { id: 'cards', target: '[data-tour="menu-grid"]', label: 'FLIP A COCKTAIL CARD', body: 'Tap a card for ingredients and the full method.', preferredSide: 'top' },
      { id: 'actions', target: '[data-tour="menu-card-actions"]', label: 'BUILD YOUR NIGHT', body: 'Put a drink on your Tab, share it, like it, or open its exact video when one is available.', preferredSide: 'left' },
    ],
  },
  bar: {
    id: 'bar',
    storageKey: TOUR_STORAGE_KEYS.bar,
    steps: [
      { id: 'entry', target: '[data-tour="shelf-entry"]', label: 'ADD WHAT YOU HAVE', body: 'Type an ingredient, or use the camera to add what is already on your shelf.', preferredSide: 'bottom' },
      { id: 'results', target: '[data-tour="shelf-results"]', label: 'YOUR COCKTAILS APPEAR HERE', body: 'The best matches come first. Tap any card to see what you have and what is missing.', preferredSide: 'top' },
      { id: 'invent', target: '[data-tour="invent-drink"]', label: 'WANT SOMETHING ORIGINAL?', body: 'Invent a new drink using the ingredients on your shelf.', preferredSide: 'top' },
    ],
  },
  basics: {
    id: 'basics',
    storageKey: TOUR_STORAGE_KEYS.basics,
    steps: [
      { id: 'search', target: '[data-tour="basics-search"]', label: 'SEARCH THE MANUAL', body: 'Look up a spirit, measure, tool, or technique in plain language.', preferredSide: 'bottom' },
      { id: 'groups', target: '[data-tour="basics-groups"]', label: 'OPEN A SUBJECT', body: 'Each subject keeps related bar knowledge together.', preferredSide: 'top' },
      { id: 'terms', target: '[data-tour="basics-terms"]', label: 'EXPAND A TERM', body: 'Open any entry for its practical definition.', preferredSide: 'top' },
    ],
  },
  tab: {
    id: 'tab',
    storageKey: TOUR_STORAGE_KEYS.tab,
    steps: [
      { id: 'lineup', target: '[data-tour="tab-lineup"]', label: 'YOUR SAVED LINEUP', body: 'Drinks you add stay on this device, ready for the night.', preferredSide: 'top' },
      { id: 'cards', target: '[data-tour="tab-cards"]', label: 'YOUR RECIPES STAY LIVE', body: 'Flip saved cards for ingredients and methods without rebuilding the list.', preferredSide: 'top', optional: true },
      { id: 'actions', target: '[data-tour="tab-actions"]', label: 'SHARE OR CLEAR THE TAB', body: 'Send the whole lineup to friends, or clear it when the night is over.', preferredSide: 'bottom', optional: true },
    ],
  },
  quiz: {
    id: 'quiz',
    storageKey: TOUR_STORAGE_KEYS.quiz,
    steps: [
      { id: 'start', target: '[data-tour="quiz-start"]', label: 'START THE ROUND', body: 'The House Record loads from the shared scoreboard; one correct answer earns one point.', preferredSide: 'top' },
      { id: 'round', target: '[data-tour="quiz-round"]', label: 'ONE MISS ENDS THE RUN', body: 'Questions get harder as your score rises. Choose carefully: the round is sudden death.', preferredSide: 'top' },
      { id: 'score', target: '[data-tour="quiz-score"]', label: 'CHASE THE HOUSE RECORD', body: 'Your score and the verified House Record stay visible throughout the round.', preferredSide: 'bottom' },
    ],
  },
  watch: {
    id: 'watch',
    storageKey: TOUR_STORAGE_KEYS.watch,
    steps: [
      { id: 'controls', target: '[data-tour="watch-controls"]', label: 'FIND SOMETHING TO WATCH', body: 'Search a title or channel, then narrow the shelf by kind.', preferredSide: 'bottom' },
      { id: 'ranking', target: '[data-tour="watch-tabs"]', label: 'CHOOSE A SHELF', body: 'Switch between most watched, new and rising, or three surprise picks.', preferredSide: 'bottom' },
      { id: 'videos', target: '[data-tour="watch-grid"]', label: 'PLAY IN PLACE', body: 'Tap a still to open YouTube inside its card; Show More stays centered below the shelf.', preferredSide: 'top' },
    ],
  },
  shorts: {
    id: 'shorts',
    storageKey: TOUR_STORAGE_KEYS.shorts,
    steps: [
      { id: 'feed', target: '[data-tour="shorts-feed"]', label: 'MOVE BETWEEN SHORTS', body: 'Swipe in the side areas, or use Previous and Next, to move through the pour.', preferredSide: 'bottom' },
      { id: 'actions', target: '[data-tour="shorts-actions"]', label: 'USE THE VIDEO CONTROLS', body: 'Sound and playback settings use YouTube’s own player control. Share stays beside the player.', preferredSide: 'left' },
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

import { advanceContentReturn } from './contentHistory.ts';

export const RECIPE_FOCUS_HISTORY_KEY = '__pubcrawlRecipeFocus';

export interface RecipeFocusHistoryMarker {
  token: string;
  recipeId: string;
  sourceHash: string;
}

function historyObject(state: unknown): Record<string, unknown> {
  return state && typeof state === 'object' ? state as Record<string, unknown> : {};
}

export function readRecipeFocusMarker(state: unknown = window.history.state): RecipeFocusHistoryMarker | null {
  const value = historyObject(state)[RECIPE_FOCUS_HISTORY_KEY];
  if (!value || typeof value !== 'object') return null;
  const marker = value as Partial<RecipeFocusHistoryMarker>;
  return typeof marker.token === 'string'
    && typeof marker.recipeId === 'string'
    && typeof marker.sourceHash === 'string'
    ? marker as RecipeFocusHistoryMarker
    : null;
}

export function pushRecipeFocusMarker(marker: RecipeFocusHistoryMarker) {
  const state = historyObject(window.history.state);
  window.history.pushState({ ...advanceContentReturn(state), [RECIPE_FOCUS_HISTORY_KEY]: marker }, '', window.location.href);
}

export function clearRecipeFocusMarker() {
  const state = { ...historyObject(window.history.state) };
  if (!(RECIPE_FOCUS_HISTORY_KEY in state)) return;
  delete state[RECIPE_FOCUS_HISTORY_KEY];
  window.history.replaceState(state, '', window.location.href);
}

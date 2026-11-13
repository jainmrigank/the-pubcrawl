import type { Recipe, Vibe } from './types';

export interface RecipeFocusOrigin {
  recipe: Recipe;
  vibe: Vibe;
  instanceId: string;
  element: HTMLElement;
  trigger: HTMLButtonElement;
  flipped: boolean;
  cardScrollTop: number;
  returnLabel?: string;
}

export type RecipeFocusPhase = 'opening' | 'open' | 'closing';

export interface RecipeFocusSession extends RecipeFocusOrigin {
  token: string;
  sourceHash: string;
  pageScrollY: number;
  sourceBounds: DOMRect;
}

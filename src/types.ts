export interface Vibe {
  id: string;
  label: string;
  color: string;
}

export interface Ingredient {
  name: string;
  category: string;
  image: string;
  detectedAs?: string;
}

export interface RecipeIngredient {
  name: string;
  measure: string;
  have?: boolean;
  staple?: boolean;
}

export interface Recipe {
  id: string;
  name: string;
  tagline?: string;
  category: string;
  alcoholic: string;
  glass: string;
  instructions: string;
  thumb: string;
  video: string;
  tags: string[];
  iba: string;
  ingredients: RecipeIngredient[];
  vibe: string;
  matched?: number;
  missing?: string[];
  total?: number;
  source?: 'ai' | 'fallback';
}

export interface MatchResult {
  canMake: Recipe[];
  almost: Recipe[];
}

export interface Health {
  ok: boolean;
  cocktails: number;
  ingredients: number;
  llm: string | null;
}

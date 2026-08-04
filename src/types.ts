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
  /** listed by convention but not required, e.g. the egg white in a sour */
  optional?: boolean;
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

export interface Question {
  id: string;
  q: string;
  o: string[];
  a: number;
  d: number;
  r: string;
  in?: boolean;
  fun?: boolean;
  day?: number;
}

export interface Health {
  ok: boolean;
  cocktails: number;
  ingredients: number;
  llm: string | null;
}

/** someone who answered every question in the bank without a miss */
export interface HallMember {
  name: string;
  score: number;
  at: number;
}

/** one entry in the Watch library */
export interface WatchVideo {
  id: string;
  title: string;
  channel: string;
  lane: string;
  rank: number;
  addedAt: string;
  views: number | null;
  likes: number | null;
  movement: number;
  /** only set on the Climbing shelf: why it earned its place */
  why?: string;
}

export interface WatchLane {
  id: string;
  label: string;
  color: string;
}

export interface WatchLibrary {
  videos: WatchVideo[];
  lanes: WatchLane[];
  hasNumbers: boolean;
  updatedAt: number | null;
}

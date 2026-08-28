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
  /** A real house recipe created by the owner, rather than an AI invention. */
  houseOriginal?: boolean;
  /** Explicit browse admission for researched recipes without stock photography. */
  browseable?: boolean;
  /** Evidence source ids from data/indian_cocktail_sources.json. */
  evidence?: string[];
  videoTitle?: string;
  videoKind?: 'exact' | 'technique' | 'search';
  videoSearch?: string;
  india?: {
    lane: 'everyday' | 'modern-bar' | 'regional' | 'zero-proof';
    pantryTier: 1 | 2 | 3;
    researchDate: string;
  };
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
  catalogueCocktails?: number;
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
  landingFeatured?: boolean;
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

/** one reviewed vertical YouTube Short in the PubCrawl feed */
export interface ShortVideo {
  id: string;
  title: string;
  channel: string;
  channelId: string;
  lane: string;
  rank: number;
  addedAt: string;
  publishedAt: string;
  durationSeconds: number;
  thumbnail: string;
  recipeQuery?: string;
  evergreen?: boolean;
  /** populated by the API when the Monday stats refresh has run */
  views?: number | null;
  likes?: number | null;
  movement?: number;
}

/** the reviewed Shorts catalogue plus the same four lanes used by Watch */
export interface ShortLibrary {
  shorts: ShortVideo[];
  lanes: WatchLane[];
  hasNumbers: boolean;
  updatedAt: number | null;
}

/** In-memory snapshot used when MAKE THIS temporarily leaves the Shorts feed. */
export interface ShortsReturnState {
  /** versioned so a stale tab-scoped snapshot can be rejected safely */
  version?: 2;
  videoId: string;
  title?: string;
  order: string[];
  currentTime: number;
  wasPlaying: boolean;
  /** semantic intent survives a transient CUED/BUFFERING state */
  resumeIntent?: 'autoplay' | 'paused';
  recipeQuery?: string;
  muted: boolean;
  volume: number;
}

import type {
  CollectionId,
  BrowseFilter,
  HallMember,
  Health,
  Ingredient,
  MatchResult,
  Question,
  Recipe,
  RecipePage,
  ShortLibrary,
  Vibe,
  VibeId,
  WatchLibrary,
} from './types';

/**
 * Where the API lives. Empty (default) means same origin — the dev server
 * mounts the API inside Vite. For the hosted frontend (Vercel) set
 * VITE_API_BASE at build time to the tunnel/server URL, or override at
 * runtime without a redeploy: localStorage.setItem('pubcrawl.api', 'https://…')
 */
const API_BASE = (
  (typeof localStorage !== 'undefined' && localStorage.getItem('pubcrawl.api')) ||
  import.meta.env.VITE_API_BASE ||
  ''
).replace(/\/$/, '');

// ngrok's free tier interposes a browser warning page unless this header is present
const HEADERS: Record<string, string> = API_BASE.includes('ngrok')
  ? { 'ngrok-skip-browser-warning': '1' }
  : {};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reads use a short timeout and one bounded retry. The Worker is the normal
 * host; the retry is only for a transient network/5xx response and must not
 * recreate the old four-attempt Render wake-up delay.
 */
/**
 * Every request carries a timeout: a hung call would otherwise occupy one of
 * the browser's six connections per origin, and a few of those (a slow AI
 * request during an outage, retries piling up) silently starve every later
 * fetch, freezing the whole app until a refresh.
 */
async function get<T>(url: string, tries = 2, externalSignal?: AbortSignal): Promise<T> {
  let lastErr: unknown;
  const attempts = Math.min(Math.max(tries, 1), 2);
  for (let i = 0; i < attempts; i++) {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let requestSignal: AbortSignal | undefined;
    let detachExternal: (() => void) | undefined;
    let timedOut = false;
    try {
      // Keep request replacement and timeout cancellation independent of the
      // browser's optional AbortSignal.any/timeout implementations. The
      // component-owned signal always wins and is never retried.
      const controller = new AbortController();
      requestSignal = controller.signal;
      timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort(new DOMException('Request timed out', 'TimeoutError'));
      }, 5000);
      const abortFromOwner = () => controller.abort(externalSignal?.reason);
      if (externalSignal) {
        if (externalSignal.aborted) abortFromOwner();
        else {
          externalSignal.addEventListener('abort', abortFromOwner, { once: true });
          detachExternal = () => externalSignal.removeEventListener('abort', abortFromOwner);
        }
      }
      const res = await fetch(API_BASE + url, { headers: HEADERS, signal: requestSignal });
      if (res.ok) return res.json();
      if (res.status < 500) {
        const error = new Error(`${url} → ${res.status}`) as Error & { status?: number };
        error.status = res.status;
        throw error;
      }
      lastErr = new Error(`${url} → ${res.status}`);
    } catch (err) {
      // A component-owned abort is a normal request replacement, not a
      // network failure. Never retry it or surface it as an error state.
      // An AbortError caused by our timeout is different: it is a transient
      // network failure and receives the single bounded retry below.
      if (externalSignal?.aborted || ((err instanceof DOMException && err.name === 'AbortError') && !timedOut)) throw err;
      // Client errors are deterministic (bad input, unauthorized, not found)
      // and retrying them only adds latency and duplicate work.
      if (Number((err as { status?: unknown })?.status) < 500) throw err;
      lastErr = err;
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      detachExternal?.();
    }
    if (i < attempts - 1) await sleep(250 + Math.floor(Math.random() * 251));
  }
  throw lastErr;
}

async function post<T>(url: string, body: unknown, retryable = false, timeoutMs = 20000): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < (retryable ? 3 : 1); i++) {
    try {
      const res = await fetch(API_BASE + url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...HEADERS },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) return json as T;
      const msg = (json as { error?: string }).error || `${url} → ${res.status}`;
      if (res.status < 500) {
        const error = new Error(msg) as Error & { status?: number };
        error.status = res.status;
        throw error;
      }
      lastErr = new Error(msg);
    } catch (err) {
      // Do not retry a request the server has already rejected as invalid.
      if (Number((err as { status?: unknown })?.status) < 500) throw err;
      lastErr = err;
    }
    if (retryable && i < 2) await sleep(1500 * (i + 1));
  }
  throw lastErr;
}

export const fetchHealth = () => get<Health>('/api/health');

export const searchIngredients = (q: string) =>
  get<Ingredient[]>(`/api/ingredients/search?q=${encodeURIComponent(q)}`);

export const fetchVibes = () => get<Vibe[]>('/api/vibes');

export interface RecipeQueryOptions {
  vibe?: string;
  category?: VibeId;
  collection?: CollectionId;
  q?: string;
  offset?: number;
  limit?: number;
  seed?: string;
  sort?: string;
  signal?: AbortSignal;
}

export const fetchRecipes = (opts: RecipeQueryOptions = {}) => {
  const p = new URLSearchParams();
  if (opts.vibe) p.set('vibe', opts.vibe);
  if (opts.category) p.set('category', opts.category);
  if (opts.collection) p.set('collection', opts.collection);
  if (opts.q) p.set('q', opts.q);
  if (opts.offset != null) p.set('offset', String(opts.offset));
  if (opts.limit) p.set('limit', String(opts.limit));
  if (opts.seed) p.set('seed', opts.seed);
  if (opts.sort) p.set('sort', opts.sort);
  return get<RecipePage>(`/api/recipes?${p}`, 2, opts.signal);
};

export const matchRecipes = (ingredients: string[], q = '', filter?: BrowseFilter) =>
  post<MatchResult>('/api/recipes/match', {
    ingredients,
    q,
    category: filter?.kind === 'category' ? filter.id : undefined,
    collection: filter?.kind === 'collection' ? filter.id : undefined,
  }, true);

export const identifyImage = (imageBase64: string, mimeType: string) =>
  post<{ detected: Ingredient[] }>('/api/identify', { imageBase64, mimeType }, false, 90000);

export const generateRecipe = (ingredients: string[], vibe?: string, avoid?: string[], taste?: string[]) =>
  post<Recipe>('/api/generate', { ingredients, vibe, avoid, taste }, false, 90000);

export const fetchLikes = () => get<Record<string, number>>('/api/likes');

export const fetchKeptRecipes = () => get<Recipe[]>('/api/kept');

export const postLike = (id: string, action: 'like' | 'unlike') =>
  post<{ id: string; likes: number }>(`/api/likes/${id}`, { action });

export const keepRecipe = (recipe: Recipe) => post<Recipe>('/api/keep', { recipe }, true);

/* ---- last orders (the quiz) ---- */
export const fetchQuizBatch = (seed: string, from: number, count = 20) =>
  get<{ questions: Question[]; total: number; high: number }>(
    `/api/quiz/stream?seed=${encodeURIComponent(seed)}&from=${from}&count=${count}`
  );

export const fetchHighScore = () =>
  get<{ score: number; at: number; hall: HallMember[]; bank: number }>('/api/quiz/high');

/** only a run that cleared the whole bank is accepted */
export const joinHall = (name: string, score: number) =>
  post<{ hall: HallMember[]; entry: HallMember }>('/api/quiz/hall', { name, score }, true);

export const submitHighScore = (score: number) =>
  post<{ score: number; at: number; beaten: boolean }>('/api/quiz/high', { score }, true);

export const fetchDailyQuestion = () => get<Question>('/api/quiz/today');

/* ---- the watch shelf ---- */
export const fetchVideos = () => get<WatchLibrary>('/api/videos');

export type WatchEventPayload =
  | { type: 'preview-impression' }
  | { type: 'open'; source: 'landing' | 'nav' | 'deep-link' | 'direct' };

export const postWatchEvent = (payload: WatchEventPayload) =>
  post<{ ok: boolean }>('/api/watch/event', payload, false, 8000);

/* ---- the Shorts shelf ---- */
export const fetchShorts = () => get<ShortLibrary>('/api/shorts');

export interface ShortSessionPayload {
  source: 'landing' | 'nav' | 'deep-link' | 'direct';
  videosStarted: number;
  advances: number;
  shares: number;
  recipeClicks: number;
  autoplayFailures: number;
  unavailableSkips?: number;
  bufferingEvents?: number;
  startupMsTotal?: number;
}

export const postShortSession = (payload: ShortSessionPayload) =>
  post<{ ok: boolean }>('/api/shorts/session', payload, false, 8000);

/* ---- bar nudges (web push) ---- */
export const fetchPushKey = () => get<{ key: string | null }>('/api/push/key');

export const pushSubscribe = (subscription: PushSubscriptionJSON) =>
  post<{ ok: boolean }>('/api/push/subscribe', { subscription });

export const pushUnsubscribe = (endpoint: string) =>
  post<{ ok: boolean }>('/api/push/unsubscribe', { endpoint });

export const pushSeen = (endpoint: string) => post<{ ok: boolean }>('/api/push/seen', { endpoint });

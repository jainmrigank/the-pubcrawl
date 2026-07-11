import type { Health, Ingredient, MatchResult, Recipe, Vibe } from './types';

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

async function get<T>(url: string): Promise<T> {
  const res = await fetch(API_BASE + url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(API_BASE + url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...HEADERS },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || `${url} → ${res.status}`);
  return json as T;
}

export const fetchHealth = () => get<Health>('/api/health');

export const searchIngredients = (q: string) =>
  get<Ingredient[]>(`/api/ingredients/search?q=${encodeURIComponent(q)}`);

export const fetchVibes = () => get<Vibe[]>('/api/vibes');

export const fetchRecipes = (opts: { vibe?: string; q?: string; limit?: number; seed?: string; sort?: string }) => {
  const p = new URLSearchParams();
  if (opts.vibe) p.set('vibe', opts.vibe);
  if (opts.q) p.set('q', opts.q);
  if (opts.limit) p.set('limit', String(opts.limit));
  if (opts.seed) p.set('seed', opts.seed);
  if (opts.sort) p.set('sort', opts.sort);
  return get<Recipe[]>(`/api/recipes?${p}`);
};

export const matchRecipes = (ingredients: string[]) =>
  post<MatchResult>('/api/recipes/match', { ingredients });

export const identifyImage = (imageBase64: string, mimeType: string) =>
  post<{ detected: Ingredient[] }>('/api/identify', { imageBase64, mimeType });

export const generateRecipe = (ingredients: string[], vibe?: string, avoid?: string[]) =>
  post<Recipe>('/api/generate', { ingredients, vibe, avoid });

export const fetchLikes = () => get<Record<string, number>>('/api/likes');

export const postLike = (id: string, action: 'like' | 'unlike') =>
  post<{ id: string; likes: number }>(`/api/likes/${id}`, { action });

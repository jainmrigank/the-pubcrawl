import type { Health, Ingredient, MatchResult, Recipe, Vibe } from './types';

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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

export const fetchRecipes = (opts: { vibe?: string; q?: string; limit?: number; seed?: string }) => {
  const p = new URLSearchParams();
  if (opts.vibe) p.set('vibe', opts.vibe);
  if (opts.q) p.set('q', opts.q);
  if (opts.limit) p.set('limit', String(opts.limit));
  if (opts.seed) p.set('seed', opts.seed);
  return get<Recipe[]>(`/api/recipes?${p}`);
};

export const matchRecipes = (ingredients: string[]) =>
  post<MatchResult>('/api/recipes/match', { ingredients });

export const identifyImage = (imageBase64: string, mimeType: string) =>
  post<{ detected: Ingredient[] }>('/api/identify', { imageBase64, mimeType });

export const generateRecipe = (ingredients: string[], vibe?: string, avoid?: string[]) =>
  post<Recipe>('/api/generate', { ingredients, vibe, avoid });

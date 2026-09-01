import type {
  BrowseFilter,
  ClientCatalogueBundle,
  Ingredient,
  RecipePage,
  ShelfRecipe,
} from './types';
import { norm, queryRecipes, shelfMatchRecipes } from '../shared/catalog-engine';
import { dailyQuizQuestion, quizPlaylistSlice } from '../shared/quiz-engine';

let catalogPromise: Promise<ClientCatalogueBundle> | null = null;
let quizPromise: Promise<import('./types').Question[]> | null = null;

function loadJson<T>(loader: () => Promise<{ default: unknown }>): Promise<T> {
  return loader().then((module) => module.default as T);
}

export function loadLocalCatalogue(): Promise<ClientCatalogueBundle> {
  if (!catalogPromise) {
    catalogPromise = loadJson<ClientCatalogueBundle>(() => import('./generated/client_catalog.json'))
      .catch((error) => {
        catalogPromise = null;
        throw error;
      });
  }
  return catalogPromise;
}

export function loadLocalQuiz(): Promise<import('./types').Question[]> {
  if (!quizPromise) {
    quizPromise = loadJson<import('./types').Question[]>(() => import('./generated/client_quiz.json'))
      .catch((error) => {
        quizPromise = null;
        throw error;
      });
  }
  return quizPromise;
}

export async function queryLocalRecipes(options: {
  q?: string;
  filter?: BrowseFilter;
  offset?: number;
  limit?: number;
  seed?: string;
  sort?: string;
  likes?: Record<string, number>;
  extraRecipes?: import('./types').Recipe[];
} = {}): Promise<RecipePage> {
  const bundle = await loadLocalCatalogue();
  const filter = options.filter || { kind: 'all' as const };
  const known = new Set(bundle.recipes.map((recipe) => recipe.id));
  const recipes = [...bundle.recipes, ...(options.extraRecipes || []).filter((recipe) => recipe?.id && !known.has(recipe.id))];
  return queryRecipes(recipes, {
    q: options.q,
    category: filter.kind === 'category' ? filter.id : '',
    collection: filter.kind === 'collection' ? filter.id : '',
    offset: options.offset,
    limit: options.limit,
    seed: options.seed,
    sort: options.sort,
    likes: options.likes,
    vibes: Object.fromEntries(bundle.vibes.map((vibe) => [vibe.id, vibe])),
  }) as RecipePage;
}

export async function matchLocalRecipes(options: {
  pantry: string[];
  q?: string;
  filter?: BrowseFilter;
  extraRecipes?: import('./types').Recipe[];
}): Promise<ShelfRecipe[]> {
  const bundle = await loadLocalCatalogue();
  const filter = options.filter || { kind: 'all' as const };
  const known = new Set(bundle.recipes.map((recipe) => recipe.id));
  const recipes = [...bundle.recipes, ...(options.extraRecipes || []).filter((recipe) => recipe?.id && !known.has(recipe.id))];
  return shelfMatchRecipes(recipes, options.pantry, {
    query: options.q,
    category: filter.kind === 'category' ? filter.id : '',
    collection: filter.kind === 'collection' ? filter.id : '',
    vibes: Object.fromEntries(bundle.vibes.map((vibe) => [vibe.id, vibe])),
  }) as ShelfRecipe[];
}

export async function searchLocalIngredients(query: string, limit = 12): Promise<Ingredient[]> {
  const bundle = await loadLocalCatalogue();
  const q = norm(query);
  if (!q) return [];
  const scored = bundle.ingredients.map((ingredient) => {
    const name = norm(ingredient.name);
    const score = name === q ? 100 : name.startsWith(q) ? 80 - name.length * 0.1 : name.split(' ').some((word: string) => word.startsWith(q)) ? 60 - name.length * 0.1 : name.includes(q) ? 40 - name.indexOf(q) : -1;
    return [score, ingredient] as const;
  }).filter(([score]) => score >= 0).sort((a, b) => b[0] - a[0]);
  return scored.slice(0, limit).map(([, ingredient]) => ingredient);
}

export async function localQuizSlice(seed: string, from = 0, count = 20) {
  const questions = await loadLocalQuiz();
  return quizPlaylistSlice(questions, seed, from, count);
}

export async function localQuestionOfDay(date = new Date()) {
  const questions = await loadLocalQuiz();
  return dailyQuizQuestion(questions, date);
}

import { createContext } from 'react';
import type { Ingredient } from '../types';

/** Local inventory only. Ingredient guides never write to the public recipe archive. */
export const IngredientShelfContext = createContext<{ shelf: Ingredient[]; onAdd: (ingredient: Ingredient) => void } | null>(null);

import type { ReactNode } from 'react';
import type { Recipe } from '../types';
import { ArrowDown } from '../icons';

export interface ShelfResultsProps {
  recipes: Recipe[];
  visible: number;
  matching: boolean;
  onLoadMore: () => void;
  renderCard: (recipe: Recipe, index: number) => ReactNode;
}

/**
 * The Bar's single results surface. Matching is owned by App; this component
 * only keeps the card grid and progressive disclosure in one stable DOM
 * region, so a new local match never blanks the cards already on screen.
 */
export function ShelfResults({ recipes, visible, matching, onLoadMore, renderCard }: ShelfResultsProps) {
  const shown = Math.min(visible, recipes.length);
  if (!recipes.length) return null;
  return (
    <>
      <div className="grid shelf-results-grid" aria-busy={matching}>
        {recipes.slice(0, visible).map((recipe, index) => renderCard(recipe, index))}
      </div>
      {shown < recipes.length && (
        <div className="more-row shelf-more-row">
          <button type="button" className="btn" onClick={onLoadMore}>
            SHOW MORE <ArrowDown size={14} />
          </button>
          <span className="k-label dim">{shown} OF {recipes.length} ON YOUR SHELF</span>
        </div>
      )}
    </>
  );
}


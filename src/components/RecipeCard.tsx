import { useState } from 'react';
import type { Recipe, Vibe } from '../types';
import { GlassIcon, Play } from '../icons';

interface Props {
  recipe: Recipe;
  vibe: Vibe;
  index: number;
  onVideo: (recipe: Recipe) => void;
}

/** Flip flash card — image + vibe on the front, the full spec sheet on the back. */
export function RecipeCard({ recipe, vibe, index, onVideo }: Props) {
  const [flipped, setFlipped] = useState(false);
  const isAI = recipe.source === 'ai' || recipe.source === 'fallback';
  const missing = recipe.missing ?? [];
  const ready = recipe.total != null && missing.length === 0;

  return (
    <div
      className={`fc ${flipped ? 'flipped' : ''} ${isAI ? 'ai' : ''}`}
      style={{ ['--vc' as string]: vibe.color }}
      onClick={() => setFlipped((f) => !f)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setFlipped((f) => !f);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${recipe.name} — flip for the recipe`}
    >
      <div className="fc-inner">
        {/* ---------- front ---------- */}
        <div className="ff front">
          {recipe.thumb ? (
            <div className="fc-img">
              <img src={recipe.thumb} alt={recipe.name} loading="lazy" />
            </div>
          ) : (
            <div className="fc-img fc-img-ai">
              <span className="fc-ai-mark">{recipe.source === 'ai' ? 'AI' : 'HOUSE'}</span>
              <GlassIcon glass={recipe.glass} size={72} />
            </div>
          )}
          <div className="fc-strip">
            <div className="fc-toprow">
              <span className="k-label">{isAI ? (recipe.source === 'ai' ? 'MACHINE DRAFT' : 'HOUSE DRAFT') : `Nº ${String(index + 1).padStart(3, '0')}`}</span>
              <span className="fc-vibe">
                <i className="swatch" />
                {vibe.label}
              </span>
            </div>
            <h3 className="fc-name">{recipe.name}</h3>
            <div className="fc-botrow">
              <span className="fc-glass">
                <GlassIcon glass={recipe.glass} size={16} />
                {recipe.glass || 'Any glass'}
              </span>
              {recipe.iba && <span className="k-label dim">IBA</span>}
              {(recipe.alcoholic || '').toLowerCase().includes('non') && <span className="k-label dim">ZERO-PROOF</span>}
            </div>
            {recipe.total != null && (
              <div className={`fc-status ${ready ? 'ready' : ''}`}>
                {ready ? (
                  <>READY TO POUR</>
                ) : (
                  <>MISSING {missing.length} — {missing.join(', ').toUpperCase()}</>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ---------- back ---------- */}
        <div className="ff back">
          <div className="fb-head">
            <span className="k-label">{isAI ? 'ORIGINAL' : `Nº ${String(index + 1).padStart(3, '0')}`}</span>
            <h3>{recipe.name}</h3>
            {recipe.tagline && <p className="fb-tagline">{recipe.tagline}</p>}
          </div>
          <ul className="fb-ings">
            {recipe.ingredients.map((i, idx) => (
              <li key={`${i.name}-${idx}`} className={i.have === false ? 'need' : ''}>
                <span className="fb-ing-name">
                  {i.have === false && <span className="k-label miss-mark">OUT</span>}
                  {i.name}
                </span>
                <span className="fb-ing-measure">{i.measure || '—'}</span>
              </li>
            ))}
          </ul>
          <p className="fb-method">{recipe.instructions}</p>
          <div className="fb-foot">
            <span className="fc-glass">
              <GlassIcon glass={recipe.glass} size={16} />
              {recipe.glass || 'Any glass'}
            </span>
            <button
              className="text-btn"
              onClick={(e) => {
                e.stopPropagation();
                onVideo(recipe);
              }}
            >
              WATCH <Play size={11} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

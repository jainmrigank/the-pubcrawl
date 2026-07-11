import { useState } from 'react';
import type { Recipe, Vibe } from '../types';
import { Check, GlassIcon, Play, Plus, Share, X } from '../icons';
import { recipeShareText, shareContent } from '../share';

interface Props {
  recipe: Recipe;
  vibe: Vibe;
  index: number;
  onVideo: (recipe: Recipe) => void;
  onToggleTab?: (recipe: Recipe) => void;
  inTab?: boolean;
  /** On The Tab page the toggle reads as "remove": cross icon, matching tip. */
  removeMode?: boolean;
}

/** Tab + share buttons, shown on both faces of the card. */
function CardActions({ recipe, vibe, onToggleTab, inTab, removeMode }: Pick<Props, 'recipe' | 'vibe' | 'onToggleTab' | 'inTab' | 'removeMode'>) {
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function doShare(e: React.MouseEvent) {
    e.stopPropagation();
    const outcome = await shareContent(`${recipe.name} · The PubCrawl`, recipeShareText(recipe, vibe.label));
    if (outcome === 'copied' || outcome === 'failed') {
      setShareState(outcome);
      setTimeout(() => setShareState('idle'), 1600);
    }
  }

  const tabTip = removeMode ? 'TAKE IT OFF MY TAB' : inTab ? 'ON MY TAB. TAP TO REMOVE' : 'PUT IT ON MY TAB';
  const shareTip = shareState === 'copied' ? 'COPIED!' : shareState === 'failed' ? 'SHARING BLOCKED HERE' : 'SHARE THIS DRINK';

  return (
    <div className="card-actions">
      {onToggleTab && (
        <button
          className={`act-btn ${inTab && !removeMode ? 'on' : ''}`}
          data-tip={tabTip}
          onClick={(e) => {
            e.stopPropagation();
            onToggleTab(recipe);
          }}
          aria-label={tabTip}
        >
          {removeMode ? <X size={15} /> : inTab ? <Check size={15} /> : <Plus size={15} />}
        </button>
      )}
      <button
        className={`act-btn ${shareState === 'copied' ? 'done' : ''}`}
        data-tip={shareTip}
        onClick={doShare}
        aria-label={`Share ${recipe.name}`}
      >
        {shareState === 'copied' ? <Check size={15} /> : <Share size={15} />}
      </button>
    </div>
  );
}

/** Flip flash card. Photo and vibe on the front, the full recipe on the back. */
export function RecipeCard({ recipe, vibe, index, onVideo, onToggleTab, inTab = false, removeMode = false }: Props) {
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
      aria-label={`${recipe.name}. Flip for the recipe`}
    >
      <div className="fc-inner">
        {/* ---------- front ---------- */}
        <div className="ff front">
          <CardActions recipe={recipe} vibe={vibe} onToggleTab={onToggleTab} inTab={inTab} removeMode={removeMode} />
          {recipe.thumb ? (
            <div className="fc-img">
              <img src={recipe.thumb} alt={recipe.name} loading="lazy" />
            </div>
          ) : (
            <div className="fc-img fc-img-ai">
              <span className="fc-ai-mark">SPECIAL</span>
              <GlassIcon glass={recipe.glass} size={72} />
            </div>
          )}
          <div className="fc-strip">
            <div className="fc-toprow">
              <span className="k-label">{isAI ? (recipe.source === 'ai' ? 'HOUSE SPECIAL' : 'OFF-MENU SPECIAL') : `Nº ${String(index + 1).padStart(3, '0')}`}</span>
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
              {recipe.iba && <span className="k-label dim">CLASSIC</span>}
              {(recipe.alcoholic || '').toLowerCase().includes('non') && <span className="k-label dim">ZERO-PROOF</span>}
            </div>
            {recipe.total != null && (
              <div className={`fc-status ${ready ? 'ready' : ''}`}>
                {ready ? <>READY TO POUR</> : <>NEEDS {missing.join(', ').toUpperCase()}</>}
              </div>
            )}
          </div>
        </div>

        {/* ---------- back ---------- */}
        <div className="ff back">
          <CardActions recipe={recipe} vibe={vibe} onToggleTab={onToggleTab} inTab={inTab} removeMode={removeMode} />
          <div className="fb-head">
            <span className="k-label">{isAI ? 'HOUSE SPECIAL' : `Nº ${String(index + 1).padStart(3, '0')}`}</span>
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
              WATCH IT MADE <Play size={11} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

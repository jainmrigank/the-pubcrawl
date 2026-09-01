import { useState } from 'react';
import type { Recipe, Vibe } from '../types';
import { Check, GlassIcon, Heart, Play, Plus, Share, X } from '../icons';
import { recipeShareText, shareContent } from '../share';
import { formatMeasure } from '../measure';

interface Props {
  recipe: Recipe;
  vibe: Vibe;
  index: number;
  onVideo: (recipe: Recipe) => void;
  onToggleTab?: (recipe: Recipe) => void;
  inTab?: boolean;
  /** On The Tab page the toggle reads as "remove": cross icon, matching tip. */
  removeMode?: boolean;
  /** Public like count + whether this browser has liked it. */
  likes?: number;
  liked?: boolean;
  onToggleLike?: (recipe: Recipe) => void;
  /** Persist a machine-drafted drink into the menu when it's kept/shared. */
  onKeep?: (recipe: Recipe) => void;
}

/** The three card actions (tab / share / like), used on both faces. */
export function RecipeCardActions({
  recipe,
  vibe,
  onToggleTab,
  inTab,
  removeMode,
  likes = 0,
  liked = false,
  onToggleLike,
  onKeep,
}: Omit<Props, 'index' | 'onVideo'>) {
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function doShare(e: React.MouseEvent) {
    e.stopPropagation();
    const outcome = await shareContent(`${recipe.name} · The PubCrawl`, recipeShareText(recipe, vibe.label));
    if (outcome === 'copied' || outcome === 'failed') {
      setShareState(outcome);
      setTimeout(() => setShareState('idle'), 1600);
    }
    if (outcome === 'shared' || outcome === 'copied') onKeep?.(recipe);
  }

  const tabTip = removeMode ? 'TAKE IT OFF MY TAB' : inTab ? 'ON MY TAB. TAP TO REMOVE' : 'PUT IT ON MY TAB';
  const shareTip = shareState === 'copied' ? 'COPIED!' : shareState === 'failed' ? 'SHARING BLOCKED HERE' : 'SHARE THIS DRINK';
  const likeTip = liked ? 'LOVED. TAP TO TAKE IT BACK' : 'GIVE IT SOME LOVE';

  return (
    <>
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
      {onToggleLike && (
        <button
          className={`act-btn like ${liked ? 'on' : ''}`}
          data-tip={likeTip}
          aria-pressed={liked}
          aria-label={liked ? `Unlike ${recipe.name}` : `Like ${recipe.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleLike(recipe);
          }}
        >
          <Heart size={15} />
          {likes > 0 && <span className="act-count">{likes}</span>}
        </button>
      )}
    </>
  );
}

/** Flip flash card. Photo and vibe on the front, the full recipe on the back. */
export function RecipeCard(props: Props) {
  const { recipe, vibe, index, onVideo } = props;
  const [flipped, setFlipped] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const isAI = recipe.source === 'ai' || recipe.source === 'fallback';
  const isHouseOriginal = recipe.houseOriginal === true;
  const isIndia = (recipe.tags || []).includes('India');
  let cardLabel = `Nº ${String(index + 1).padStart(3, '0')}`;
  if (isIndia) cardLabel = 'INDIA COLLECTION';
  if (isHouseOriginal) cardLabel = 'HOUSE SPECIAL';
  if (isAI) cardLabel = recipe.source === 'ai' ? 'HOUSE SPECIAL' : 'OFF-MENU SPECIAL';
  const buttons = <RecipeCardActions {...props} />;

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
      data-recipe-id={recipe.id}
      aria-label={`${recipe.name}. Flip for the recipe`}
    >
      <div className="fc-inner">
        {/* ---------- front ---------- */}
        <div className="ff front">
          {!flipped && <div className="card-actions">{buttons}</div>}
          {recipe.thumb && !imageFailed ? (
            <div className="fc-img">
              <img
                src={recipe.thumb}
                alt={recipe.name}
                loading="lazy"
                decoding="async"
                onError={() => setImageFailed(true)}
              />
            </div>
          ) : (
            <div className="fc-img fc-img-ai" role="img" aria-label="No verified photo available">
              <span className="fc-ai-mark">NO PHOTO</span>
              <GlassIcon glass={recipe.glass} size={72} />
            </div>
          )}
          <div className="fc-strip">
            <div className="fc-toprow">
              <span className="k-label">{cardLabel}</span>
              <span className="fc-vibe">
                <i className="swatch" />
                {vibe.label}
              </span>
            </div>
            <h3 className="fc-name" data-recipe-heading tabIndex={-1}>{recipe.name}</h3>
            <div className="fc-botrow">
              <span className="fc-glass">
                <GlassIcon glass={recipe.glass} size={16} />
                {recipe.glass || 'Any glass'}
              </span>
              {recipe.iba && <span className="k-label dim">CLASSIC</span>}
            </div>
          </div>
        </div>

        {/* ---------- back ---------- */}
        <div className="ff back">
          <div className="fb-head">
            <div className="fb-head-top">
              <span className="k-label">{cardLabel}</span>
              {flipped && <div className="fb-actions">{buttons}</div>}
            </div>
            <h3>{recipe.name}</h3>
            {recipe.tagline && <p className="fb-tagline">{recipe.tagline}</p>}
          </div>
          <div className="fb-scroll">
            <ul className="fb-ings">
              {recipe.ingredients.map((i, idx) => (
                <li key={`${i.name}-${idx}`} className={i.have === false ? 'need' : ''}>
                  <span className="fb-ing-name">
                    {i.have === false && <span className="k-label miss-mark">OUT</span>}
                    {i.name}
                    {i.optional && <span className="k-label opt-mark">OPTIONAL</span>}
                  </span>
                  <span className="fb-ing-measure">{formatMeasure(i.measure) || '—'}</span>
                </li>
              ))}
            </ul>
            <p className="fb-method">{recipe.instructions}</p>
          </div>
          <div className="fb-foot">
            <span className="fc-glass">
              <GlassIcon glass={recipe.glass} size={16} />
              {recipe.glass || 'Any glass'}
            </span>
            {recipe.video && (
              <button
                className="text-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onVideo(recipe);
                }}
              >
                WATCH IT MADE{' '}
                <Play size={11} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

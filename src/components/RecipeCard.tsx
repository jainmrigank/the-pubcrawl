import { useId, useRef, useState } from 'react';
import type { Recipe, Vibe } from '../types';
import { ArrowLeft, ArrowRight, Check, Expand, GlassIcon, Heart, Play, Plus, Share, X } from '../icons';
import { recipeShareText, shareContent } from '../share';
import { formatMeasure } from '../measure';
import type { RecipeFocusOrigin } from '../recipeFocusTypes';

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
  /** Optional stable tutorial anchor for this card's action rail. */
  tourActions?: string;
  onExpand?: (origin: RecipeFocusOrigin) => void;
  /** Only offered for classics with a reviewed taste profile. */
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
}: Omit<Props, 'index' | 'onVideo' | 'tourActions'>) {
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

  const tabTip = removeMode ? 'Take it off my Tab' : inTab ? 'On my Tab. Tap to remove' : 'Put it on my Tab';
  const shareTip = shareState === 'copied' ? 'Copied' : shareState === 'failed' ? 'Sharing blocked here' : 'Share this drink';
  const likeTip = liked ? 'Loved. Tap to take it back' : 'Give it some love';

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
  const { recipe, vibe, index, onVideo, onExpand, tourActions } = props;
  const [flipped, setFlipped] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const pointerMoved = useRef(false);
  const instanceId = useId();
  const isAI = recipe.source === 'ai' || recipe.source === 'fallback';
  const isHouseOriginal = recipe.houseOriginal === true;
  const isIndia = (recipe.tags || []).includes('India');
  let cardLabel = `Nº ${String(index + 1).padStart(3, '0')}`;
  if (isIndia) cardLabel = 'India collection';
  if (isHouseOriginal) cardLabel = 'House special';
  if (isAI) cardLabel = recipe.source === 'ai' ? 'House special' : 'Off-menu special';
  const buttons = <RecipeCardActions {...props} />;

  const toggleFace = (event: React.SyntheticEvent) => {
    event.stopPropagation();
    setFlipped((current) => !current);
  };

  const expand = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const element = rootRef.current;
    if (!element || !onExpand) return;
    onExpand({
      recipe,
      vibe,
      instanceId,
      element,
      trigger: event.currentTarget,
      flipped,
      cardScrollTop: scrollRef.current?.scrollTop ?? 0,
    });
  };

  const flipFromSurface = (event: React.MouseEvent<HTMLElement>) => {
    if (pointerMoved.current) {
      pointerMoved.current = false;
      return;
    }
    const target = event.target as Element;
    if (target.closest('button, a, input, select, textarea, [data-card-control]')) return;
    if (window.getSelection()?.toString()) return;
    setFlipped((current) => !current);
  };

  return (
    <article
      ref={rootRef}
      className={`fc ${flipped ? 'flipped' : ''} ${isAI ? 'ai' : ''}`}
      style={{ ['--vc' as string]: vibe.color }}
      onClick={flipFromSurface}
      onPointerDown={(event) => {
        pointerStart.current = { x: event.clientX, y: event.clientY };
        pointerMoved.current = false;
      }}
      onPointerMove={(event) => {
        const start = pointerStart.current;
        if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) pointerMoved.current = true;
      }}
      onPointerCancel={() => { pointerStart.current = null; pointerMoved.current = false; }}
      onPointerUp={() => { pointerStart.current = null; }}
      data-recipe-id={recipe.id}
      data-recipe-instance={instanceId}
      aria-label={`${recipe.name} recipe card`}
    >
      <div className="fc-inner">
        {/* ---------- front ---------- */}
        <div className="ff front" aria-hidden={flipped}>
          {!flipped && <div className="card-actions" data-tour={tourActions}>{buttons}</div>}
          {!flipped && onExpand && (
            <button type="button" className="fc-expand fc-expand-photo" onClick={expand} aria-label={`Open ${recipe.name} full screen`}>
              <Expand size={21} />
            </button>
          )}
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
              <span className="fc-ai-mark">No photo</span>
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
            <h3 className="fc-name" data-recipe-heading tabIndex={flipped ? undefined : -1}>{recipe.name}</h3>
            <div className="fc-botrow">
              <span className="fc-glass">
                <GlassIcon glass={recipe.glass} size={16} />
                {recipe.glass || 'Any glass'}
              </span>
              {recipe.iba && <span className="k-label dim">Classic</span>}
            </div>
            {!flipped && (
              <div className="fc-face-controls" data-card-control>
                <button type="button" className="fc-flip-control" onClick={toggleFace}>
                  View recipe <ArrowRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ---------- back ---------- */}
        <div className="ff back" aria-hidden={!flipped}>
          <div className="fb-head">
            <div className="fb-head-top">
              <span className="k-label">{cardLabel}</span>
              {flipped && <div className="fb-actions" data-tour={tourActions}>{buttons}</div>}
            </div>
            <h3>{recipe.name}</h3>
            {recipe.tagline && <p className="fb-tagline">{recipe.tagline}</p>}
          </div>
          <div className="fb-scroll" ref={scrollRef}>
            <ul className="fb-ings">
              {recipe.ingredients.map((i, idx) => (
                <li key={`${i.name}-${idx}`} className={i.have === false ? 'need' : ''}>
                  <span className="fb-ing-name">
                    {i.have === false && <span className="k-label miss-mark">Out</span>}
                    {i.name}
                    {i.optional && <span className="k-label opt-mark">Optional</span>}
                  </span>
                  <span className="fb-ing-measure">{formatMeasure(i.measure) || '—'}</span>
                </li>
              ))}
            </ul>
            <p className="fb-method">{recipe.instructions}</p>
          </div>
          <div className="fb-foot">
            <button type="button" className="fc-flip-control" onClick={toggleFace}>
              <ArrowLeft size={14} /> Photo
            </button>
            <div className="fb-foot-actions" data-card-control>
              {recipe.video && (
                <button
                  className="text-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onVideo(recipe);
                  }}
                >
                  Watch <Play size={11} />
                </button>
              )}
              {onExpand && (
                <button type="button" className="fc-expand" onClick={expand} aria-label={`Open ${recipe.name} full screen`}>
                  <Expand size={21} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

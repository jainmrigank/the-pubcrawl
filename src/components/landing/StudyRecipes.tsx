import { RecipeIngredientRow, RecipeAvailability } from '../RecipeIngredient';
import { ingredientMatches, isStaple } from '../../../shared/catalog-engine';
import { resolveIngredient } from '../../../shared/ingredient-guide';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Ingredient, Recipe, Vibe, VibeId } from '../../types';
import type { RecipeFocusOrigin } from '../../recipeFocusTypes';
import type { AtlasRecipe } from '../../atlasMath';
import { loadLocalCatalogue } from '../../localData';
import { recipeShareText, shareContent } from '../../share';
import { ArrowLeft, ArrowRight, Check, Expand, GlassIcon, Heart, Play, Plus, Share } from '../../icons';

/** Home uses the same saved recipes, likes and reader as the rest of the app. */
export interface StudyActions {
  shelf: Ingredient[];
  onAddToShelf: (ingredients: Ingredient[]) => void;
  saved: Set<string>;
  liked: Set<string>;
  likes: Record<string, number>;
  onSave: (recipe: Recipe) => void;
  onLike: (recipe: Recipe) => void;
  onVideo: (recipe: Recipe) => void;
  onExpand: (origin: RecipeFocusOrigin) => void;
  vibeOf: (id: VibeId) => Vibe;
}

interface Props {
  recipes: AtlasRecipe[];
  contextKey: string;
  actions: StudyActions;
  toolbar?: ReactNode;
  missing?: Map<string, string[]>;
  availability?: Map<string, string>;
  ingredientName?: (id: string) => string;
  empty: string;
  singlePanel?: boolean;
  available?: string[];
  onEdit?: () => void;
}

/** Keep the list mounted: returning restores its scroll and the exact trigger. */
export function StudyRecipes({ recipes, contextKey, actions, toolbar, missing, availability, ingredientName, empty, singlePanel = false, available, onEdit }: Props) {
  const [selection, setSelection] = useState<{ id: string; context: string } | null>(null);
  const selected = selection?.context === contextKey ? recipes.find(item => item.id === selection.id) : undefined;
  const list = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const origin = useRef<{ trigger: HTMLButtonElement; y: number; top: number } | null>(null);
  const back = useRef<HTMLButtonElement>(null);
  const listHeading = useId();
  useEffect(() => { if (list.current) list.current.scrollTop = 0; }, [contextKey]);
  const choose = (recipe: AtlasRecipe, trigger: HTMLButtonElement) => {
    origin.current = { trigger, y: window.scrollY, top: list.current?.scrollTop ?? 0 };
    setSelection({ id: recipe.id, context: contextKey });
    requestAnimationFrame(() => {
      if (window.matchMedia('(max-width: 900px)').matches) {
        const top = preview.current?.getBoundingClientRect().top ?? 0;
        // Account for the study's pinned controls as well as the main navigation.
        const returnBar = preview.current?.querySelector<HTMLElement>('.study-recipe-return');
        const readingTop = returnBar ? parseFloat(getComputedStyle(returnBar).top) : 68;
        window.scrollBy({ top: top - (Number.isFinite(readingTop) ? readingTop : 68) - 12, behavior: 'instant' });
      }
      back.current?.focus({ preventScroll: true });
    });
  };
  const returnToList = () => {
    setSelection(null);
    requestAnimationFrame(() => {
      if (!origin.current) return;
      if (list.current) list.current.scrollTop = origin.current.top;
      origin.current.trigger.focus({ preventScroll: true });
      window.scrollTo({ top: origin.current.y, behavior: 'instant' });
    });
  };
  return <div className={`study-recipe-browser${selected ? ' has-selection' : ''}${singlePanel ? ' is-single-panel' : ''}`}>
    <div className="study-recipe-choices">
      {toolbar}
      <div className="study-recipe-results">
        <h4 id={listHeading} className="study-results-caption">{recipes.length} {recipes.length === 1 ? 'drink' : 'drinks'}<span>Choose a drink</span></h4>
        <div ref={list} className="study-recipe-list" role="region" aria-labelledby={listHeading} tabIndex={recipes.length ? 0 : undefined}>
          {recipes.map(recipe => {
            const absent = missing?.get(recipe.id);
            return <button type="button" key={recipe.id} className={selected?.id === recipe.id ? 'is-selected' : undefined} aria-pressed={selected?.id === recipe.id} onClick={event => choose(recipe, event.currentTarget)}>
              <span><strong>{recipe.name}</strong>{absent && <small>{absent.length ? 'Need ' + absent.map(id => ingredientName?.(id) || id).join(', ') : availability?.get(recipe.id) || 'Ready now'}</small>}</span><ArrowRight size={18} />
            </button>;
          })}
          {!recipes.length && <p className="study-recipe-empty">{empty}</p>}
        </div>
      </div>
    </div>
    <div ref={preview} className="study-recipe-focus" hidden={!selected}>
      {selected && <><div className="study-recipe-return"><button type="button" ref={back} onClick={returnToList}><ArrowLeft size={16} />Back to {recipes.length} {recipes.length === 1 ? 'drink' : 'drinks'}</button>{onEdit && <button type="button" className="study-edit-ingredients" onClick={() => { setSelection(null); requestAnimationFrame(onEdit); }}>{available?.length} ingredients · Edit</button>}</div><StudyRecipe key={selected.id} id={selected.id} name={selected.name} actions={actions} available={available} /></>}
    </div>
    {!selected && recipes.length > 0 && <div className="study-recipe-prompt"><GlassIcon glass="Cocktail glass" size={48} /><p>Choose a drink</p><span>Ingredients and method, right here.</span></div>}
  </div>;
}

function StudyRecipe({ id, name, actions, available }: { id: string; name: string; actions: StudyActions; available?: string[] }) {
  const [detail, setDetail] = useState<{ recipe: Recipe; vibe?: Vibe } | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const [shareState, setShareState] = useState('');
  const root = useRef<HTMLElement>(null);
  const instance = useId();
  const heading = useId();
  useEffect(() => {
    let active = true;
    setError(false);
    // The full catalogue is fetched only after a recipe is chosen, never on
    // Home's initial render. Reuse the existing offline-first loader/cache.
    loadLocalCatalogue().then(bundle => {
      const result = bundle.recipes.find(item => item.id === id);
      if (!result) throw new Error('Recipe unavailable');
      if (active) setDetail({ recipe: result, vibe: bundle.vibes.find(item => item.id === result.vibe) });
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [id, attempt]);
  if (error) return <div className="study-recipe-empty" role="alert"><p>Couldn’t load {name}.</p><button type="button" className="study-button" onClick={() => setAttempt(value => value + 1)}>Try again</button></div>;
  if (!detail) return <p className="study-recipe-loading" role="status">Loading {name}…</p>;
  const loaded = detail.recipe;
  const recipe = available ? { ...loaded, ingredients: loaded.ingredients.map(item => ({ ...item, ...resolveIngredient(item.name, available, loaded, ingredientMatches, isStaple) })) } : loaded;
  const vibe = detail.vibe || actions.vibeOf(recipe.vibe);
  const share = async () => {
    const result = await shareContent(`${recipe.name} · The PubCrawl`, recipeShareText(recipe, vibe.label));
    setShareState(result === 'copied' ? 'Copied' : result === 'failed' ? 'Couldn’t share' : '');
  };
  return <article ref={root} className="study-recipe-preview" aria-labelledby={heading} data-recipe-id={recipe.id} data-recipe-instance={instance}>
    <h4 id={heading}>{recipe.name}</h4><RecipeAvailability recipe={recipe} />
    <figure className="study-recipe-photo">
      {recipe.thumb && !imageFailed ? <img src={recipe.thumb} alt={recipe.name} width="700" height="460" decoding="async" onError={() => setImageFailed(true)} /> : <div role="img" aria-label="No recipe photo available"><GlassIcon glass={recipe.glass} size={72} /><span>No photo</span></div>}
      <button type="button" className="study-recipe-expand" aria-label={`Open ${recipe.name} in full screen`} onClick={event => {
        if (root.current) actions.onExpand({ recipe, vibe, instanceId: instance, element: root.current, trigger: event.currentTarget, flipped: false, cardScrollTop: 0, returnLabel: 'Back to recipe' });
      }}><Expand size={22} /></button>
    </figure>
    <div className="study-recipe-details">
      <section aria-label="Ingredients"><h5>Ingredients</h5><dl>{recipe.ingredients.map((ingredient, index) => <RecipeIngredientRow key={index} ingredient={ingredient} recipe={recipe} as="div" />)}</dl></section>
      <section aria-label="Method"><h5>Method</h5>{recipe.instructions ? <ol>{recipe.instructions.split(/\n+/).map(part => part.trim()).filter(Boolean).map((part, index) => <li key={index}>{part}</li>)}</ol> : <p>No method available.</p>}<p className="study-recipe-glass"><GlassIcon glass={recipe.glass} size={16} />{recipe.glass || 'Any glass'}</p>{recipe.video && <button type="button" className="study-video-link" onClick={() => actions.onVideo(recipe)}><Play size={16} />Watch recipe</button>}</section>
    </div>
    <div className="study-recipe-actions">
      <button type="button" className="study-save" aria-pressed={actions.saved.has(recipe.id)} onClick={() => actions.onSave(recipe)}>{actions.saved.has(recipe.id) ? <Check size={16} /> : <Plus size={16} />}{actions.saved.has(recipe.id) ? 'Saved to Tab' : 'Save to Tab'}</button>
      <button type="button" onClick={share}><Share size={16} /><span aria-live="polite">{shareState || 'Share'}</span></button>
      <button type="button" aria-pressed={actions.liked.has(recipe.id)} onClick={() => actions.onLike(recipe)}><Heart size={16} />{actions.liked.has(recipe.id) ? 'Liked' : 'Like'}{actions.likes[recipe.id] > 0 && <span>{actions.likes[recipe.id]}</span>}</button>
    </div>
  </article>;
}

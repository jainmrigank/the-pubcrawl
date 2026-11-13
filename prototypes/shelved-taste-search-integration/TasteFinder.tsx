import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Ingredient, Recipe, Vibe } from '../types';
import type { RecipeFocusOrigin } from '../recipeFocusTypes';
import { loadLocalCatalogue } from '../localData';
import { FLAVOUR_PATHS, hasTasteFlavour, ingredientDifferences, shelfAvailability, TASTE_CONNECTIONS, TASTE_PROFILES } from '../tasteProfiles';
import type { TasteContext, TasteProfile } from '../tasteProfiles';
import { ArrowLeft, ArrowRight, Check, Plus, X } from '../icons';
import { formatMeasure } from '../measure';
import { GlassDrawing } from './landing/GlassDrawing';

interface Props {
  active: boolean;
  query: string;
  matchingIds: Set<string>;
  matchTotal: number | null;
  context: TasteContext;
  request: { id: number; focus: 'map' | 'preview' };
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onContext: (context: TasteContext) => void;
  onCatalogue: (recipes: Recipe[]) => void;
  pantry: Ingredient[];
  saved: Set<string>;
  onSave: (recipe: Recipe) => void;
  onExpand: (origin: RecipeFocusOrigin) => void;
  onList: () => void;
}

function DrinkDrawing({ profile }: { profile: TasteProfile }) {
  return <span className="taste-drink-art" style={{ ['--accent' as string]: profile.colour }}><GlassDrawing kind={profile.kind} garnish={profile.garnish} cream={profile.id === '12528'} /></span>;
}

export function TasteFinder({ active, query, matchingIds, matchTotal, context, request, selectedId, onSelect, onContext, onCatalogue, pantry, saved, onSave, onExpand, onList }: Props) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [vibes, setVibes] = useState<Vibe[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState(0);
  const [path, setPath] = useState('');
  const [word, setWord] = useState('');
  const [comparison, setComparison] = useState<{ left: string; right: string } | null>(null);
  const previewRef = useRef<HTMLElement>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const comparisonRef = useRef<HTMLElement>(null);
  const comparisonTrigger = useRef<HTMLButtonElement>(null);
  const chooser = useRef<HTMLButtonElement | null>(null);
  const needFocus = useRef(false);
  const instance = useId();
  const handledRequest = useRef(request.id);
  const shelfOnly = context.kind === 'shelf';
  const contextKey = context.kind === 'related' ? `related:${context.anchorId}` : context.kind === 'flavour' ? `flavour:${context.flavour}` : context.kind;

  useEffect(() => {
    if (!active || recipes.length) return;
    let live = true;
    setFailed(false);
    loadLocalCatalogue().then(data => {
      if (live) { setRecipes(data.recipes); setVibes(data.vibes); onCatalogue(data.recipes); }
    }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [active, recipes.length, attempt, onCatalogue]);

  const recipeById = useMemo(() => new Map(recipes.map(recipe => [recipe.id, recipe])), [recipes]);
  const profileById = useMemo(() => new Map(TASTE_PROFILES.map(profile => [profile.id, profile])), []);
  const pantryNames = useMemo(() => pantry.map(ingredient => ingredient.name), [pantry]);
  const selected = selectedId ? recipeById.get(selectedId) : undefined;
  const selectedProfile = selectedId ? profileById.get(selectedId) : undefined;
  const anchor = context.kind === 'related' ? recipeById.get(context.anchorId) : selected;
  const anchorProfile = context.kind === 'related' ? profileById.get(context.anchorId) : selectedProfile;
  const flavourPath = FLAVOUR_PATHS.find(item => item.id === path);
  const filtered = useMemo(() => TASTE_PROFILES.filter(profile => {
    const recipe = recipeById.get(profile.id);
    if (!recipe) return false;
    if (context.kind === 'matches' && !matchingIds.has(profile.id)) return false;
    if (context.kind === 'related' && profile.id !== context.anchorId && !profileById.get(context.anchorId)?.neighbours.includes(profile.id)) return false;
    if (context.kind === 'flavour' && !hasTasteFlavour(profile, context.flavour)) return false;
    if (word && !hasTasteFlavour(profile, word)) return false;
    if (!word && flavourPath && !flavourPath.words.some(flavour => hasTasteFlavour(profile, flavour))) return false;
    if (shelfOnly) { const state = shelfAvailability(recipe, pantryNames); if (!state.matched || state.missing.length > 1) return false; }
    return true;
  }), [recipeById, context, matchingIds, profileById, flavourPath, word, shelfOnly, pantryNames]);
  // Keep the authored groups rather than packing filtered points together.
  // Their labels retain their spacing on small screens without moving taste positions.
  const groups = useMemo(() => {
    const ids = new Set(filtered.map(profile => profile.id));
    return Array.from({ length: Math.ceil(TASTE_PROFILES.length / 4) }, (_, i) => TASTE_PROFILES.slice(i * 4, i * 4 + 4).filter(profile => ids.has(profile.id))).filter(group => group.length);
  }, [filtered]);
  const pageCount = Math.max(1, groups.length);
  const currentPage = Math.min(page, pageCount - 1);
  const visible = groups[currentPage] || [];
  const currentGroups = useRef(groups);
  currentGroups.current = groups;
  const currentSelection = useRef(selectedId);
  currentSelection.current = selectedId;
  useEffect(() => {
    setPath(''); setWord(''); setPage(0);
    // Wait for cleared flavour filters before locating a new collection's
    // selected drink in its original, unchanged map group.
    if (!contextKey.startsWith('related:')) return;
    const frame = requestAnimationFrame(() => {
      const index = currentGroups.current.findIndex(group => group.some(profile => profile.id === currentSelection.current));
      if (index >= 0) setPage(index);
    });
    return () => cancelAnimationFrame(frame);
  }, [contextKey]);
  useEffect(() => { setPage(0); }, [path, word, context.kind === 'matches' ? query : '']);

  useEffect(() => {
    if (!active || !recipes.length || handledRequest.current === request.id) return;
    handledRequest.current = request.id;
    if (request.focus === 'preview') {
      const index = currentGroups.current.findIndex(group => group.some(profile => profile.id === currentSelection.current));
      if (index >= 0) setPage(index);
    }
    const frame = requestAnimationFrame(() => {
      if (request.focus === 'preview') {
        previewRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior });
        previewHeading.current?.focus({ preventScroll: true });
        return;
      }
      const heading = document.getElementById('taste-context-title');
      heading?.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior });
      heading?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [active, recipes.length, request]);

  useEffect(() => {
    if (!active || !selected || !needFocus.current) return;
    needFocus.current = false;
    const frame = requestAnimationFrame(() => {
      previewHeading.current?.focus({ preventScroll: true });
      if (matchMedia('(max-width: 760px)').matches) previewRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior });
    });
    return () => cancelAnimationFrame(frame);
  }, [active, selected]);

  const select = (id: string, trigger?: HTMLButtonElement) => {
    if (trigger) chooser.current = trigger;
    const groupIndex = groups.findIndex(group => group.some(profile => profile.id === id));
    if (groupIndex >= 0) setPage(groupIndex);
    needFocus.current = true;
    if (id === selectedId) {
      needFocus.current = false;
      previewHeading.current?.focus({ preventScroll: true });
      if (matchMedia('(max-width: 760px)').matches) previewRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior });
    }
    onSelect(id);
  };
  const closePreview = () => {
    onSelect(null);
    requestAnimationFrame(() => {
      const trigger = chooser.current;
      if (trigger?.isConnected) trigger.focus();
      else document.querySelector<HTMLElement>('#taste-map button')?.focus();
    });
  };
  const availability = (recipe: Recipe) => {
    const state = shelfAvailability(recipe, pantryNames);
    if (!pantry.length) return 'Add your ingredients to check your Shelf.';
    if (!state.missing.length) return 'All ingredients available.';
    if (state.missing.length === 1) return `You need ${state.missing[0].toLowerCase()}.`;
    return `${state.missing.length} ingredients needed.`;
  };
  const beginComparison = () => {
    if (!selected) return;
    const other = context.kind === 'related' && context.anchorId !== selected.id ? context.anchorId : selectedProfile?.neighbours.find(id => recipeById.has(id)) || TASTE_PROFILES.find(profile => profile.id !== selected.id)?.id;
    if (!other) return;
    setComparison({ left: selected.id, right: other });
    requestAnimationFrame(() => { comparisonRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior }); comparisonRef.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true }); });
  };

  if (failed) return <div className="taste-empty" role="status"><h2>The map couldn’t load.</h2><p>Your search and Shelf are still here.</p><button className="btn" onClick={() => setAttempt(value => value + 1)}>Try again</button><button className="text-btn" onClick={onList}>Browse the full list</button></div>;
  if (!recipes.length) return <p className="taste-loading" role="status">Opening the Taste Map…</p>;
  const left = comparison ? recipeById.get(comparison.left) : undefined;
  const right = comparison ? recipeById.get(comparison.right) : undefined;

  return <div className="taste-finder">
    <div className="taste-context" data-context={context.kind}>
      <div><span className="house-eyebrow">EXPLORE BY TASTE</span>
        <h2 id="taste-context-title" tabIndex={-1}>{context.kind === 'matches' ? 'Your search, on the map.' : context.kind === 'shelf' ? 'Your shelf, on the map.' : context.kind === 'related' && anchor ? `More like ${anchor.name}.` : context.kind === 'flavour' ? context.flavour === 'tart' ? 'Tart & citrusy.' : 'A little bitter.' : 'A taste for something new.'}</h2>
        <p>{context.kind === 'matches' ? (matchTotal === null ? 'Checking recipe matches…' : `${matchingIds.size} mapped ${matchingIds.size === 1 ? 'classic' : 'classics'} · ${Math.max(0, matchTotal - matchingIds.size)} more recipe matches. All matches are below.`) : context.kind === 'shelf' ? 'Classics you can make, or finish with one more ingredient. Taste positions stay fixed.' : context.kind === 'related' ? 'Your starting drink stays here. Preview a neighbour to see what changes.' : context.kind === 'flavour' ? query.trim() ? `A flavour selection, separate from recipes matching “${query.trim()}”.` : 'Classics selected by flavour. Positions show sweetness and spirit taste.' : `${TASTE_PROFILES.length} illustrated classics. Choose a glass or a name to see its recipe.`}</p>
      </div>
      {context.kind !== 'all' && <button className="text-btn" onClick={() => onContext({ kind: 'all' })}>Explore all classics <ArrowRight size={16} /></button>}
    </div>
    {context.kind === 'related' && anchor && anchorProfile && <div className="taste-anchor"><DrinkDrawing profile={anchorProfile} /><div><span className="house-eyebrow">YOUR STARTING DRINK</span><strong>{anchor.name}</strong><p>{anchorProfile.description}</p></div><button className="text-btn" onClick={event => select(anchor.id, event.currentTarget)}>Preview {anchor.name} <ArrowRight size={16} /></button></div>}
    {shelfOnly && <p className="taste-shelf-key"><span><Check size={14} /> Can make</span><span><Plus size={14} /> One ingredient away</span><small>Assumes ice, water, sugar and salt. Optional ingredients are excluded.</small></p>}
    <div className="taste-workspace">
      <section id="taste-map" data-tour="taste-map" className="taste-map-panel" aria-labelledby="taste-map-heading">
        <div className="taste-map-tools"><h2 id="taste-map-heading" tabIndex={-1}>Taste Map</h2>{pantry.length ? <button className="taste-shelf-filter" aria-pressed={shelfOnly} onClick={() => onContext({ kind: shelfOnly ? 'all' : 'shelf' })}>{shelfOnly && <Check size={15} />}Use my ingredients</button> : <a className="taste-shelf-filter" href="#/bar">Use my ingredients <Plus size={15} /></a>}</div>
        <div className="taste-quick-flavours" role="group" aria-label="Map flavour filters"><span>Flavour</span><button aria-pressed={word === 'tart' || (context.kind === 'flavour' && context.flavour === 'tart')} onClick={() => { if (context.kind === 'flavour') onContext(context.flavour === 'tart' ? { kind: 'all' } : { kind: 'flavour', flavour: 'tart' }); else { setPath(''); setWord(word === 'tart' ? '' : 'tart'); } }}>Tart &amp; citrusy</button><button aria-pressed={word === 'bitter' || (context.kind === 'flavour' && context.flavour === 'bitter')} onClick={() => { if (context.kind === 'flavour') onContext(context.flavour === 'bitter' ? { kind: 'all' } : { kind: 'flavour', flavour: 'bitter' }); else { setPath(''); setWord(word === 'bitter' ? '' : 'bitter'); } }}>Bitter</button>{(path || word) && <button onClick={() => { setPath(''); setWord(''); }}>Clear</button>}</div>
        {filtered.length ? <div className="taste-map-canvas">
          <span className="taste-axis taste-axis-top"><ArrowRight size={15} />Stronger spirit taste</span>
          <div className="taste-plot" role="group" aria-label="Choose a cocktail on the Taste Map">
            <svg className="taste-graph" viewBox="0 0 100 100" preserveAspectRatio="none" fill="none" aria-hidden="true">
              <path className="taste-graph-grid" d="M25 0V100M75 0V100M0 25H100M0 75H100" />
              <path className="taste-graph-axes" d="M2 50H98M50 2V98" />
              <path className="taste-graph-arrows" d="M4 48L2 50L4 52M96 48L98 50L96 52M48 4L50 2L52 4M48 96L50 98L52 96" />
              <circle cx="50" cy="50" r=".7" className="taste-graph-origin" />
            </svg>
            {selectedProfile && visible.some(profile => profile.id === selectedProfile.id) && <>
              <span className="taste-projection taste-projection-vertical" aria-hidden="true" style={{ left: `clamp(var(--taste-node-half), ${selectedProfile.x}%, calc(100% - var(--taste-node-half)))`, top: `${Math.min(50, selectedProfile.y)}%`, height: `${Math.abs(50 - selectedProfile.y)}%` }} />
              <span className="taste-projection taste-projection-horizontal" aria-hidden="true" style={{ top: `${selectedProfile.y}%`, left: selectedProfile.x >= 50 ? '50%' : `clamp(var(--taste-node-half), ${selectedProfile.x}%, calc(100% - var(--taste-node-half)))`, width: selectedProfile.x >= 50 ? `calc(clamp(var(--taste-node-half), ${selectedProfile.x}%, calc(100% - var(--taste-node-half))) - 50%)` : `calc(50% - clamp(var(--taste-node-half), ${selectedProfile.x}%, calc(100% - var(--taste-node-half))))` }} />
            </>}
            {visible.map(profile => {
              const recipe = recipeById.get(profile.id)!;
              const state = shelfAvailability(recipe, pantryNames);
              return <button className={`taste-node ${selectedId === profile.id ? 'selected' : ''}`} key={profile.id} style={{ ['--taste-x' as string]: `${profile.x}%`, ['--taste-y' as string]: `${profile.y}%` }} onClick={event => select(profile.id, event.currentTarget)} aria-pressed={selectedId === profile.id} aria-label={`Preview ${recipe.name}${pantry.length ? `, ${state.available ? 'all ingredients available' : `${state.missing.length} ingredients needed`}` : ''}`}>
                <DrinkDrawing profile={profile} /><span className="taste-node-name">{recipe.name}</span>{pantry.length > 0 && <span className={`taste-availability ${state.available ? 'available' : ''}`}>{state.available ? <><Check size={12} /> Can make</> : state.missing.length === 1 ? '1 ingredient away' : `${state.missing.length} needed`}</span>}
              </button>;
            })}
          </div>
          <div className="taste-sweetness"><span><ArrowLeft size={14} />Less sweet</span><span>Sweeter<ArrowRight size={14} /></span></div><span className="taste-axis taste-axis-bottom"><ArrowRight size={15} />Gentler spirit taste</span>
        </div> : <div className="taste-empty" role="status"><h3>{context.kind === 'matches' && matchTotal === 0 ? 'No recipes match this search.' : context.kind === 'matches' && !matchingIds.size ? 'These recipes aren’t on the Taste Map yet.' : shelfOnly ? 'No mapped classics fit your shelf yet.' : 'No mapped classics match.'}</h3><p>{context.kind === 'matches' ? matchTotal === 0 ? 'Try another drink name or ingredient. Your search covers the full recipe library.' : 'Your full recipe matches are directly below. The map only includes reviewed classics.' : shelfOnly ? 'Add an ingredient on Shelf, or explore all classics. The full Shelf results are still available there.' : 'Try another flavour, or clear the map filters.'}</p><button className="text-btn" onClick={onList}>Search all drinks <ArrowRight size={16} /></button>{(path || word) && <button className="text-btn" onClick={() => { setPath(''); setWord(''); }}>Clear map filters</button>}</div>}
        <div className="taste-pagination"><span aria-live="polite">{filtered.length ? `${visible.length} of ${filtered.length} classics · ${currentPage + 1}/${pageCount}` : '0 classics'}</span><div><button className="house-icon-button" disabled={!currentPage} onClick={() => setPage(value => Math.max(0, value - 1))} aria-label="Previous drinks"><ArrowLeft size={18} /></button><button className="text-btn" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next drinks <ArrowRight size={16} /></button></div></div>
        {visible.length > 0 && <div className="taste-matching-list" role="group" aria-label="Choose from mapped drinks"><h3>On this map page <span>{visible.length} of {filtered.length}</span></h3><ul>{visible.map(profile => {
          const recipe = recipeById.get(profile.id)!;
          const state = shelfAvailability(recipe, pantryNames);
          const note = context.kind === 'related' && anchor && recipe.id !== anchor.id ? TASTE_CONNECTIONS[anchor.id]?.[recipe.id] : profile.description;
          return <li key={recipe.id}><button aria-pressed={selectedId === recipe.id} onClick={event => select(recipe.id, event.currentTarget)}><span><strong>{recipe.name}</strong><small>{note}</small>{pantry.length > 0 && <small className={state.available ? 'available' : ''}>{state.available ? 'Can make' : state.missing.length === 1 ? `Need ${state.missing[0].toLowerCase()}` : `${state.missing.length} ingredients needed`}</small>}</span>{selectedId === recipe.id ? <Check size={16} /> : <ArrowRight size={16} />}</button></li>;
        })}</ul></div>}
        <details className="taste-guide"><summary>How to read the map</summary><p>Positions are an approximate, recipe-based flavour guide, not measured scores. Up means a more noticeable spirit taste; right means sweeter. Spirit taste is different from alcohol percentage. Individual recipes, brands and dilution change the result. Tartness is a separate editorial flavour filter, not an axis.</p><p>These {TASTE_PROFILES.length} classics have editorial positions. Search drinks covers the whole catalogue. Shelf matching uses the app’s ingredient matches and assumes basics such as ice, water, sugar and salt; optional ingredients are not required.</p></details>
        <button className="text-btn taste-all-recipes" onClick={onList}>{query.trim() || context.kind === 'matches' ? `See all ${matchTotal ?? ''} recipe matches` : `Browse all ${recipes.length} recipes`} <ArrowRight size={16} /></button>
      </section>
      {selected && selectedProfile ? <article className="taste-preview" ref={previewRef} aria-labelledby="taste-preview-name" data-recipe-id={selected.id}>
        <div className="taste-preview-top"><span className="house-eyebrow">DRINK PREVIEW</span><button type="button" className="house-icon-button" onClick={closePreview} aria-label="Close drink preview"><X size={18} /></button></div>
        <div className="taste-preview-heading"><div><h2 ref={previewHeading} id="taste-preview-name" tabIndex={-1}>{selected.name}</h2><p>{selectedProfile.description}</p></div><DrinkDrawing profile={selectedProfile} /></div>
        {!filtered.some(profile => profile.id === selected.id) && <p className="taste-selection-note">This selected drink is outside your current map filters.</p>}
        {context.kind === 'related' && anchor && selected.id !== anchor.id && <p className="taste-comparison-note"><strong>Compared with {anchor.name}</strong>{TASTE_CONNECTIONS[anchor.id]?.[selected.id] || 'Outside this illustrated collection. Choose a neighbour below to compare.'}</p>}
        <h3>Ingredients</h3><dl className="taste-ingredients">{selected.ingredients.map((ingredient, index) => <div key={`${ingredient.name}-${index}`}><dt>{ingredient.name}{ingredient.optional && <small>optional</small>}</dt><dd>{formatMeasure(ingredient.measure) || 'To taste'}</dd></div>)}</dl>
        <p className="taste-shelf-note">{availability(selected)}</p>
        <div className="taste-preview-actions"><button className="btn btn-solid" onClick={event => {
          if (!previewRef.current) return;
          onExpand({ recipe: selected, vibe: vibes.find(vibe => vibe.id === selected.vibe) || { id: selected.vibe, label: 'Cocktail', color: selectedProfile.colour }, instanceId: instance, element: previewRef.current, trigger: event.currentTarget, flipped: false, cardScrollTop: 0, returnLabel: 'Back to drink preview' });
        }}>View recipe <ArrowRight size={16} /></button><button className="text-btn" onClick={() => onSave(selected)} aria-pressed={saved.has(selected.id)}>{saved.has(selected.id) ? <Check size={16} /> : <Plus size={16} />}{saved.has(selected.id) ? 'Saved to Your Tab' : 'Save to Your Tab'}</button><button className="text-btn" onClick={() => onContext({ kind: 'related', anchorId: selected.id })}>More like this <ArrowRight size={16} /></button><button ref={comparisonTrigger} className="text-btn" onClick={beginComparison}>Compare with another drink</button></div>
      </article> : <aside className="taste-preview taste-preview-placeholder"><GlassDrawing kind="coupe" /><h2>Choose a drink</h2><p>See what’s in it<br />and how to make it.</p></aside>}
    </div>

    {left && right && <section className="taste-comparison" ref={comparisonRef} aria-labelledby="taste-compare-title"><div className="taste-section-heading"><div><span className="house-eyebrow">SIDE BY SIDE</span><h2 id="taste-compare-title" tabIndex={-1}>A small change. A different drink.</h2></div><button className="house-icon-button" onClick={() => { setComparison(null); requestAnimationFrame(() => comparisonTrigger.current?.focus()); }} aria-label="Close comparison"><X size={20} /></button></div><label className="taste-compare-select">Compare {left.name} with<select value={right.id} onChange={event => setComparison({ left: left.id, right: event.target.value })}>{TASTE_PROFILES.filter(profile => profile.id !== left.id && recipeById.has(profile.id)).map(profile => <option key={profile.id} value={profile.id}>{recipeById.get(profile.id)!.name}</option>)}</select></label>
      <div className="taste-compare-table-wrap"><table className="taste-compare-table"><caption>Recipe quantities as listed. Shared ingredient names appear together; highlighted rows show ingredients found in only one drink. Metric equivalents use 30 ml per oz.</caption><thead><tr><th scope="col">Ingredient</th><th scope="col">{left.name}</th><th scope="col">{right.name}</th></tr></thead><tbody>{ingredientDifferences(left, right).map(row => <tr key={row.key} className={`difference-${row.status}`}><th scope="row">{row.name}<small>{row.status === 'shared' ? row.differentMeasure ? 'Different measures' : 'Shared ingredient' : row.status === 'left' ? `Only in ${left.name}` : `Only in ${right.name}`}</small></th><td>{row.left ? formatMeasure(row.left.measure) || 'To taste' : '—'}{row.left?.optional && <small>optional</small>}</td><td>{row.right ? formatMeasure(row.right.measure) || 'To taste' : '—'}{row.right?.optional && <small>optional</small>}</td></tr>)}</tbody></table></div>
    </section>}

    {context.kind !== 'matches' && <details className="taste-paths"><summary><span>Not sure what you like?</span><span>Start with a flavour <Plus size={17} /></span></summary><div className="taste-path-body"><p>Choose a broad flavour, then narrow it down. Your choices filter the map.</p><div className="taste-path-buttons">{FLAVOUR_PATHS.map(item => <button key={item.id} aria-pressed={path === item.id} onClick={() => { setPath(path === item.id ? '' : item.id); setWord(''); }}>{item.label}</button>)}</div>{flavourPath && <div className="taste-specific-words" aria-label="More specific flavours">{flavourPath.words.map(item => <button key={item} aria-pressed={word === item} onClick={() => setWord(word === item ? '' : item)}>{item}</button>)}</div>}{(path || word) && <button className="text-btn" onClick={() => { setPath(''); setWord(''); }}>Clear flavour choices</button>}<a className="text-btn" href="#taste-map" onClick={event => { event.preventDefault(); const heading = document.getElementById('taste-map-heading'); heading?.scrollIntoView({ block: 'start' }); heading?.focus({ preventScroll: true }); }}>See matching drinks <ArrowRight size={16} /></a></div></details>}

    {(context.kind === 'related' || (context.kind === 'all' && !query.trim())) && <section className="taste-neighbours" aria-labelledby="taste-neighbours-title"><div className="taste-section-heading"><div><span className="house-eyebrow">SOMETHING FAMILIAR</span><h2 id="taste-neighbours-title">{anchor ? `If you like ${anchor.name}…` : 'Start with a favourite.'}</h2><p>{anchor ? 'Three directions from the same starting drink. Choose one to preview.' : 'Choose one you know. We’ll show you a few nearby.'}</p></div></div><div className="taste-collection">{(anchorProfile ? anchorProfile.neighbours : ['11003', '11006', '17212']).map(id => {
      const recipe = recipeById.get(id), profile = profileById.get(id);
      if (!recipe || !profile) return null;
      return <button key={id} aria-pressed={selectedId === id} onClick={event => { if (context.kind !== 'related') onContext({ kind: 'related', anchorId: anchor?.id || id }); select(id, event.currentTarget); }}><DrinkDrawing profile={profile} /><span><strong>{recipe.name}</strong><small>{anchor ? TASTE_CONNECTIONS[anchor.id]?.[id] : profile.description}</small></span><ArrowRight size={18} /></button>;
    })}</div></section>}
  </div>;
}

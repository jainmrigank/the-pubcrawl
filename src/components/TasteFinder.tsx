import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { Recipe, Vibe } from '../types';
import type { RecipeFocusOrigin } from '../recipeFocusTypes';
import { loadLocalCatalogue } from '../localData';
import { FLAVOUR_PATHS, ingredientDifferences, TASTE_PROFILES } from '../tasteProfiles';
import type { TasteProfile } from '../tasteProfiles';
import { ArrowLeft, ArrowRight, Check, Plus, X } from '../icons';
import { formatMeasure } from '../measure';
import { GlassDrawing } from './landing/GlassDrawing';

interface Props {
  active: boolean;
  saved: Set<string>;
  onSave: (recipe: Recipe) => void;
  onExpand: (origin: RecipeFocusOrigin) => void;
  onList: () => void;
}

function DrinkDrawing({ profile }: { profile: TasteProfile }) {
  return <span className="taste-drink-art" style={{ ['--accent' as string]: profile.colour }}><GlassDrawing kind={profile.kind} garnish={profile.garnish} cream={profile.id === '12528'} /></span>;
}

export function TasteFinder({ active, saved, onSave, onExpand, onList }: Props) {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [vibes, setVibes] = useState<Vibe[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!active || recipes.length) return;
    let live = true;
    setFailed(false);
    loadLocalCatalogue().then(data => {
      if (live) { setRecipes(data.recipes); setVibes(data.vibes); }
    }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [active, recipes.length, attempt]);

  const recipeById = useMemo(() => new Map(recipes.map(recipe => [recipe.id, recipe])), [recipes]);
  const profileById = useMemo(() => new Map(TASTE_PROFILES.map(profile => [profile.id, profile])), []);
  const selected = selectedId ? recipeById.get(selectedId) : undefined;
  const selectedProfile = selectedId ? profileById.get(selectedId) : undefined;
  const flavourPath = FLAVOUR_PATHS.find(item => item.id === path);
  const filtered = useMemo(() => TASTE_PROFILES.filter(profile => {
    const recipe = recipeById.get(profile.id);
    if (!recipe) return false;
    if (word && !profile.flavours.includes(word)) return false;
    if (!word && flavourPath && !flavourPath.words.some(flavour => profile.flavours.includes(flavour))) return false;
    return true;
  }), [recipeById, flavourPath, word]);
  // Keep the authored groups rather than packing filtered points together.
  // Their labels retain their spacing on small screens without moving taste positions.
  const groups = useMemo(() => {
    const ids = new Set(filtered.map(profile => profile.id));
    return Array.from({ length: Math.ceil(TASTE_PROFILES.length / 4) }, (_, i) => TASTE_PROFILES.slice(i * 4, i * 4 + 4).filter(profile => ids.has(profile.id))).filter(group => group.length);
  }, [filtered]);
  const pageCount = Math.max(1, groups.length);
  const currentPage = Math.min(page, pageCount - 1);
  const visible = groups[currentPage] || [];
  useEffect(() => { setPage(0); }, [path, word]);

  useEffect(() => {
    if (!active || !selected || !needFocus.current) return;
    needFocus.current = false;
    const frame = requestAnimationFrame(() => {
      previewHeading.current?.focus({ preventScroll: true });
      previewRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' as ScrollBehavior });
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
      previewRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' as ScrollBehavior });
    }
    setSelectedId(id);
  };
  const changeFlavour = (id: string) => { setPath(id); setWord(''); setPage(0); };
  const closePreview = () => {
    setSelectedId(null);
    requestAnimationFrame(() => {
      const trigger = chooser.current;
      if (trigger?.isConnected) trigger.focus();
      else document.querySelector<HTMLElement>('#taste-map button')?.focus();
    });
  };
  const beginComparison = () => {
    if (!selected) return;
    const other = selectedProfile?.neighbours.find(id => recipeById.has(id)) || TASTE_PROFILES.find(profile => profile.id !== selected.id)?.id;
    if (!other) return;
    setComparison({ left: selected.id, right: other });
    requestAnimationFrame(() => { comparisonRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior }); comparisonRef.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true }); });
  };

  if (failed) return <div className="taste-empty" role="status"><h2>The map couldn’t load.</h2><button className="btn" onClick={() => setAttempt(value => value + 1)}>Try again</button><button className="text-btn" onClick={onList}>Browse drinks</button></div>;
  if (!recipes.length) return <p className="taste-loading" role="status">Loading map…</p>;
  const left = comparison ? recipeById.get(comparison.left) : undefined;
  const right = comparison ? recipeById.get(comparison.right) : undefined;

  return <div className="taste-finder">
    <div className="taste-workspace">
      <section id="taste-map" data-tour="taste-map" className="taste-map-panel" aria-labelledby="taste-map-heading">
        <h2 id="taste-map-heading" className="sr-only" tabIndex={-1}>Taste Map</h2>
        <div className="taste-filters" data-tour="taste-flavours">
          <span className="house-eyebrow">FLAVOUR</span>
          <div className="taste-path-buttons" role="group" aria-label="Flavour">
            <button aria-pressed={!path} onClick={() => changeFlavour('')}>All flavours</button>
            {FLAVOUR_PATHS.map(item => <button key={item.id} aria-pressed={path === item.id} onClick={() => changeFlavour(path === item.id ? '' : item.id)}>{item.label}</button>)}
          </div>
          {flavourPath && <div className="taste-specific-words" role="group" aria-label="More specific flavours"><span>Narrow it down</span>{flavourPath.words.map(item => <button key={item} aria-pressed={word === item} onClick={() => { setWord(word === item ? '' : item); setPage(0); }}>{item}</button>)}<button className="taste-clear" onClick={() => changeFlavour('')}>Clear</button></div>}
        </div>
        <nav className="taste-pagination" aria-label="Map pages">
          <div className="taste-page-summary" aria-live="polite" aria-atomic="true"><strong>{filtered.length ? `${visible.length} of ${filtered.length} classics` : '0 classics'}</strong><span>Page {currentPage + 1} / {pageCount}</span></div>
          <div className="taste-page-actions"><button disabled={!currentPage} onClick={() => setPage(value => Math.max(0, value - 1))} aria-label="Previous drinks"><ArrowLeft size={20} /><span>Previous</span></button><button disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)} aria-label="Next drinks"><span>Next</span><ArrowRight size={20} /></button></div>
        </nav>
        {filtered.length ? <div className="taste-map-canvas" data-motion={reduced ? 'reduced' : 'animated'}>
          <span className="taste-axis taste-axis-top"><ArrowRight size={15} />Stronger spirit taste</span>
          <div className="taste-plot" role="group" aria-label="Choose a cocktail on the Taste Map">
            <svg className="taste-graph" viewBox="0 0 100 100" preserveAspectRatio="none" fill="none" aria-hidden="true">
              <path className="taste-graph-grid" d="M25 0V100M75 0V100M0 25H100M0 75H100" />
              <path className="taste-graph-axes taste-graph-axes-x" d="M2 50H98" />
              <path className="taste-graph-axes taste-graph-axes-y" d="M50 2V98" />
              <path className="taste-graph-arrows" d="M4 48L2 50L4 52M96 48L98 50L96 52M48 4L50 2L52 4M48 96L50 98L52 96" />
            </svg>
            <span className="taste-origin" aria-hidden="true" />
            {selectedProfile && visible.some(profile => profile.id === selectedProfile.id) && <>
              <span className="taste-projection taste-projection-vertical" aria-hidden="true" style={{ left: `clamp(var(--taste-node-half), ${selectedProfile.x}%, calc(100% - var(--taste-node-half)))`, top: `${Math.min(50, selectedProfile.y)}%`, height: `${Math.abs(50 - selectedProfile.y)}%` }} />
              <span className="taste-projection taste-projection-horizontal" aria-hidden="true" style={{ top: `${selectedProfile.y}%`, left: selectedProfile.x >= 50 ? '50%' : `clamp(var(--taste-node-half), ${selectedProfile.x}%, calc(100% - var(--taste-node-half)))`, width: selectedProfile.x >= 50 ? `calc(clamp(var(--taste-node-half), ${selectedProfile.x}%, calc(100% - var(--taste-node-half))) - 50%)` : `calc(50% - clamp(var(--taste-node-half), ${selectedProfile.x}%, calc(100% - var(--taste-node-half))))` }} />
            </>}
            <motion.div className="taste-page-points" key={visible.map(profile => profile.id).join('-')} initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .22, ease: 'easeOut' }}>
            {visible.map(profile => {
              const recipe = recipeById.get(profile.id)!;
              return <button className={`taste-node ${selectedId === profile.id ? 'selected' : ''}`} key={profile.id} style={{ ['--taste-x' as string]: `${profile.x}%`, ['--taste-y' as string]: `${profile.y}%` }} onClick={event => select(profile.id, event.currentTarget)} aria-pressed={selectedId === profile.id} aria-label={`Preview ${recipe.name}`}>
                <DrinkDrawing profile={profile} /><span className="taste-node-name">{recipe.name}</span>
              </button>;
            })}
            </motion.div>
          </div>
          <div className="taste-sweetness"><span><ArrowLeft size={14} />Less sweet</span><span>Sweeter<ArrowRight size={14} /></span></div><span className="taste-axis taste-axis-bottom"><ArrowRight size={15} />Gentler spirit taste</span>
        </div> : <div className="taste-empty" role="status"><h3>No matching classics.</h3><p>Try another flavour.</p><button className="text-btn" onClick={onList}>Browse all drinks <ArrowRight size={16} /></button>{(path || word) && <button className="text-btn" onClick={() => { setPath(''); setWord(''); }}>Clear filters</button>}</div>}
        <button className="text-btn taste-all-recipes" onClick={onList}>{`Browse all ${recipes.length} recipes`} <ArrowRight size={16} /></button>
      </section>
      {selected && selectedProfile && <motion.article className="taste-preview" ref={previewRef} key={selected.id} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .22 }} aria-labelledby="taste-preview-name" data-recipe-id={selected.id}>
        <div className="taste-preview-top"><span className="house-eyebrow">DRINK PREVIEW</span><button type="button" className="house-icon-button" onClick={closePreview} aria-label="Close drink preview"><X size={18} /></button></div>
        <div className="taste-preview-layout"><div className="taste-preview-heading"><div><h2 ref={previewHeading} id="taste-preview-name" tabIndex={-1}>{selected.name}</h2><p>{selectedProfile.description}</p>{!filtered.some(profile => profile.id === selected.id) && <p className="taste-selection-note">Outside your current filters.</p>}</div><DrinkDrawing profile={selectedProfile} /></div>
        <section className="taste-preview-ingredients" aria-label="Ingredients"><h3>Ingredients</h3><dl className="taste-ingredients">{selected.ingredients.map((ingredient, index) => <div key={`${ingredient.name}-${index}`}><dt>{ingredient.name}{ingredient.optional && <small>optional</small>}</dt><dd>{formatMeasure(ingredient.measure) || 'To taste'}</dd></div>)}</dl></section>
        <div className="taste-preview-actions"><button className="btn btn-solid" onClick={event => {
          if (!previewRef.current) return;
          onExpand({ recipe: selected, vibe: vibes.find(vibe => vibe.id === selected.vibe) || { id: selected.vibe, label: 'Cocktail', color: selectedProfile.colour }, instanceId: instance, element: previewRef.current, trigger: event.currentTarget, flipped: false, cardScrollTop: 0, returnLabel: 'Back to drink preview' });
        }}>View recipe <ArrowRight size={16} /></button><button className="text-btn" onClick={() => onSave(selected)} aria-pressed={saved.has(selected.id)}>{saved.has(selected.id) ? <Check size={16} /> : <Plus size={16} />}{saved.has(selected.id) ? 'Saved to Your Tab' : 'Save to Your Tab'}</button><button ref={comparisonTrigger} className="text-btn" onClick={beginComparison} aria-label="Compare with another drink">Compare drinks</button></div></div>
      </motion.article>}
    </div>

    {left && right && <section className="taste-comparison" ref={comparisonRef} aria-labelledby="taste-compare-title"><div className="taste-section-heading"><div><span className="house-eyebrow">SIDE BY SIDE</span><h2 id="taste-compare-title" tabIndex={-1}>Side by side.</h2></div><button className="house-icon-button" onClick={() => { setComparison(null); requestAnimationFrame(() => comparisonTrigger.current?.focus()); }} aria-label="Close comparison"><X size={20} /></button></div><label className="taste-compare-select">Compare {left.name} with<select value={right.id} onChange={event => setComparison({ left: left.id, right: event.target.value })}>{TASTE_PROFILES.filter(profile => profile.id !== left.id && recipeById.has(profile.id)).map(profile => <option key={profile.id} value={profile.id}>{recipeById.get(profile.id)!.name}</option>)}</select></label>
      <div className="taste-compare-table-wrap"><table className="taste-compare-table"><caption>Shared ingredients align. Shaded rows are unique to one drink. Metric: 30 ml per oz.</caption><thead><tr><th scope="col">Ingredient</th><th scope="col">{left.name}</th><th scope="col">{right.name}</th></tr></thead><tbody>{ingredientDifferences(left, right).map(row => <tr key={row.key} className={`difference-${row.status}`}><th scope="row">{row.name}<small>{row.status === 'shared' ? row.differentMeasure ? 'Different measures' : 'Shared ingredient' : row.status === 'left' ? `Only in ${left.name}` : `Only in ${right.name}`}</small></th><td>{row.left ? formatMeasure(row.left.measure) || 'To taste' : '—'}{row.left?.optional && <small>optional</small>}</td><td>{row.right ? formatMeasure(row.right.measure) || 'To taste' : '—'}{row.right?.optional && <small>optional</small>}</td></tr>)}</tbody></table></div>
    </section>}

    <section className="taste-neighbours" aria-labelledby="taste-neighbours-title"><div className="taste-section-heading"><div><span className="house-eyebrow">SOMETHING FAMILIAR</span><h2 id="taste-neighbours-title">{selected ? `If you like ${selected.name}…` : 'Start with a favourite.'}</h2><p>{selected ? 'Try a related recipe.' : 'Choose a drink you know.'}</p></div></div><div className="taste-collection">{(selectedProfile ? selectedProfile.neighbours : ['11003', '11006', '17212']).map(id => {
      const recipe = recipeById.get(id), profile = profileById.get(id);
      if (!recipe || !profile) return null;
      return <button key={id} aria-pressed={selectedId === id} onClick={event => select(id, event.currentTarget)}><DrinkDrawing profile={profile} /><span><strong>{recipe.name}</strong><small>{profile.description}</small></span><ArrowRight size={18} /></button>;
    })}</div></section>
  </div>;
}

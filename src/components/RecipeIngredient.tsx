import { IngredientShelfContext } from './IngredientShelfContext';
import { useContext, useId, useState } from 'react';
import { alternativeAllowed, ingredientGuide, ingredientGuidance } from '../../shared/ingredient-guide';
import type { Recipe, RecipeIngredient as Ingredient } from '../types';
import { formatMeasure } from '../measure';
import './ingredient-guide.css';

/** One compact ingredient row, shared by cards, the reader and drink previews. */
export function RecipeIngredientRow({ ingredient, recipe, as = 'li', locked = false }: {
  ingredient: Ingredient; recipe: Pick<Recipe, 'id' | 'instructions'>;
  as?: 'li' | 'div'; locked?: boolean;
}) {
  const guide = ingredientGuide(ingredient.name);
  // Old Tab entries and externally supplied recipes get the same master data.
  const guidance = ingredient.guidance ?? ingredientGuidance(ingredient.name, recipe);
  const shelf = useContext(IngredientShelfContext);
  const [open, setOpen] = useState(false);
  const [prepOpen, setPrepOpen] = useState(false);
  const id = useId();
  const Tag = as;
  const Name = as === 'div' ? 'dt' : 'span';
  const Measure = as === 'div' ? 'dd' : 'span';
  const Detail = as === 'div' ? 'dd' : 'div';
  const alternative = ingredient.alternative;
  const allowed = guide ? alternativeAllowed(recipe, guide) : false;
  const made = Boolean(guide?.finished && shelf?.shelf.some(item => item.name.toLowerCase() === guide.finished!.toLowerCase()));
  const explanationOnly = guide?.kind === 'explanation_first' || guide?.kind === 'recipe_incomplete';
  const description = guidance && !ingredient.name.toLowerCase().includes(guidance.description.toLowerCase()) ? guidance.description : '';
  return <Tag className={`ingredient-row${ingredient.have === false ? ' is-missing need' : ''}`} data-card-control>
    <Name className="ingredient-row-name">
      {guide ? <button type="button" className="ingredient-guide-trigger" aria-label={`Alternatives for ${ingredient.name}`} aria-expanded={open} aria-controls={id} disabled={locked} onClick={event => { event.stopPropagation(); setOpen(value => !value); }}>
        <span>{ingredient.name}{description && <span className="ingredient-description"> / {description}</span>}</span>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" className={open ? 'is-open' : ''}><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button> : <span>{ingredient.name}</span>}
      {(ingredient.have === false || ingredient.optional) && <small className="ingredient-row-state">{ingredient.have === false ? 'Need' : ''}{ingredient.have === false && ingredient.optional ? ' · ' : ''}{ingredient.optional ? 'Optional' : ''}</small>}
      {alternative && <small className="ingredient-row-alternative">{alternative.kind === 'prepare' ? 'Prep first' : alternative.kind === 'prepared' && guide?.kind === 'home_variation' ? 'Home version' : 'Using'}: {alternative.label}</small>}
    </Name>
    <Measure className="ingredient-row-measure">{formatMeasure(ingredient.measure) || 'As needed'}</Measure>
    {guide && <Detail id={id} className="ingredient-guide-details" hidden={!open}>
      <p className="ingredient-guide-title">{guide.kind === 'explanation_first' || guide.kind === 'recipe_incomplete' ? 'What it is' : guide.kind === 'home_variation' || guide.kind === 'split_recipe_specific' ? 'Home variation' : 'Alternative'}</p>
      {allowed || explanationOnly ? <p>{guidance?.alternatives.length ? guidance.alternatives.join(' / ') : guide.suggestion}</p> : <p>{guide.description}. {guide.id === 'IC26' && recipe.id === '178335' ? 'This recipe needs tequila-based coconut liqueur.' : guide.id === 'IC02' && recipe.id === '15813' ? 'This recipe specifies Hot Damn 100 (50% ABV). Add that specific bottle to Shelf.' : 'Keep the original ingredient here; the recipe depends on its strength, style or layering.'}</p>}
      {(allowed || explanationOnly) && <p className="ingredient-guide-note">{guide.difference}</p>}
      {allowed && guide.steps.length > 0 && <div className="ingredient-preparation">
        <button type="button" className="ingredient-preparation-toggle" aria-expanded={prepOpen} aria-controls={`${id}-prep`} disabled={locked} onClick={event => { event.stopPropagation(); setPrepOpen(value => !value); }}>
          <span>Before you mix</span>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" className={prepOpen ? 'is-open' : ''}><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div id={`${id}-prep`} className="ingredient-preparation-content" hidden={!prepOpen}>
          <small>{guide.timing}</small>
          <ol>{guide.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
        </div>
      </div>}
      {guide.finished && shelf && allowed && <button type="button" className="ingredient-guide-add" disabled={locked || made} onClick={event => { event.stopPropagation(); shelf.onAdd({ name: guide.finished!, category: 'Prepared ingredient', image: '' }); }}>
        {made ? 'On Shelf' : 'Already made? Add to Shelf'}
      </button>}
      {guide.finished && !shelf && <p className="ingredient-guide-note">Once made, add “{guide.finished}” to Shelf.</p>}
      <a href={guide.sources.at(-1)} target="_blank" rel="noopener noreferrer" tabIndex={locked ? -1 : 0} aria-disabled={locked || undefined} onClick={event => { event.stopPropagation(); if (locked) event.preventDefault(); }}>Ingredient guide ↗</a>
    </Detail>}
  </Tag>;
}

export function RecipeAvailability({ recipe }: { recipe: Recipe }) {
  const alternatives = recipe.ingredients.filter(item => item.alternative);
  if (!alternatives.length) return null;
  return <p className="recipe-availability">{alternatives.some(item => item.alternative?.kind === 'prepare') ? 'Prep first' : 'With alternatives'}<span>See ingredients</span></p>;
}

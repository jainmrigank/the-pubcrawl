import { useState } from 'react';
import { buildPartyPlan, measure, partyRecipes } from '../../shared/party-plan.mjs';
import { trackProductEvent } from '../analytics';
import type { Ingredient } from '../types';

function servings(value: string, fallback: number) {
  const parsed = value === '' ? fallback : Number(value);
  return Math.max(1, Math.min(60, Math.round(Number.isFinite(parsed) ? parsed : fallback)));
}

export default function PartyPlanner({ pantry, saved }: { pantry: Ingredient[]; saved: Set<string> }) {
  const [guestCount, setGuests] = useState('6');
  const [picked, setPicked] = useState(() => new Set(partyRecipes.filter(recipe => saved.has(recipe.id)).map(recipe => recipe.id)));
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [skipShelf, setSkipShelf] = useState(false);
  const guests = servings(guestCount, 6);
  const selections = partyRecipes.filter(recipe => picked.has(recipe.id)).map(recipe => ({
    recipe, servings: servings(custom[recipe.id] || '', guests),
  }));
  const plan = buildPartyPlan(selections, pantry.map(ingredient => ingredient.name));
  const need = plan.rows.filter(row => !skipShelf || !row.onShelf);
  const extras = plan.extras.filter(row => !skipShelf || !row.onShelf);
  const toggle = (id: string) => setPicked(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  function exportPlan() {
    const shopping = need.map(row => '- ' + row.name + ' · ' + measure(row.prepare + row.serve, row.unit));
    const lines = ["THE PUBCRAWL · PARTY PLAN", guests + ' guests', '', 'SHOPPING', ...shopping, ...extras.map(extra => '- ' + extra.name),
      '', 'PREP AND SERVE', ...selections.flatMap(({ recipe, servings: count }) => [
        '', recipe.name + ' · ' + count + ' glasses', ...recipe.items.map(([name, amount, unit, stage]) =>
          '- ' + name + ' · ' + measure(amount * count, unit) + (stage === 'serve' ? ' at service' : '')),
        'Prep: ' + recipe.prep, 'Serve: ' + recipe.serve,
      ]), '', 'Get a free hosting menu: https://thepubcrawl.in/hosting-sample/'];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain; charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pubcrawl-party-plan.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    trackProductEvent('party_export');
  }

  return <div className="party-plan-content">
    <p className="party-plan-intro">Choose drinks and set the number of glasses. Combine ingredients into one shopping list.</p>
    <label className="party-plan-count">Guests
      <input value={guestCount} min={1} max={60} type="number" inputMode="numeric" onChange={event => setGuests(event.currentTarget.value)} onBlur={() => setGuests(String(guests))} />
    </label>
    <fieldset>
      <legend>Batchable drinks</legend>
      {partyRecipes.map(recipe => (
        <div className="party-plan-option" key={recipe.id}>
          <label><input type="checkbox" checked={picked.has(recipe.id)} onChange={() => toggle(recipe.id)} />{recipe.name}</label>
          {picked.has(recipe.id) && <label>Glasses
            <input type="number" min={1} max={60} value={custom[recipe.id] ?? guests} inputMode="numeric"
              aria-label={'Glasses of ' + recipe.name}
              onChange={event => setCustom({ ...custom, [recipe.id]: event.currentTarget.value })}
              onBlur={() => setCustom(current => {
                const next = { ...current };
                if (next[recipe.id]) next[recipe.id] = String(servings(next[recipe.id], guests));
                else delete next[recipe.id];
                return next;
              })} />
          </label>}
        </div>
      ))}
    </fieldset>
    {selections.length > 0 && <>
      <div className="party-plan-shopping">
        <h3>Shopping list</h3>
        {(plan.rows.some(row => row.onShelf) || plan.extras.some(row => row.onShelf)) && <label className="party-plan-check">
          <input type="checkbox" checked={skipShelf} onChange={event => setSkipShelf(event.currentTarget.checked)} />
          Leave out ingredients on my Shelf
        </label>}
        <ul>{need.map(row => <li key={row.name + row.unit}>
          <span>{row.name}{row.onShelf && <small>On Shelf · check quantity</small>}</span>
          <span>{measure(row.prepare + row.serve, row.unit)}{row.serve > 0 && <small>{measure(row.serve, row.unit)} at service</small>}</span>
        </li>)}</ul>
        {extras.length > 0 && <p>Season or finish to taste with {extras.map(extra => extra.name).join(', ').toLowerCase()}.</p>}
      </div>
      <div className="party-plan-shopping">
        <h3>Prep notes</h3>
        {selections.map(({ recipe }) => <div key={recipe.id}>
          <h4>{recipe.name}</h4><p>{recipe.prep} {recipe.serve}</p>
        </div>)}
      </div>
      <button type="button" className="btn btn-solid" onClick={exportPlan}>Download shopping and prep list</button>
    </>}
    <a className="party-plan-sample" href="/hosting-sample/">Open a free printable menu</a>
  </div>;
}

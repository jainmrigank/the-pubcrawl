import { Fragment } from 'react';
import { CalorieComparison } from './CalorieComparison';
import { HomeStudy } from './HomeStudy';
import { HomeGroupHeading } from './HomeGroupHeading';
import { DnaChart, PairingsChart } from '../atlas/RecipeCharts';
import { catalogue } from '../atlas/data';
import { PantryStudy } from './PantryStudy';
import '../atlas/atlas.css';
import './studies.css';

const highlights = [
  { id: 'pantry', number: '01', label: 'YOUR SHELF, MORE POSSIBILITIES', title: 'Just one more bottle.', intro: 'Choose ingredients. Find your best next addition.', meta: `${catalogue.recipes.length} recipes · Test shelf`, Chart: PantryStudy },
  { id: 'dna', number: '03', label: 'THE RECIPE, REVEALED', title: 'Same shelf. Different intentions.', intro: 'Choose a classic. Compare its measures or proportions.', meta: '7 classics', Chart: DnaChart },
  { id: 'pairings', number: '04', label: 'INGREDIENT CONNECTIONS', title: 'Who keeps whose company?', intro: 'See which ingredients share recipes, by count or overlap.', meta: '12 ingredients · 66 pairs', Chart: PairingsChart },
];

export default function LandingHighlights() {
  return <section className="home-studies" aria-labelledby="home-studies-title">
    <HomeGroupHeading id="home-studies-title" label="FOUR INTERACTIVE STUDIES" title="Drinks, decoded." description="Open a study. See what’s in your glass." />
    {highlights.map(({ id, number, label, title, intro, meta, Chart }) => <Fragment key={id}><div className="bar-atlas home-highlights"><HomeStudy id={id} number={number} label={label} title={title} intro={intro} meta={meta} defaultOpen={id === 'pantry'}>
      {id === 'pantry' ? <PantryStudy /> : <Chart compact />}
    </HomeStudy></div>{id === 'pantry' && <CalorieComparison />}</Fragment>)}
  </section>;
}

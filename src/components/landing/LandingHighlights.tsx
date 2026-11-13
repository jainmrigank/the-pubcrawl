import { Fragment } from 'react';
import { CalorieComparison } from './CalorieComparison';
import { HomeStudy } from './HomeStudy';
import { HomeGroupHeading } from './HomeGroupHeading';
import { PantryChart, DnaChart, PairingsChart } from '../atlas/RecipeCharts';
import { catalogue, stories } from '../atlas/data';
import { SourceNotes } from '../atlas/shared';
import '../atlas/atlas.css';

const highlights = [
  { id: 'pantry', number: '01', label: 'YOUR SHELF, MORE POSSIBILITIES', title: 'Just one more bottle.', intro: 'Pick ingredients. See what one more could unlock.', meta: `${catalogue.recipes.length} recipes · An imaginary shelf to try`, Chart: PantryChart },
  { id: 'dna', number: '03', label: 'THE RECIPE, REVEALED', title: 'Same shelf. Different intentions.', intro: 'Compare seven classics by ratio or pour size.', meta: '7 classics · Proportions & measures', Chart: DnaChart },
  { id: 'pairings', number: '04', label: 'INGREDIENT CONNECTIONS', title: 'Who keeps whose company?', intro: 'See which ingredients share recipes, by count or overlap.', meta: '12 ingredients · 66 pairs', Chart: PairingsChart },
];

export default function LandingHighlights() {
  return <section className="home-studies" aria-labelledby="home-studies-title">
    <HomeGroupHeading id="home-studies-title" label="FOUR INTERACTIVE STUDIES" title="Drinks, decoded." description="Open a study. See what’s in your glass." />
    {highlights.map(({ id, number, label, title, intro, meta, Chart }) => <Fragment key={id}><div className="bar-atlas home-highlights"><HomeStudy id={id} number={number} label={label} title={title} intro={intro} meta={meta} defaultOpen={id === 'pantry'}>
      <Chart />
      <SourceNotes story={stories.find(story => story.id === id)!} />
    </HomeStudy></div>{id === 'pantry' && <CalorieComparison />}</Fragment>)}
  </section>;
}

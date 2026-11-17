import { CalorieComparison } from './CalorieComparison';
import { HomeStudy } from './HomeStudy';
import { HomeGroupHeading } from './HomeGroupHeading';
import { PairingsStudy } from './PairingsStudy';
import { PantryStudy } from './PantryStudy';
import type { StudyActions } from './StudyRecipes';
import '../atlas/atlas.css';
import './studies.css';
import './focus-return.css';

const highlights = [
  { id: 'pairings', label: 'INGREDIENT CONNECTIONS', title: 'Ingredient pairings', intro: 'Choose two ingredients. Find their drinks.' },
  { id: 'pantry', label: 'YOUR INGREDIENTS', title: 'What can I make?', intro: 'Add ingredients. Choose a drink.' },
];

export default function LandingHighlights({ actions }: { actions: StudyActions }) {
  return <section className="home-studies" aria-labelledby="home-studies-title">
    <HomeGroupHeading id="home-studies-title" label="EXPLORE YOUR DRINK" title="Drinks, decoded." description="Pick a study to explore." />
    {highlights.map(({ id, label, title, intro }) => <div key={id} className="bar-atlas home-highlights"><HomeStudy id={id} label={label} title={title} intro={intro} meta="">
      {id === 'pantry' ? <PantryStudy actions={actions} /> : <PairingsStudy actions={actions} />}
    </HomeStudy></div>)}
    <CalorieComparison />
  </section>;
}

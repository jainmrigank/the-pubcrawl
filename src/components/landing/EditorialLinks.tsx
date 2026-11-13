import { ArrowRight } from '../../icons';
import { GlassDrawing } from './GlassDrawing';
import { HomeGroupHeading } from './HomeGroupHeading';

export function EditorialLinks() {
  return <section className="home-explore landing-discovery-section" aria-labelledby="home-explore-title">
    <HomeGroupHeading id="home-explore-title" label="KEEP EXPLORING" title="More at the bar." description="More ways to enjoy your next round." />
    <nav className="editorial-links" aria-label="More to explore">
    {([
      ['Find your flavour.', 'Taste Map', '#/taste-map', 'wine'],
      ['Play a round.', 'Pub Quiz', '#/quiz', 'rocks'],
      ['Learn the basics.', 'Bar Basics', '#/basics', 'tall'],
      ['Your saved drinks.', 'Your Tab', '#/tab', 'coupe'],
    ] as const).map(([copy, label, href, kind], i) => <a href={href} key={href} aria-label={label}>
      <span className="editorial-link-index k-label">0{i + 1}</span>
      <span className="editorial-link-copy"><span>{copy}</span><small className="k-label">{label}</small></span>
      <GlassDrawing kind={kind} /><ArrowRight size={30} />
    </a>)}
    </nav>
  </section>;
}

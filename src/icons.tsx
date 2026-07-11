/**
 * Hand-drawn line glyphs — round strokes run through a turbulence "sketch"
 * filter (see SketchDefs) so everything looks penned, not engineered.
 * Glassware glyphs double as the glass-type indicators on flash cards.
 */
import type { SVGProps } from 'react';

/** Mount once near the app root — provides the shared sketch filter. */
export const SketchDefs = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden focusable="false">
    <defs>
      <filter id="sketch" x="-25%" y="-25%" width="150%" height="150%">
        <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="7" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="1.7" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs>
  </svg>
);

const base: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

type P = SVGProps<SVGSVGElement> & { size?: number };
// Note: no SVG filter here — the hand-drawn feel comes from the wobbled paths
// and round caps. The turbulence filter is reserved for the one nav glyph;
// applying it to every small icon melts the compositor on card-heavy pages.
const S = ({ size = 20, children, ...rest }: P) => (
  <svg width={size} height={size} {...base} {...rest} style={{ overflow: 'visible', ...rest.style }}>
    {children}
  </svg>
);

/** The PubCrawl mark — a scribbled martini, same drawing as the favicon. */
export const PubGlyph = ({ size = 30 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    stroke="currentColor"
    strokeWidth={3.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    style={{ overflow: 'visible' }}
  >
    <g filter="url(#sketch)">
      <path d="M13 15 Q32 20 51 14" />
      <path d="M13.5 15.5 Q23 27 31.5 37.5" />
      <path d="M50.5 14.5 Q41 26.5 32.5 37.5" />
      <path d="M32 38 Q32.6 43 31.7 49" />
      <path d="M22 51.5 Q32 49.5 42.5 51" />
      <circle cx="40" cy="23" r="3" />
      <path d="M40 20 Q42.5 15.5 46 13" />
    </g>
  </svg>
);

/* ---------- glassware ---------- */
export const GLASS_ICONS: Record<string, (p: P) => JSX.Element> = {
  martini: (p) => (
    <S {...p}>
      <path d="M4 4.5 Q12 6 20 4M4.5 5 L12 13M19.5 4.5 L12 13M12 13v7M7.5 20 Q12 19.3 16.5 20" />
    </S>
  ),
  coupe: (p) => (
    <S {...p}>
      <path d="M4 4c0 4.5 3.5 7 8 7s8-2.5 8-7M4.5 4 Q12 5.5 19.5 4M12 11v9M7.5 20 Q12 19.3 16.5 20" />
    </S>
  ),
  flute: (p) => (
    <S {...p}>
      <path d="M9.5 3h5l-1 10.5h-3zM12 13.5V20M8.5 20 Q12 19.4 15.5 20" />
    </S>
  ),
  wine: (p) => (
    <S {...p}>
      <path d="M8 3h8v4.5a4 4 0 0 1-8 0zM12 11.5V20M8.5 20 Q12 19.4 15.5 20" />
    </S>
  ),
  highball: (p) => (
    <S {...p}>
      <path d="M7 3 Q12 3.8 17 3L16.7 21 Q12 20.4 7.3 21zM7.2 8 Q12 8.7 16.8 8" />
    </S>
  ),
  rocks: (p) => (
    <S {...p}>
      <path d="M5.5 8 Q12 9 18.5 8L18 21 Q12 20.3 6 21zM9 12.5l5.5-.4.3 4.8-5.6.4z" />
    </S>
  ),
  shot: (p) => (
    <S {...p}>
      <path d="M8 10 Q12 10.7 16 10L15 20 Q12 19.6 9.2 20z" />
    </S>
  ),
  hurricane: (p) => (
    <S {...p}>
      <path d="M9 3h6c0 3-1.5 4-1.5 6s2 3 2 5.5A3.5 3.5 0 0 1 12 18a3.5 3.5 0 0 1-3.5-3.5c0-2.5 2-3.5 2-5.5S9 6 9 3zM12 18v2.5M9 20.5 Q12 20 15 20.5" />
    </S>
  ),
  margarita: (p) => (
    <S {...p}>
      <path d="M4 4 Q12 5.5 20 4l-3 4h-4.5l-.5 5-.5-5H7zM12 13v7M8 20 Q12 19.4 16 20" />
    </S>
  ),
  snifter: (p) => (
    <S {...p}>
      <path d="M7 5h10c1 5-1.5 8-5 8s-6-3-5-8zM12 13v6M8.5 19 Q12 18.5 15.5 19" />
    </S>
  ),
  mug: (p) => (
    <S {...p}>
      <path d="M5 6 Q10.5 6.8 16 6v14 Q10.5 19.4 5 20zM16 9h3.5l-.4 7H16" />
    </S>
  ),
  pitcher: (p) => (
    <S {...p}>
      <path d="M7 4 Q11.5 4.7 16 4v16 Q11.5 19.4 7 20zM16 7h3l-1 6h-2M7 4 5.5 7" />
    </S>
  ),
  bowl: (p) => (
    <S {...p}>
      <path d="M4 9 Q12 10 20 9a8 8 0 0 1-16 0zM9 20 Q12 19.5 15 20" />
    </S>
  ),
  pint: (p) => (
    <S {...p}>
      <path d="M7 3 Q12 4 17 3l-1.5 18 Q12 20.4 8.5 21z" />
    </S>
  ),
  jar: (p) => (
    <S {...p}>
      <path d="M7 6 Q12 6.8 17 6v14 Q12 19.4 7 20zM8.5 3h7v3h-7z" />
    </S>
  ),
  glass: (p) => (
    <S {...p}>
      <path d="M7 3 Q12 3.8 17 3l-1 18 Q12 20.4 8 21z" />
    </S>
  ),
};

const GLASS_MAP: [RegExp, string][] = [
  [/martini|cocktail glass/i, 'martini'],
  [/coupe|champagne saucer/i, 'coupe'],
  [/flute/i, 'flute'],
  [/margarita|coupette/i, 'margarita'],
  [/wine|balloon|copa/i, 'wine'],
  [/highball|collins|zombie|tumbler/i, 'highball'],
  [/old-fashioned|rocks|whiskey glass|lowball/i, 'rocks'],
  [/shot|pousse|cordial/i, 'shot'],
  [/hurricane|poco|sour glass/i, 'hurricane'],
  [/snifter|brandy/i, 'snifter'],
  [/mug|irish coffee|toddy|cup/i, 'mug'],
  [/pitcher|jug/i, 'pitcher'],
  [/punch bowl|bowl/i, 'bowl'],
  [/pint|beer|pilsner/i, 'pint'],
  [/jar/i, 'jar'],
];

export function glassIconId(glassName: string): string {
  for (const [re, id] of GLASS_MAP) if (re.test(glassName)) return id;
  return 'glass';
}

export function GlassIcon({ glass, size = 20, ...rest }: { glass: string } & P) {
  const Icon = GLASS_ICONS[glassIconId(glass || '')];
  return <Icon size={size} {...rest} />;
}

/* ---------- ui glyphs ---------- */
export const ArrowRight = (p: P) => (
  <S {...p}>
    <path d="M4 12 Q11 11.6 19 12M13 6l6 6-6 6" />
  </S>
);
export const ArrowDown = (p: P) => (
  <S {...p}>
    <path d="M12 4 Q11.6 11 12 19M6 13l6 6 6-6" />
  </S>
);
export const X = (p: P) => (
  <S {...p}>
    <path d="M5 5 Q12 12 19 19M19 5 Q12 12 5 19" />
  </S>
);
export const Plus = (p: P) => (
  <S {...p}>
    <path d="M12 4 Q11.7 12 12 20M4 12 Q12 11.7 20 12" />
  </S>
);
export const Search = (p: P) => (
  <S {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5 Q18 18.5 21 21" />
  </S>
);
export const Camera = (p: P) => (
  <S {...p}>
    <path d="M3 7h4l2-2.5h6L17 7h4v13 Q12 19.2 3 20zM12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />
  </S>
);
export const Play = (p: P) => (
  <S {...p}>
    <path d="M8 5l11 7-11 7z" />
  </S>
);
export const Check = (p: P) => (
  <S {...p}>
    <path d="M4 13 Q7.5 15 9.5 18 Q13.5 10 20 5.5" />
  </S>
);
export const Share = (p: P) => (
  <S {...p}>
    <path d="M12 14.5 Q11.7 8.5 12 3M8.5 6 Q10.2 4.2 12 3 Q13.8 4.2 15.5 6" />
    <path d="M7 10H5v11 Q12 20.3 19 21V10h-2" />
  </S>
);
export const Heart = (p: P) => (
  <S {...p}>
    <path d="M12 20.5 Q5.5 15.5 4 11 C3.2 7.8 5.2 5.2 8 5.2 C9.9 5.2 11.3 6.4 12 8 C12.7 6.4 14.1 5.2 16 5.2 C18.8 5.2 20.8 7.8 20 11 Q18.5 15.5 12 20.5z" />
  </S>
);
export const Shuffle = (p: P) => (
  <S {...p}>
    <path d="M3 7 Q8 6.6 10 8.5 Q14 12 16 15.5 Q17.5 17.4 21 17M3 17 Q8 17.4 10 15.5 Q14 12 16 8.5 Q17.5 6.6 21 7" />
    <path d="M18 4.5 21 7l-3 2.5M18 14.5 21 17l-3 2.5" />
  </S>
);

/* ---------- bar-basics + ingredient glyphs ---------- */
export const TOOL_ICONS: Record<string, (p: P) => JSX.Element> = {
  shaker: (p) => (
    <S {...p}>
      <path d="M8 8 Q12 8.6 16 8l-1 13 Q12 20.4 9 21zM8.5 8 8 5 Q12 5.6 16 5l-.5 3M10 2.5h4V5h-4z" />
    </S>
  ),
  jigger: (p) => (
    <S {...p}>
      <path d="M7 3 Q12 3.6 17 3l-5 8zM7 21 Q12 20.4 17 21l-5-8z" />
    </S>
  ),
  barspoon: (p) => (
    <S {...p}>
      <path d="M12 2 Q11.7 9 12 16M12 16a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
      <path d="M10 5c2 1 2 3 0 4s-2 3 0 4" opacity=".5" />
    </S>
  ),
  strainer: (p) => (
    <S {...p}>
      <path d="M4 10 Q12 10.8 20 10M6 10a6 6 0 0 1 12 0M4 10l-1.5 4M20 10l1.5 4" />
      <circle cx="9" cy="7.5" r=".5" />
      <circle cx="12" cy="6.8" r=".5" />
      <circle cx="15" cy="7.5" r=".5" />
    </S>
  ),
  muddler: (p) => (
    <S {...p}>
      <path d="M10 2h4l-.3 13h-3.4zM8.5 15 Q12 14.5 15.5 15L14 22 Q12 21.6 10 22z" />
    </S>
  ),
  mixingglass: (p) => (
    <S {...p}>
      <path d="M6 4 Q12 4.8 18 4l-1.5 16 Q12 19.4 7.5 20zM6 4l12 10" />
    </S>
  ),
  twist: (p) => (
    <S {...p}>
      <path d="M4 14c2-6 8-9 14-8-1 6-6 10-12 9" />
      <path d="M6 15c4 0 8-3 10-7" opacity=".5" />
    </S>
  ),
  cube: (p) => (
    <S {...p}>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M12 3v9m0 0l8-4.5M12 12l-8-4.5" opacity=".5" />
    </S>
  ),
  drop: (p) => (
    <S {...p}>
      <path d="M12 3c4 5.5 6 8.5 6 11.5A6 6 0 0 1 6 14.5C6 11.5 8 8.5 12 3z" />
    </S>
  ),
  leaf: (p) => (
    <S {...p}>
      <path d="M5 19C5 9 12 4 20 4c0 10-6 15-13 15M5 19l7-7" />
    </S>
  ),
  citrus: (p) => (
    <S {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6L6 18" opacity=".5" />
    </S>
  ),
  percent: (p) => (
    <S {...p}>
      <path d="M5 19 Q12 12 19 5" />
      <circle cx="7.5" cy="7.5" r="2.8" />
      <circle cx="16.5" cy="16.5" r="2.8" />
    </S>
  ),
  ratio: (p) => (
    <S {...p}>
      <path d="M4 6 Q7.5 5.7 11 6M4 12 Q10.5 11.6 17 12M4 18 Q9 17.6 14 18" />
      <circle cx="19" cy="6" r="1" />
      <circle cx="19" cy="18" r="1" />
    </S>
  ),
  flame: (p) => (
    <S {...p}>
      <path d="M12 3c1 4-4 5.5-4 10a4 4 0 0 0 8 0c0-2-1-3.5-1-3.5s-1.5 1.5-2.5 1C11 9 14 6 12 3z" />
    </S>
  ),
  book: (p) => (
    <S {...p}>
      <path d="M4 4h7v16H4zM13 4h7v16h-7zM11 4l1 1 1-1" />
    </S>
  ),
  bottle: (p) => (
    <S {...p}>
      <path d="M10 2.5h4v4c1.8 1.6 2.5 3 2.5 5.2V21 Q12 20.4 7.5 21v-9.3c0-2.2.7-3.6 2.5-5.2z" />
      <path d="M8.5 13 Q12 13.5 15.5 13" opacity=".5" />
    </S>
  ),
  egg: (p) => (
    <S {...p}>
      <path d="M12 3c3.5 4 5.5 7.8 5.5 11.3 0 3.5-2.4 6.2-5.5 6.2s-5.5-2.7-5.5-6.2C6.5 10.8 8.5 7 12 3z" />
    </S>
  ),
  star: (p) => (
    <S {...p}>
      <path d="M12 4 Q11.7 12 12 20M5 8 Q12 12 19 16M19 8 Q12 12 5 16" />
    </S>
  ),
};

export function ToolIcon({ id, size = 20, ...rest }: { id: string } & P) {
  const Icon = TOOL_ICONS[id] || GLASS_ICONS[id] || TOOL_ICONS.book;
  return <Icon size={size} {...rest} />;
}

/* ---------- ingredient category → glyph ---------- */
const CATEGORY_GLYPH: Record<string, string> = {
  Spirit: 'bottle',
  Liqueur: 'bottle',
  'Wine & Fortified': 'wine',
  'Beer & Cider': 'pint',
  Bitters: 'drop',
  Juice: 'citrus',
  'Soda & Mixer': 'highball',
  'Syrup & Sweetener': 'drop',
  Fruit: 'citrus',
  'Herb & Spice': 'leaf',
  'Dairy & Egg': 'egg',
  Other: 'star',
};

export function CategoryGlyph({ category, size = 18, ...rest }: { category?: string } & P) {
  return <ToolIcon id={CATEGORY_GLYPH[category || 'Other'] || 'star'} size={size} {...rest} />;
}

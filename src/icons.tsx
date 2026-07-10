/**
 * Geometric line-icon set — 1.5px strokes, currentColor, square joins.
 * Glassware glyphs double as the glass-type indicators on flash cards.
 */
import type { SVGProps } from 'react';

const base: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'square',
  strokeLinejoin: 'miter',
  'aria-hidden': true,
};

type P = SVGProps<SVGSVGElement> & { size?: number };
const S = ({ size = 20, children, ...rest }: P) => (
  <svg width={size} height={size} {...base} {...rest}>
    {children}
  </svg>
);

/* ---------- glassware ---------- */
export const GLASS_ICONS: Record<string, (p: P) => JSX.Element> = {
  martini: (p) => (
    <S {...p}>
      <path d="M4 4h16L12 13zM12 13v7M7.5 20h9" />
    </S>
  ),
  coupe: (p) => (
    <S {...p}>
      <path d="M4 4c0 4.5 3.5 7 8 7s8-2.5 8-7zM12 11v9M7.5 20h9" />
    </S>
  ),
  flute: (p) => (
    <S {...p}>
      <path d="M9.5 3h5l-1 10.5h-3zM12 13.5V20M8.5 20h7" />
    </S>
  ),
  wine: (p) => (
    <S {...p}>
      <path d="M8 3h8v4.5a4 4 0 0 1-8 0zM12 11.5V20M8.5 20h7" />
    </S>
  ),
  highball: (p) => (
    <S {...p}>
      <path d="M7 3h10v18H7z" />
      <path d="M7 8h10" opacity=".45" />
    </S>
  ),
  rocks: (p) => (
    <S {...p}>
      <path d="M5.5 8h13v13h-13z" />
      <path d="M9 12h6v5H9z" opacity=".45" />
    </S>
  ),
  shot: (p) => (
    <S {...p}>
      <path d="M8 10h8l-1.2 10H9.2z" />
    </S>
  ),
  hurricane: (p) => (
    <S {...p}>
      <path d="M9 3h6c0 3-1.5 4-1.5 6s2 3 2 5.5A3.5 3.5 0 0 1 12 18a3.5 3.5 0 0 1-3.5-3.5c0-2.5 2-3.5 2-5.5S9 6 9 3zM12 18v2.5M9 20.5h6" />
    </S>
  ),
  margarita: (p) => (
    <S {...p}>
      <path d="M4 4h16l-3 4h-4.5l-.5 5-.5-5H7zM12 13v7M8 20h8" />
    </S>
  ),
  snifter: (p) => (
    <S {...p}>
      <path d="M7 5h10c1 5-1.5 8-5 8s-6-3-5-8zM12 13v6M8.5 19h7" />
    </S>
  ),
  mug: (p) => (
    <S {...p}>
      <path d="M5 6h11v14H5zM16 9h3.5v7H16" />
    </S>
  ),
  pitcher: (p) => (
    <S {...p}>
      <path d="M7 4h9v16H7zM16 7h3l-1 6h-2M7 4L5.5 7" />
    </S>
  ),
  bowl: (p) => (
    <S {...p}>
      <path d="M4 9h16a8 8 0 0 1-16 0zM9 20h6" />
    </S>
  ),
  pint: (p) => (
    <S {...p}>
      <path d="M7 3h10l-1.5 18h-7z" />
    </S>
  ),
  jar: (p) => (
    <S {...p}>
      <path d="M7 6h10v14H7zM8.5 3h7v3h-7z" />
    </S>
  ),
  glass: (p) => (
    <S {...p}>
      <path d="M7 3h10l-1 18H8z" />
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
    <path d="M4 12h15M13 6l6 6-6 6" />
  </S>
);
export const ArrowDown = (p: P) => (
  <S {...p}>
    <path d="M12 4v15M6 13l6 6 6-6" />
  </S>
);
export const X = (p: P) => (
  <S {...p}>
    <path d="M5 5l14 14M19 5L5 19" />
  </S>
);
export const Plus = (p: P) => (
  <S {...p}>
    <path d="M12 4v16M4 12h16" />
  </S>
);
export const Search = (p: P) => (
  <S {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5L21 21" />
  </S>
);
export const Camera = (p: P) => (
  <S {...p}>
    <path d="M3 7h4l2-2.5h6L17 7h4v13H3z" />
    <circle cx="12" cy="13" r="3.5" />
  </S>
);
export const Play = (p: P) => (
  <S {...p}>
    <path d="M8 5l11 7-11 7z" />
  </S>
);

/* ---------- field-manual icons ---------- */
export const TOOL_ICONS: Record<string, (p: P) => JSX.Element> = {
  shaker: (p) => (
    <S {...p}>
      <path d="M8 8h8l-1 13H9zM8.5 8L8 5h8l-.5 3M10 2.5h4V5h-4z" />
    </S>
  ),
  jigger: (p) => (
    <S {...p}>
      <path d="M7 3h10l-5 8zM7 21h10l-5-8z" />
    </S>
  ),
  barspoon: (p) => (
    <S {...p}>
      <path d="M12 2v14M12 16a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
      <path d="M10 5c2 1 2 3 0 4s-2 3 0 4" opacity=".5" />
    </S>
  ),
  strainer: (p) => (
    <S {...p}>
      <path d="M4 10h16M6 10a6 6 0 0 1 12 0M4 10l-1.5 4M20 10l1.5 4" />
      <circle cx="9" cy="7.5" r=".5" />
      <circle cx="12" cy="6.8" r=".5" />
      <circle cx="15" cy="7.5" r=".5" />
    </S>
  ),
  muddler: (p) => (
    <S {...p}>
      <path d="M10 2h4v13h-4zM8.5 15h7L14 22h-4z" />
    </S>
  ),
  mixingglass: (p) => (
    <S {...p}>
      <path d="M6 4h12l-1.5 16h-9zM6 4l12 10" />
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
      <path d="M5 19L19 5" />
      <circle cx="7.5" cy="7.5" r="2.8" />
      <circle cx="16.5" cy="16.5" r="2.8" />
    </S>
  ),
  ratio: (p) => (
    <S {...p}>
      <path d="M4 6h7M4 12h13M4 18h10" />
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
};

export function ToolIcon({ id, size = 20, ...rest }: { id: string } & P) {
  const Icon = TOOL_ICONS[id] || GLASS_ICONS[id] || TOOL_ICONS.book;
  return <Icon size={size} {...rest} />;
}

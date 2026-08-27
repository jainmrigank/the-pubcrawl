# Shorts design QA

## Source and intent

The supplied oversized landing preview is the correction source:

`/var/folders/zc/bp4qnlts2_18n7z4rr41ck740000gn/T/codex-clipboard-4f5c15a1-990f-449b-a9b6-f4b33f637342.png`

It is 1318×1882 physical pixels and was normalized to 658 CSS pixels wide for
comparison. It is a problem reference rather than an exact target: the portrait
thumbnail dominates the viewport and pushes its title/creator below the fold.

## Implementation captures

- `/private/tmp/pubcrawl-shorts-landing-390x844.png` — mobile landing strip.
- `/private/tmp/pubcrawl-shorts-landing-658x802.png` — screenshot-like landing viewport.
- `/private/tmp/pubcrawl-shorts-landing-1440x900-v2.jpg` — desktop three-card strip.
- `/private/tmp/pubcrawl-shorts-six-random-mobile-390x844-v2.jpg` — current six-preview mobile strip.
- `/private/tmp/pubcrawl-shorts-six-random-desktop-1440x900.jpg` — current six-preview desktop strip.
- `/private/tmp/pubcrawl-shorts-viewer-390x844-direct.jpg` — mobile immersive viewer.
- `/private/tmp/pubcrawl-shorts-viewer-1024x768.jpg` — desktop viewer with focused actions.
- `/private/tmp/pubcrawl-shorts-overlay-mobile-390x844.png` — mobile viewer with
  the transparent BACK/SHARE overlays aligned to the player.
- `/private/tmp/pubcrawl-shorts-overlay-desktop-1024x768.png` — desktop viewer
  with the focused transparent SHARE overlay in the black gutter.
- `/private/tmp/pubcrawl-shorts-landing-comparison-v2.jpg` — normalized source on the left and corrected 658×802 implementation on the right.

The browser reported devicePixelRatio 2 at the 658×802 viewport; saved QA
captures are normalized to CSS-pixel dimensions by the browser surface.

## Responsive measurements

- 390×844: six facades render in a contained horizontal track. The first card is
  235.3px wide and 330.6px tall (285.6px portrait plus title/creator); roughly
  103px of the next card remains visible. The page stays 390px wide and the
  strip has zero iframes.
- 658×802: cards cap at 260px and 376.7px tall (315.8px portrait plus readable
  title/creator). All six remain horizontally accessible without stretching the
  track.
- 768×1024 tablet viewer: the feed owns the full 1024px height and the uncropped
  active player is centred at 576×1024px; the matched recipe/share actions stay
  in the right media gutter rather than covering native YouTube controls.
- 1024×768: the seven-link set moves into the existing drawer before it can
  collide; the persistent header remains. Six 160px previews use the contained
  horizontal track. The viewer player is 399.4×710px with black gutters. Desktop overlay controls
  are opacity 0/pointer-events none at rest; BACK is aligned to the player's
  top-left and SHARE/MAKE THIS stack in the black gutter beyond the player's
  712px right edge, all transparent and revealed on keyboard focus.
- 1440×900: all six 198px previews fit across the strip. The viewer player uses
  the full 842px available height and remains centred at 473.6px wide.

## Interaction and state checks

- `SHORTS` precedes `WATCH` in both desktop navigation and the mobile drawer.
- Landing cards remain static facades. Selecting the first teaser opened the
  exact randomized `v=VIDEO_ID&src=landing` route and activated that same video.
- Re-entering the landing view produced a different set/order of six previews;
  re-entering Shorts three times produced a fresh first video each time. The
  current visit remained stable while its API metadata refreshed.
- The viewer has no section intro, count, PubCrawl title/creator/lane/duration,
  explanatory footer, install banner, daily question, nudge, or page footer.
- Body and document scrolling lock on Shorts; the feed alone owns contained,
  mandatory vertical snap scrolling.
- On 390×844, scrolling one viewport changed the active randomized video while
  the adaptive pool stayed at no more than five iframes (one in fallback mode).
  The normal forward window is one previous/current/three-ahead; reverse
  intent mirrors that window before the active card crosses 51% visibility.
- A deep link to `rIrPkH8UrYk` opened index 1. A deep link to `ql-JNBi-qUQ`
  opened index 7 and exposed `MAKE THIS` with `#/menu?q=Margarita`; selecting it
  unlocked the document and restored the menu route.
- `BACK` returned to the previous PubCrawl hash and restored its remembered
  landing position. Direct entries fall back to `#/`.
- Mobile/PWA BACK remains visible as a transparent 44×44px safe-area-aware
  top-left target and SHARE as a matching right-middle target, clear of
  YouTube's native controls. Desktop overlay controls are hidden at rest and
  were verified through keyboard `:focus-within`; the optional `MAKE THIS`
  action is the only bottom text action. At 1024px it stays in the black side
  gutter, outside YouTube's controls.
- Reduced-motion/data-saving logic retains the thumbnail and requires a tap;
  online/offline listeners remove the iframe and expose the reconnect state.
  Normal autoplay does not render a `PREPARING…` label: the incoming thumbnail
  remains visible until `PLAYING`, then crossfades out; a six-second stall
  exposes `TAP TO PLAY · SWIPE TO SKIP` without blocking navigation. On phones
  the thumbnail-matched backdrop fills the media-safe bands above/below a
  9:16 player, and tablet gutters keep Share/MAKE THIS outside native controls.
  The selected browser did not expose network/media-preference emulation, so
  those branches were verified from the compiled code path rather than a
  simulated browser toggle.
- No uncaught error overlay, broken route, or page dialog appeared during the
  interaction pass. The selected browser surface did not expose persistent
  console-log capture.

## Comparison history

1. Source comparison: the oversized preview used nearly the entire 658px-wide
   viewport for one portrait, leaving its metadata at or below the fold.
2. First correction: mobile cards were capped at 68%/260px and desktop cards at
   280px; titles and creators became visible within each compact card.
3. Six-preview update: desktop facades were reduced to 198px so all six fit at
   1440px; mobile kept the one-card-plus-peek rhythm, contained horizontal
   scrolling, and an uncropped immersive viewer.

Automated verification: `npm test`, `npm run build`, and `git diff --check`.

final result: passed

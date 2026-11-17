# Focus & Return — design QA

Date: 15 November 2026. Scope: option 5's layout for Ingredient pairings and What can I make?, within the existing PubCrawl app. The prior report is preserved at `research/focus-return-2026-11-15/prior-shorts-design-qa.md`.

## Findings

No actionable P0/P1/P2 differences remain within the selected layout scope. The complete matrix, explicit recipe count, full result list, inline recipe, mobile Back/Edit controls, and desktop two-panel finder are implemented.

## Source and rendered evidence

- Source visual truth: `/Users/mrigankjain/.codex/generated_images/01a0902b-1752-70a0-b97e-fc99d87e8640/exec-311c0eab-337a-447c-ac89-e3a3e6dff843.png` (1024 × 1536 pixels; illustrative sheet, no declared CSS density).
- Implementation: `http://127.0.0.1:5175/`, Home route.
- Browser-rendered mobile light: `research/focus-return-2026-11-15/previews/mobile-light-page.jpg`.
- Browser-rendered mobile dark: `research/focus-return-2026-11-15/previews/mobile-dark-page.jpg`.
- Browser-rendered desktop: `research/focus-return-2026-11-15/previews/finder-desktop-light-page.jpg`.
- Source and implementation were opened together in `research/focus-return-2026-11-15/previews/reference-comparison.png` and `research/focus-return-2026-11-15/previews/desktop-reference-comparison.png`.
- Focused regions in that previews directory: `reference-pairings.png`, `reference-finder.png`, `pairings-mobile-light.png`, `finder-mobile-dark.png`, and `finder-desktop-light.png`. These make controls, type, grid labels, photo framing, and actions readable.

### Viewports, state, and normalization

Live IAB captures used 390 × 844 CSS pixels on mobile and 1440 × 960 on desktop. Full-page IAB capture omitted a 15-pixel scrollbar gutter: saved pages measure 375 × 5029 and 1425 × 4086 respectively. These comparisons judge hierarchy and layout rather than literal pixel equivalence at the right capture edge. Component crops measure 346 × 952 (pairings), 346 × 1325 (mobile finder), and 1216 × 961 (desktop finder). Source/implementation content regions were resized proportionally to equal widths of 333 pixels on mobile and 608 on desktop, with device frames and unrelated hero excluded. Neither axis was stretched independently.

Independent Playwright captures use exact configured CSS-pixel dimensions at deviceScaleFactor 1. They verify that the capture-edge ambiguity is not page overflow, at widths 320, 390, 430, 768, 1024, and 1440 in both themes.

Compared states: pairings has all 12 ingredients / 144 squares, Lemon Juice + Vodka, 11 recipes, Shared recipes selected. Finder has Gin, Campari, Sweet Vermouth, Ice, Orange, and Lemon Juice; 2 / 14 / 147 groups; Ready now selected; actual catalogue Negroni open. Mobile light pairings, dark recipe focus, and light desktop match the corresponding concept states.

## Five required fidelity surfaces

| Surface | Evidence and assessment |
| --- | --- |
| Fonts and typography | Existing Instrument Serif display type, Instrument Sans UI, and mono labels remain authoritative. Heading/body/control hierarchy is consistent with the site. At phone widths, readable 14px recipe text replaces the mock's tiny two-column text; Ingredients and Method stack through 430px. Long recipe names wrap and counts use tabular numerals. Font shapes were compared in focused crops; changing families was intentionally outside scope. |
| Spacing and layout rhythm | Selectors precede the pair summary and full matrix. Counts and View all have explicit positions. Finder follows ingredients → distance group → list/recipe. Controls are at least 44px high; small overview squares have selectors and Expand grid as precision alternatives. Desktop places editor/results beside recipe with a 32px gap. Retained chapter headings/fold controls explain the greater height versus the concept. |
| Colors and tokens | Existing paper/charcoal/rust tokens serve both themes. Active groups reverse foreground/background; selected matrix cells have an outline and bold axis labels. Single sequential accent ramp, visible Fewer/More key, and exact count avoid color-only interpretation. |
| Image quality and assets | Actual recipe thumb, whole-photo contain, no scale transform, bounded reserved frame, and existing glass fallback. The portrait photo intentionally differs from the mock's illustrative landscape image. Existing martini logo/icon set remain; no mock image was recreated with CSS art or introduced into the catalogue. |
| Copy and content | Literal titles/instructions replace abstract copy. Ready now / Need 1 / Need 2, View all 11 recipes, Back to N drinks, Edit, and Add & open Shelf describe the actual action. Counts/quantities come from the catalogue; no illustrative ABV/history/tasting claims were copied. |

## Comparison and correction history

| Earlier issue | Severity | Fix | Post-fix evidence |
| --- | --- | --- | --- |
| Atlas reset erased scoped button radii/type. | P2 | Scoped authoritative button rules and explicit 46px selectors. | Final combined mobile/desktop comparisons show consistent controls. |
| Tall photos could exceed their frame despite contain. | P1 | Inset image, explicit width/height, centered contain within reserved frame. | Complete portrait visible in final captures; framing assertions pass at six widths in both browsers. |
| Fullscreen return focused an origin while still inert. | P1 | Restore focus after the React close commit and next frame. | Both-browser fullscreen and inline return tests verify trigger focus and scroll. |
| Safari blur dismissed an option before its click. | P1 | Outside-pointer dismissal, explicit Done, and Escape. | Corrected WebKit picker check and final 29-test WebKit suite pass; live capture has all six ingredients. |

The combined images are the final post-fix visual comparison. No visual change was needed in response to this comparison. Actual photo/data, existing section framing, larger touch targets, and stacked mobile method are accepted layout-only adaptations. The source's whole-page hero/sidebar/branding were not part of this task.

## Implementation checklist

- [x] Full 144-cell matrix across phone/tablet/desktop and rotation.
- [x] Selectors, arrow-key navigation, selection outline, count/overlap, precision expansion.
- [x] All matching recipes accessible, including the eleventh result; no hard cap of three.
- [x] Ingredient add/remove and 0/1/2-needed groups update results.
- [x] Inline photo, measures, method, glass, save/share/like, available video, fullscreen reader.
- [x] Back preserves group, list/page scroll, and trigger focus.
- [x] Add & open Shelf merges selected ingredients, keeps prior entries, deduplicates, and supports contextual return.
- [x] Fullscreen inert background, Lock/unlock, Escape, Back, fallback, focus restoration.
- [x] Full catalogue requested only after selection, not on initial Home.
- [x] Live post-reload console checked: no new errors.

## Verification

- `npm test`: **131 passed**.
- `npm run build`: passed; existing large-chunk advisory remains.
- `npm run test:e2e:preview -- --output=test-results-focus-return-all`: **142 passed, 5 existing skips**. This preceded the last Safari picker correction.
- Final affected Chromium run after that correction: `PUBCRAWL_E2E_MODE=preview npx playwright test e2e/landing-data.spec.ts e2e/content-navigation.spec.ts e2e/mobile-studies.spec.ts e2e/recipe-focus.spec.ts --output=test-results-focus-return-chromium-verified`: **29 passed**.
- Final affected WebKit run: `PUBCRAWL_E2E_PORT=4177 npx playwright test --config=playwright.webkit.config.ts --project=webkit-scroll-bar e2e/landing-data.spec.ts e2e/content-navigation.spec.ts e2e/mobile-studies.spec.ts e2e/recipe-focus.spec.ts --output=test-results-focus-return-webkit-verified`: **29 passed**.
- Focused suite exercised reduced motion, failed images, keyboard, short landscape, and orientation changes.
- `git diff --check`: passed.

Not verified: physical iPhone hardware; 10% playback in a browser Animations panel (unavailable on the chosen browser surface); native OS share-sheet delivery; actual YouTube playback. Existing share/video mechanisms are reused. Browser emulation is not physical-device verification. No new custom entry or recipe-change animation was added; matrix color transitions last 120ms and are disabled for reduced motion.

## Open questions and follow-up polish

No unresolved implementation question or required P3 change. Physical iPhone verification remains a separate check. Existing unrelated work, prototypes, and research remain intact. Nothing has been pushed or deployed in this task.

final result: passed

## Approved ingredient guides — 17 November 2026

No actionable interface-polish findings remain in the changed ingredient controls.

- All 35 approved families are implemented through one guide dataset. Recipes retain their original names and measures; short explanations and optional details are shared by flashcards, the fullscreen reader, Taste Map previews and home-page previews.
- Controls retain the app's body font, theme colours and tabular measures. Ingredient disclosure targets are at least 44 px high. Guidance occupies a full row, rather than squeezing beside the measure. Ordinary ingredients do not receive extra explanatory copy.
- Shelf, the home finder, Express and the Worker use shared ingredient rules. Measured quick preparations say **Prep first**; unmeasured variations and infusions require explicitly owned finished stock. The guide can add a finished homemade ingredient directly to Shelf. Proof, colour, cream and base-style distinctions remain explicit.
- Saved/shared recipe content excludes temporary Shelf availability and selected alternatives. Both source-card faces, internal reading position and keyboard focus survive recipe expansion and return; bounded rendering-frame retries cover resized WebKit cards. Hidden help links do not enter the reader's focus trap, and Lock disables the new disclosure controls.

Considered and rejected:

| Candidate | Reason |
| --- | --- |
| Always show every alternative and preparation step | Crowds ingredient lists; retain a short label and let the user disclose details. |
| Treat raw fruit and vodka as a finished liqueur | Creates false ready-now results; require preparation or explicitly owned finished stock. |

Verification:

- `npm test`: **142 passed**.
- `npm run build`: passed; generated catalogue remains 691 recipes, with 570 searchable ingredients.
- `npm run worker:dry-run`: passed, without publishing.
- `PUBCRAWL_E2E_PORT=4184 npm run test:e2e:preview -- --reporter=line --output=/tmp/pubcrawl-approved-final-preview-results`: **147 passed, 5 intentionally skipped**.
- Final focused Chromium run (`ingredient-guide`, `recipe-focus`, `mobile-studies`, `landing-data`): **28 passed** after the final copy and scoped-cache changes.
- Final focused WebKit run of the same four files: **28 passed**.
- Checked 320, 390, 430, 768, 1024 and 1440 px, both themes, reduced motion, lock/unlock, Back, failed photos, source focus, ingredient search, completed preparations, Shelf merging and page/list restoration. Reviewed mobile-dark and desktop-light reader screenshots.
- `git diff --check`: passed. Unrelated existing work and prototypes were retained.

Verdict: **Approve for browser review.** Not verified: physical iPhone use, a visual timing review at 10% animation speed, or sensory equivalence of the proposed home variations. No similarity percentages are claimed.


## Shared ingredient content and collapsed preparation — 17 November 2026

Full review of the changed ingredient rows in Drinks, saved recipes, Shelf, fullscreen and existing drink previews. React and the existing plain CSS/theme tokens were retained. This review covers ingredient guidance, not a new audit of every app screen.

| Category | Evidence inspected | Result |
| --- | --- | --- |
| Typography | Shared rows, measures, mobile-light card and mobile-dark/desktop-light reader screenshots; six widths, both themes | Existing body font, readable descriptions and tabular measures retained |
| Surfaces | Default, alternative-open and preparation-open states; 320–1440 px overflow checks | Full-width details, existing radii, 44 px disclosure targets |
| Animations | Existing chevron transition reused; reduced-motion browser runs | No entrance animation added; slow-motion visual review not repeated |
| Icons | Disclosure chevrons and open/closed states | Matching 1.5 px stroke, inherited colour and direction |
| Performance | Production build, generated manifest and source diff | No dependency added; full catalogue remains a separate lazy chunk |

Resolved changes:

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM | `shared/ingredient-guide-data.mjs`, `server/catalog.mjs`, `src/recipeContent.ts` | Guide recipes and reader-specific alternatives were separate from master ingredient entries | Short descriptions/approved choices persist in the master index and canonical recipe ingredients; old saved recipes fall back to the same data | Guidance is available without first using Shelf |
| MEDIUM | `src/components/RecipeIngredient.tsx`, `src/components/ingredient-guide.css` | Opening an alternative also exposed its preparation steps | Concise choices first; a separate **Before you mix** control starts closed in every card and reader | Keeps the cocktail recipe readable and the optional preparation deliberate |

Considered and rejected:

| Candidate | Reason |
| --- | --- |
| Put every preparation recipe into each stored ingredient's guidance | Duplicates long instructions and crowds the recipe; persist concise choices and disclose preparation separately |
| Rename ingredient identities to slash-separated alternatives | Would alter catalogue matching and pairing counts; use display metadata while retaining names and measures |

Verification:

- `npm test`: **143 passed**. Includes master-index/canonical-recipe guidance, old-save rehydration, privacy, ordinary ingredients and recipe-specific guards.
- `npm run build`: passed; **691 recipes / 570 ingredients**, generated data version `eacd719b789a61bf`. Existing large-chunk warning remains.
- Focused preview Chromium: **28 passed**, using `ingredient-guide`, `recipe-focus`, `mobile-studies`, `landing-data`. Log: `/tmp/pubcrawl-compact-ingredients-chromium.log`.
- Same focused WebKit suite: **28 passed**. Log: `/tmp/pubcrawl-compact-ingredients-webkit.log`.
- Verified default-closed preparation, deliberate expansion, original measures, empty-Shelf Drinks guidance, preparation-aware Shelf results, both themes, widths 320/390/430/768/1024/1440, reduced motion, lock/unlock and source-card focus/state restoration.
- Inspected the running local app at `http://127.0.0.1:5175/#/menu?q=Mudslinger`; captured the closed **Before you mix** state in `output/playwright/compact-ingredients-card-light.png`.
- `git diff --check`: passed. Existing unrelated changes and prototypes retained.

Verdict: **Approve for browser review.** Not verified: physical iPhone use, a fresh 10%-speed visual timing review, or sensory equivalence of home variations. No similarity percentages are claimed.

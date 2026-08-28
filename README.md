# The PubCrawl

AI-assisted cocktail discovery app for searching a cocktail catalogue, matching recipes to a home shelf, identifying ingredients from photos, and generating original house-special recipes.

Live app: https://the-pubcrawl.vercel.app

## Recruiter Quick Read

The PubCrawl is a React, TypeScript, Vite, Express, and LLM-backed project focused on API-driven user workflows. It is relevant to agentic engineering because the app turns user context into structured actions: search, ingredient matching, photo-based extraction, generated recipe drafting, fallback handling, persistence, and deployment across separate frontend/API services.

It is not positioned as production AI employment experience. It is a hands-on portfolio project built to practice reliable AI workflows, prompt design, JSON handling, API integration, graceful degradation, and rapid product delivery.

## What It Does

- Searches a fully illustrated 691-entry cocktail catalogue by drink, ingredient, category, classic designation, mood, glass, India lane, pantry-access tier, place, or preparation method; every entry is browseable and available to pantry matching.
- Includes an evidence-led, dated 80-drink India collection spanning everyday serves, restaurant-bar leaders, regional/cultural drinks, and zero-proof recipes.
- Gives owner-made cocktails a dedicated House Specials collection, original photos, and normal menu and shelf matching.
- Gives every browseable flashcard an image and every India recipe a reviewed direct YouTube tutorial: exact named builds where available, clearly labelled base-technique videos for original riffs.
- Lets users maintain a home-bar shelf through ingredient typeahead or photo upload.
- Scores what can be made now and what is one or two ingredients away.
- Generates original house-special recipes from the exact shelf contents.
- Saves liked drinks and a personal tab for the night.
- Supports public like counts and kept house specials through a durable store when Redis is configured.
- Runs the frontend as a Vite app and the API as a separate Express service.

## Pages

- `#/menu`: Search, browse, mood filters, most-loved ranking, and surprise shuffle.
- `#/bar`: Ingredient shelf, photo upload, matched recipes, near misses, and house specials.
- `#/basics`: Techniques, tools, glassware, measurements, and starter-shelf guidance.
- `#/tab`: Saved shortlist with shareable text output.
- `#/shorts`: Immersive, vertically snapping short-form video feed.
- `#/watch`: Curated long-form cocktail and bar-culture videos.

Pages stay mounted while switching routes, preserving scroll position, search state, flipped cards, and accordions.

## Architecture

```text
React + TypeScript + Vite frontend
  -> src/api.ts client wrapper
  -> Express API
       -> cocktail catalogue and matching logic
       -> public likes and kept drinks store
       -> LLM client for photo identification and recipe generation
            -> prompt templates
            -> OpenAI-compatible chat endpoint
            -> JSON extraction
            -> model fallback chain
            -> offline fallback template
```

Key files:

- `src/App.tsx`: route state, menu browsing, shelf workflow, generated drinks, likes, and tab state.
- `src/api.ts`: frontend API calls and runtime API-base override.
- `server/app.mjs`: Express API, catalogue search, matching, likes, photo identification, and generation endpoints.
- `server/llm.mjs`: OpenAI-compatible LLM client, timeout handling, fallback model chain, and JSON extraction.
- `server/store.mjs`: Upstash Redis REST storage with local JSON fallback for development.
- `render.yaml`: Render blueprint for the standalone API.

## AI Workflow

Photo identification:

1. User uploads an image of bottles or ingredients.
2. The API sends a constrained prompt plus image payload to an OpenAI-compatible model endpoint.
3. The model is instructed to return only a JSON array of ingredient names.
4. The server parses the JSON, maps names back to known ingredients where possible, and returns structured shelf items.
5. If no model key is configured, the API returns a clear unavailable response instead of faking detection.

House-special generation:

1. User submits shelf ingredients, selected mood, saved-drink taste hints, and recently generated names to avoid repetition.
2. The API asks the model for one original practical recipe as a strict JSON object.
3. The server extracts JSON from the model response and returns a structured drink card.
4. If the primary model is over quota or unavailable, the LLM client tries a fallback model chain.
5. If all model calls fail, the app falls back to an offline template and labels it as off-menu.

## Reliability And Non-Happy Paths

- LLM calls use a timeout via `AbortSignal.timeout`.
- The API supports a fallback model chain for quota/availability failures.
- Model output is parsed through `extractJson` instead of displayed as raw prose.
- The app works without an LLM key: catalogue browsing, matching, likes, and saved tab still function.
- Public likes and kept specials can use Upstash Redis for durability, with local JSON fallback for development.
- API health is exposed at `/api/health` and reports catalogue/store readiness.
- Frontend runtime override supports changing API base URL without rebuilding.
- Secrets stay on the API service and are not exposed to the Vite frontend.

## Shorts

The `SHORTS` route (`#/shorts`) is an immersive feed beneath the persistent
PubCrawl navigation. Each Short fills the remaining app viewport, snaps
vertically, and uses YouTube's native controls. PubCrawl renders only BACK,
SHARE and an optional `MAKE THIS` action outside the player. BACK sits in a
minimal transparent top-left overlay and SHARE in a matching player-relative
gutter/edge; desktop actions reveal on hover or keyboard focus, while touch
devices keep the icon target discoverable. `MAKE THIS` remains a separate
action when a recipe match exists. On touch-sized Shorts routes the site header
is hidden so the feed owns the full dynamic viewport; the uncropped portrait
player is centred over a darkened, thumbnail-matched backdrop. A normal
connection keeps a directional five-slot pool (one previous, current and three
ahead while moving forward, mirrored when moving backward) cued; 3G uses three
slots, while reduced motion, Save Data and 2G use one tap-to-play player;
individual autoplay failures leave the rest of the pool alive. Thumbnails stay
over the player until its native state
reaches `PLAYING`, and a stalled start becomes a `TAP TO PLAY` state after six
seconds.
YouTube sound changes are polled from the native active player and propagated
to subsequent Shorts for the current app session only.

The landing page keeps six compact, freshly randomized build-time thumbnail
facades with titles and creators beneath them, so it loads no YouTube player.
Each new Shorts visit also receives a fresh shuffled feed order while exact deep
links still open their requested video. Teasers preserve
`#/shorts?v=VIDEO_ID&src=landing` links; sharing produces the same deep-link
format, and `MAKE THIS` opens an existing menu search.

`data/shorts.json` is the reviewed metadata catalogue. The free weekly workflow
(`.github/workflows/watch-library.yml`) sweeps trusted RSS feeds, verifies the
actual Shorts URL, India availability, duration, safety signals, thumbnail and
embed response, caps additions at 12 (two per channel), refreshes live health
before pruning, and opens one review PR containing separate Watch and Shorts
diffs. Monthly API discovery is optional and uses the existing
`YOUTUBE_API_KEY`. The Monday refresh checks the union of Watch and Shorts IDs
with `status`, `contentDetails` and `statistics`, dropping confirmed private,
unprocessed, non-embeddable, India-blocked, age-restricted and made-for-kids
Shorts. The store keeps only aggregate Shorts session counters and startup/
unavailable totals.

## Run Locally

```bash
npm install
npm run dev
```

Local dev serves the Vite frontend with the API mounted in development.

Standalone API:

```bash
npm run serve
```

Build check:

```bash
npm run build
npm test
```

Data rebuilds:

```bash
npm run scrape
node scripts/build_indian_cocktails.mjs
node scripts/fill_india_videos.mjs
npm run videos
```

The India build also regenerates `docs/india-cocktail-field-guide.md`, the existing-recipe index, and its machine-readable source ledger. The video pass validates direct YouTube links and records titles, match type, query, review notes, and check date in `data/indian_cocktail_video_audit.json`. The 59 new or previously unillustrated India recipes use distinct local 720×900 WebP card art under `public/images/india`; one remaining legacy house card is under `public/images/house`, and existing classics retain their established recipe photography.

## Environment

`.env.example` documents the LLM settings:

```text
LLM_API_KEY=
LLM_MODEL=gemini-3.5-flash
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
LLM_TEMPERATURE=0.2
LLM_TIMEOUT_SECONDS=45
```

Without `LLM_API_KEY`, the app still runs. AI photo detection is disabled and recipe generation falls back safely.

## Deployment

- Frontend: static Vite deployment on Vercel.
- API: Express service deployable on Render through `render.yaml`.
- Runtime API base: `VITE_API_BASE`, plus browser override with `localStorage.setItem('pubcrawl.api', 'https://...')`.
- Durable store: set `KV_REST_API_URL` and `KV_REST_API_TOKEN` or the `UPSTASH_REDIS_REST_*` equivalents.

## Screenshots To Add

Add current images before sharing widely:

- Menu search and cocktail grid.
- Bar shelf with matched recipes.
- Photo ingredient-identification flow.
- Generated house-special recipe card.
- Tab/share page.

## AI Usage Transparency

This was an AI-assisted portfolio project built with modern coding assistants for rapid prototyping and implementation support. The value of the repository is in the product workflow, code structure, integration decisions, prompt constraints, fallback behavior, and the ability to explain and maintain the final system.

## Current Limitations

- The dependency-free `node:test` suite covers Shorts schema, duplicates,
  lane/duration limits, dead filtering, catalogue limits and metrics payloads.
- Photo identification requires a configured LLM provider key.
- Free hosting tiers can sleep, so first API calls may be slower after inactivity.
- Public likes are browser-limited client-side and should not be treated as abuse-proof analytics.
- The app is a portfolio/learning project, not a commercial bar-management system.

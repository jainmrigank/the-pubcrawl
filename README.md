# The PubCrawl

AI-assisted cocktail discovery app for searching a cocktail catalogue, matching recipes to a home shelf, identifying ingredients from photos, and generating original house-special recipes.

Live app: https://the-pubcrawl.vercel.app

## Recruiter Quick Read

The PubCrawl is a React, TypeScript, Vite, Express, and LLM-backed project focused on API-driven user workflows. It is relevant to agentic engineering because the app turns user context into structured actions: search, ingredient matching, photo-based extraction, generated recipe drafting, fallback handling, persistence, and deployment across separate frontend/API services.

It is not positioned as production AI employment experience. It is a hands-on portfolio project built to practice reliable AI workflows, prompt design, JSON handling, API integration, graceful degradation, and rapid product delivery.

## What It Does

- Searches a 611-cocktail catalogue by drink, ingredient, category, classic designation, or mood.
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
```

Data rebuilds:

```bash
npm run scrape
npm run videos
```

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

- No formal test suite is included yet.
- Photo identification requires a configured LLM provider key.
- Free hosting tiers can sleep, so first API calls may be slower after inactivity.
- Public likes are browser-limited client-side and should not be treated as abuse-proof analytics.
- The app is a portfolio/learning project, not a commercial bar-management system.

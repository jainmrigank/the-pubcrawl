# MIXLAB — The Cocktail Index

Tell MixLab what's on your shelf — type it or photograph it — and it deals out
flash cards from a scraped 441-cocktail index: what pours now, what's one
bottle short, and machine-drafted originals composed from exactly your
ingredients. Plus a field manual covering the working language of mixology.

Minimal brutalist editorial UI: warm paper / near-black ink, one burnt-sienna
accent, Archivo (condensed grotesk display) + Space Mono, hairline grids,
masked line reveals and inverted hovers (Framer Motion + CSS).

## Features

- **Scraped recipe library** — `npm run scrape` pulls every drink on
  TheCocktailDB (full-resolution photography, IBA classifications) into
  `data/cocktails.json`.
- **Video coverage for nearly every drink** — `node scripts/fetch_videos.mjs`
  finds a how-to YouTube video per cocktail by scraping search results into
  `data/videos.json`; anything still missing falls back to a YouTube
  search-playlist embed, so WATCH always plays something.
- **Two searches** — the ingredient typeahead (`/api/ingredients/search`,
  ~400 entries incl. a curated world-spirits list) and a cocktail search over
  the index by name or ingredient (`/api/recipes?q=`).
- **Photo identification** — drop a photo of bottles/produce; LLM vision
  (`POST /api/identify`) names everything and offers one-tap adds.
- **Smart matching** — `POST /api/recipes/match` scores recipes against your
  shelf with alias groups (white ↔ light rum, bourbon ↔ whiskey…), staples
  assumed free. Cards state READY TO POUR or list exactly what's missing.
- **Machine-drafted originals** — every press of DRAFT AN ORIGINAL is a real
  LLM call (previous names are sent to avoid repeats; a random flavour cue
  varies direction). If the configured model is over quota the server walks a
  verified fallback-model chain; only if *all* models fail does the offline
  house template answer — and the card is labelled HOUSE DRAFT vs MACHINE
  DRAFT so you can tell.
- **Field manual** — techniques, tools, glassware and vocabulary, each term
  defined with a custom geometric line icon. Glass types render as icons on
  every card; ingredients show small images everywhere they're listed.
- **Six moods, colour-coded** — muted swatches (tropical, fresh & citrus,
  spirit-forward, dessert, warm, party & shots) tag and filter every card.

## Run

```bash
npm install
npm run scrape                  # once — builds data/cocktails.json
node scripts/fetch_videos.mjs   # once — builds data/videos.json (~8 min)
npm run dev                     # http://localhost:5175 — API mounted inside Vite
```

The API can also run standalone: `node server/index.mjs` (port 8790).

## LLM config

`LLM_API_KEY`, `LLM_BASE_URL` (OpenAI-compatible) and `LLM_MODEL` are read
from `cocktail-app/.env` or the parent `New project/.env`. Fallback model
chain lives in `server/llm.mjs`.

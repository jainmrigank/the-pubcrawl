# The PubCrawl — what's your poison?

Hop from drink to drink without leaving the kitchen. Tell The PubCrawl what's
on your shelf — type it or photograph it — and it deals out flash cards from a
441-cocktail bar: what pours right now, what's one bottle short, and brand-new
house specials invented from exactly your ingredients. Plus Bar Basics: the
techniques, tools, glassware and lingo worth knowing, measurements included.

Minimal brutalist editorial UI with a handwritten streak: warm paper /
near-black ink, one burnt-sienna accent, Archivo (condensed grotesk display) +
Space Mono + Caveat wordmark, hand-sketched glyphs (SVG turbulence filter),
hairline grids, masked line reveals and inverted hovers (Framer Motion + CSS).

## Features

- **Search from the landing page** — the hero search covers all 441 drinks by
  name or ingredient; a mood filter (six colour-coded vibes) narrows every list.
- **Scraped recipe bar** — `npm run scrape` pulls every drink on TheCocktailDB
  (full-resolution colour photography, classic designations) into
  `data/cocktails.json`.
- **A video for nearly every drink** — `node scripts/fetch_videos.mjs` finds a
  how-to YouTube video per cocktail into `data/videos.json` (resumable; YouTube
  throttles bursts). Anything missing falls back to a search-playlist embed, so
  WATCH IT MADE always plays something.
- **Photo identification** — drop a photo of bottles/produce; vision AI
  (`POST /api/identify`) names everything and offers one-tap adds.
- **Smart matching** — `POST /api/recipes/match` scores recipes against your
  shelf with alias groups (white ↔ light rum, bourbon ↔ whiskey…), staples
  assumed free. Cards say READY TO POUR or exactly what they still need.
- **House specials** — every press of MIX ME SOMETHING NEW is a real AI call
  (previous names are excluded, a random flavour cue varies direction). If the
  configured model is busy the server walks a fallback-model chain; only if all
  models fail does an offline template answer, and the card says so.
- **Bar Basics** — techniques, tools, glassware, measurements (what's an oz?)
  and the lingo, each with a hand-drawn glyph, in an indexed accordion.

## Run

```bash
npm install
npm run scrape                  # once — builds data/cocktails.json
node scripts/fetch_videos.mjs   # once — builds data/videos.json (~10 min)
npm run dev                     # http://localhost:5175 — API mounted inside Vite
```

The API can also run standalone: `node server/index.mjs` (port 8790).

## AI config

`LLM_API_KEY`, `LLM_BASE_URL` (OpenAI-compatible) and `LLM_MODEL` are read from
`.env` (see `.env.example`). The fallback model chain lives in `server/llm.mjs`.
Without a key the bar still works fully; photo ID and house specials degrade
gracefully.

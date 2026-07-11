# The PubCrawl — what's your poison?

Hop from drink to drink without leaving the kitchen. Search a 611-cocktail
menu, tell the bar what's on your shelf (type it or photograph it), and get
flash cards for what pours right now, what's one bottle short, and brand-new
house specials invented from exactly your ingredients.

Live at **https://the-pubcrawl.vercel.app** (frontend) with the API served
separately — see Deployment below.

## Pages

- **The Menu** (`#/menu`) — the landing page. Hero search over every drink,
  a browsable grid, mood filter, MOST LOVED ranking and SURPRISE ME shuffle.
- **The Bar** (`#/bar`) — Your Shelf (ingredient typeahead + photo upload)
  and Pour Tonight (what you can make, near misses, AI house specials).
- **Basics** (`#/basics`) — Bar Basics: techniques, tools, glassware, the
  lingo (measurements included) and The Starter Shelf.
- **The Tab** (`#/tab`) — your saved shortlist for the night.

Pages stay mounted while you switch, so scroll position, search, flipped
cards and accordions are all exactly where you left them.

## Features

- **Drink search & browse** — search by name, ingredient, category or classic
  designation across all 611 drinks. Six colour-coded moods filter every list
  (applied server-side). SHOW 12 MORE paginates; SURPRISE ME reshuffles.
- **Most Loved** — a public like system. The heart on any card counts likes
  across every visitor (stored server-side in `data/likes.json`); the MOST
  LOVED toggle ranks the menu by them. One like per browser, remembered in
  localStorage.
- **Your Shelf** — an ingredient typeahead over ~430 known ingredients
  (spirits, liqueurs, herbs, bitters, free text allowed), or drop a photo and
  vision AI identifies bottles/produce and shelves them automatically.
- **Pour Tonight** — recipes scored against your shelf with alias groups
  (white ↔ light rum, bourbon ↔ whiskey…); staples like ice and sugar are
  assumed. Cards read READY TO POUR or list exactly what's missing.
- **House Specials** — every press of MIX ME SOMETHING NEW is a real LLM call
  composing an original recipe from your exact shelf (with a model fallback
  chain if the primary is over quota; an offline template answers only if all
  models fail, clearly labelled OFF-MENU).
- **Flash cards** — colour photography, hand-drawn glass icons, flip for the
  spec sheet. Corner actions on both faces: put it on your tab, and share
  (native share sheet where available, clipboard copy otherwise). WATCH IT
  MADE plays the drink's YouTube video (610 of 611 covered).
- **The Tab** — a curated menu of the night. Saved in localStorage so it
  survives closing the browser; SHARE THE TAB sends the whole lineup as a
  formatted text menu.
- **Bar Basics** — collapsible groups: Technique, Tools, Glassware, The Lingo
  (what's an oz? dash? ratio?) and The Starter Shelf (the fourteen bottles and
  staples that open up most of the menu), each entry with a hand-drawn glyph.

## Design

Minimal brutalist editorial with a handwritten streak: warm paper and
near-black ink, one burnt-sienna accent, Archivo (condensed grotesk display) +
Space Mono + a Caveat wordmark, hand-sketched SVG glyphs, hairline grids,
masked line reveals and inverted hovers (Framer Motion + CSS, reduced-motion
aware).

## Run locally

```bash
npm install
npm run dev        # http://localhost:5175 — API mounted inside Vite
```

Data is committed; to rebuild it:

```bash
npm run scrape     # TheCocktailDB catalogue (letter pass + category sweep)
npm run videos     # YouTube link per drink (resumable; re-run to fill gaps)
```

## Deployment: Vercel frontend + tunnelled API

The frontend is a static Vite build (Vercel auto-detects it). The Express API
runs wherever you like and is announced to the frontend via `VITE_API_BASE`.

1. **Run the API** on the machine that has the data + LLM key:

   ```bash
   npm run serve            # standalone API on http://localhost:8790
   ```

2. **Tunnel it** (ngrok). One free ngrok agent session can carry several
   tunnels when they're defined in ngrok.yml and started together:

   ```bash
   ngrok start --all        # main-app (reserved domain) + pubcrawl
   ```

   The free plan includes a single reserved domain; extra tunnels get a fresh
   random URL each start. Either give The PubCrawl the reserved domain, accept
   the rotating URL, or upgrade for a second reserved domain.

3. **Point the frontend at it**: in Vercel → Project → Settings →
   Environment Variables set `VITE_API_BASE` to the tunnel URL and redeploy.
   For a quick switch without redeploying (per-browser):
   `localStorage.setItem('pubcrawl.api', 'https://your-tunnel-url')`.

CORS is open on the API, and requests carry `ngrok-skip-browser-warning`
automatically when the base URL is an ngrok domain.

## AI config

`LLM_API_KEY`, `LLM_BASE_URL` (OpenAI-compatible) and `LLM_MODEL` are read
from `.env` (see `.env.example`). Without a key the bar still works fully;
photo ID and house specials degrade gracefully.

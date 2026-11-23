# The PubCrawl

AI-assisted cocktail discovery app for searching a cocktail catalogue, matching recipes to a home shelf, identifying ingredients from photos, and generating original house-special recipes.

Primary domain: https://thepubcrawl.in

Vercel address: https://the-pubcrawl.vercel.app

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

## Website Analytics

First-party analytics use the API’s Upstash storage. Deploy the API with its Redis bindings and a private `PUBCRAWL_BUSINESS_ADMIN_KEY` of at least 32 characters. Use a randomly generated key such as the output of `openssl rand -hex 32`. Keep the key in the API runtime and an owner password manager. Set the frontend’s `VITE_API_BASE` to the deployed API origin before building. Enter the key at `/ops/` to see traffic, campaign placements, recipe and Shelf engagement, enquiries, confirmed signups and sales. The lead list is private and lets the owner mark enquiries qualified or won.

For a Cloudflare Worker deployment, set the access key with `npx wrangler secret put PUBCRAWL_BUSINESS_ADMIN_KEY --config worker/wrangler.jsonc`. Confirm the API’s existing `KV_REST_API_URL` and `KV_REST_API_TOKEN` bindings are present. The first-party tracker and the enquiry forms operate with those bindings. Payment and email credentials activate the separate checkout, delivery and subscription features.

Open `/recipes/whiskey-sour/?utm_source=instagram&utm_medium=organic_social&utm_campaign=pubcrawl_daily&utm_content=launch_story` in a fresh browser tab. Continue to Shelf, add an ingredient, then save a recipe to Tab. In `/ops/`, verify one Instagram visit, the recipe entry page and the engagement actions. The dashboard also shows the share of visits that start at a phone-width viewport and the share of enquiries that qualify. Submit a clearly marked test enquiry and check the status workflow. Repeat from Instagram’s in-app browser after launch. Visits are deduplicated per tab and India day. The tab visit expires after 30 minutes of inactivity.

The tracker respects Do Not Track, Global Privacy Control and the browser preference at `/privacy/`. Analytics payloads contain allowlisted events, paths and campaign labels. Keep contact details out of campaign tags. Order capture and newsletter confirmations are counted by the server. If a separate Umami property is useful, build with `VITE_UMAMI_WEBSITE_ID` to mirror app views and interaction events there. Use separate properties for preview and production. [Umami setup](https://docs.umami.is/docs/add-a-website).

For X, tag a link to the [batching guide](https://thepubcrawl.in/batch-mocktails-for-10/?utm_source=x&utm_medium=organic_social&utm_campaign=hosting_launch&utm_content=batch_guide_thread). For YouTube, tag a link to the [free menu](https://thepubcrawl.in/hosting-sample/?utm_source=youtube&utm_medium=video&utm_campaign=hosting_launch&utm_content=mocktail_prep_description). Change `utm_content` for each placement. The Instagram renderer generates distinct bio and Story links. Google organic visits can arrive through indexed pages and appear under `search` when a search referrer is available.

## Commercial pages

Vercel builds default to `VITE_PUBCRAWL_COMMERCIAL=0`, which publishes free recipes, the free menu, the planner and site analytics. Set `VITE_PUBCRAWL_COMMERCIAL=1` in the build environment on a plan or host that permits commercial use to include the paid offers and their forms. Local builds include the full site by default.

The Cloudflare deployment uses Workers Static Assets for the site and the separate existing Worker for the API. Build and deploy the static site with:

```bash
VITE_PUBCRAWL_COMMERCIAL=1 VITE_API_BASE=https://pubcrawl-api.jainmrigank3sgta.workers.dev npm run build
npx wrangler deploy --config wrangler.site.jsonc
```

The `thepubcrawl.in/*` Worker route is declared in `wrangler.site.jsonc`. The apex uses Cloudflare-proxied placeholder records (`192.0.2.1` and `100::`). The proxied `www` CNAME points to the apex and a Cloudflare redirect rule keeps the path and query string. Universal SSL and Always Use HTTPS are enabled. The `workers.dev` preview uses a `noindex` response header. After deploying, check the HTTPS homepage, a recipe with UTM tags, `/sitemap.xml`, `/ops/`, the app and the `www` redirect. [Cloudflare static asset pricing and limits](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), [Worker routes](https://developers.cloudflare.com/workers/configuration/routing/routes/).

`npm run build` produces static HTML for the social entry, ten recipes, hosting pack and sample, business brief, Gurgaon workshop, buying guide and privacy page. The build uses the source photos under `scripts/instagram/photos/` and checks them against `scripts/site-recipe-photos.json`. The recipe pages have canonical URLs, share images and structured data. The homepage carries Google's URL-prefix verification tag for `https://thepubcrawl.in/`. Keep the tag in place across host changes and use `VITE_GOOGLE_SITE_VERIFICATION` if another URL-prefix verification tag is needed. Domain properties use DNS verification. The Search Console sitemap URL is `https://thepubcrawl.in/sitemap.xml`. Inspect the homepage, one recipe URL and the hosting page after submitting. [Search Console ownership](https://support.google.com/webmasters/answer/9008080), [sitemap submission](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

- **Hosting Pack checkout.** Configure a verified Resend sender with `RESEND_API_KEY` and `PUBCRAWL_EMAIL_FROM`. Set `PUBCRAWL_CONTACT_EMAIL`, `PUBCRAWL_MERCHANT_NAME`, and an independently generated `PUBCRAWL_BUSINESS_SIGNING_KEY`. Preserve the signing key across releases so issued links continue working. Configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`. In Razorpay, register `<api-origin>/api/business/webhook/razorpay` for `payment_link.paid` and `refund.processed`. Start in test mode and verify payment, the order page, the delivery email, the file and refund reconciliation before switching to live keys. Verify UPI availability and the seller’s invoicing and refund terms in the merchant account. The dashboard separates test payments from confirmed live sales. [Razorpay Payment Links](https://razorpay.com/docs/api/payments/payment-links/), [Razorpay webhooks](https://razorpay.com/docs/webhooks/payment-links/), [Resend sender domains](https://resend.com/docs/dashboard/domains/introduction).
- **Sample and email list.** The sample opens without signup. Configuring Resend, the support email and signing key enables the optional confirmation form. The owner dashboard exports active subscribers with an individual unsubscribe link. Use that link in each newsletter. The app sends transactional confirmations and receipts.
- **Workshop.** Use the private enquiry list for group quotes. Once an event is agreed, set `PUBCRAWL_WORKSHOP_JSON` with `date` (ISO timestamp), `venue`, `price` (rupees per seat), `capacity`, `booking` (the partner’s HTTPS ticketing link), and `cancellation`. The partner handles available seats and payments.
- **Affiliate guide.** Set `PUBCRAWL_AFFILIATE_LINKS_JSON` to an object of approved HTTPS links keyed by `jigger`, `shaker`, `strainer` or `soda`. The link label and tracking update when an affiliate URL is present.

For local verification, start `npm run dev` or `npm run preview` with a local `PUBCRAWL_BUSINESS_ADMIN_KEY`. Both use an isolated in-memory business store and accept Razorpay test keys for checkout. Use a test email address and a test sender to verify provider delivery. The dashboard subtracts processed refunds and fees reported by Razorpay. Reconcile those figures against the provider’s settlement reports. Check the hosting plan permits commercial use before releasing paid offers. [Vercel fair use](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage).

## Deployment

- Frontend: static Vite deployment on Cloudflare Workers Static Assets via `pubcrawl-site` on the Free plan.
- Custom domain: `thepubcrawl.in` is registered at GoDaddy and uses Cloudflare DNS. Keep the registration and required `.in` KYC current. `www.thepubcrawl.in` redirects to the apex domain.
- API: Cloudflare Worker `pubcrawl-api`; Express on Render through `render.yaml` is the fallback.
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

/**
 * Cocktail API — mounted as Vite middleware in dev (see vite.config.ts),
 * or run standalone via `node server/index.mjs` (e.g. behind an ngrok tunnel
 * feeding the Vercel-hosted frontend).
 */
import './env.mjs'; // must run before store.mjs / push keys read process.env
import express from 'express';
import webpush from 'web-push';
import {
  loadCatalog,
  searchIngredients,
  matchRecipes,
  recipeSearchScore,
  categorise,
  norm,
  visibleRecipes,
} from './catalog.mjs';
import { VIBES, withVibe } from './vibes.mjs';
import { recipePage, RecipeQueryError } from './recipe-query.mjs';
import { chat, extractJson, llmAvailable, llmConfig } from './llm.mjs';
import { generateFallback, generateZeroProofFallback } from './generator.mjs';
import { buildNudge, buildDailyQuestionNudge, WELCOME } from './push.mjs';
import { playlistSlice, questionOfDay, QUESTIONS } from './quiz.mjs';
import { buildLibrary, VIDEOS } from './videos.mjs';
import { buildShortLibrary, SHORTS } from './shorts.mjs';
import { validateShortSession } from './shorts-schema.mjs';
import { validateWatchEvent } from './watch-schema.mjs';
import { classifyVideoStatus } from './youtube-health.mjs';
import {
  initStore,
  storeMode,
  getLikes,
  saveLikes,
  getKept,
  addKept,
  getSubs,
  addSub,
  removeSub,
  touchSub,
  getHall,
  addToHall,
  getVideoStats,
  saveVideoStats,
  getShortMetrics,
  recordShortSession,
  getWatchMetrics,
  recordWatchEvent,
  getHighScore,
  submitScore,
} from './store.mjs';

export async function createApp() {
  await initStore();
  const app = express();
  const PUSH_SECRET = process.env.PUSH_SECRET || '';
  app.use(express.json({ limit: '15mb' }));

  // CORS: the frontend may be served from another origin (Vercel) while the
  // API runs here. Wide-open is fine for a public read-mostly menu API.
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, x-push-secret, ngrok-skip-browser-warning');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  const { cocktails, ingredients } = loadCatalog();
  const validIds = new Set(cocktails.map((c) => c.id));

  // fold in drinks visitors have kept from house specials, so they persist in
  // the menu across restarts
  for (const d of getKept()) {
    if (!validIds.has(d.id)) {
      d.house = true;
      cocktails.push(d);
      validIds.add(d.id);
    }
  }
  console.log(`[cocktail-api] ${cocktails.length} cocktails (${getKept().length} kept), ${ingredients.length} ingredients, LLM: ${llmAvailable() ? llmConfig.model : 'offline fallback'}, store: ${storeMode()}`);

  /* ---- public likes (shared across every visitor, durable via the store) ---- */
  app.get('/api/likes', (_req, res) => res.json(getLikes()));

  app.post('/api/likes/:id', (req, res) => {
    const { id } = req.params;
    if (!validIds.has(id)) return res.status(404).json({ error: 'Unknown drink' });
    const likes = { ...getLikes() };
    const delta = req.body?.action === 'unlike' ? -1 : 1;
    const next = Math.max(0, (likes[id] || 0) + delta);
    if (next === 0) delete likes[id];
    else likes[id] = next;
    saveLikes(likes);
    res.json({ id, likes: next });
  });

  /* ---- keep a house special: give it a stable id and add it to the menu ---- */
  function keptId(r) {
    const s = `${r.name}|${(r.ingredients || []).map((i) => i.name).join(',')}`.toLowerCase();
    let h = 5381;
    for (const ch of s) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
    return `kept-${h.toString(36)}`;
  }

  app.post('/api/keep', (req, res) => {
    const r = req.body?.recipe || req.body;
    if (!r?.name || !Array.isArray(r.ingredients) || !r.ingredients.length)
      return res.status(400).json({ error: 'recipe required' });
    const id = keptId(r);
    let drink = cocktails.find((c) => c.id === id);
    if (!drink) {
      drink = {
        id,
        name: String(r.name),
        tagline: String(r.tagline || ''),
        category: 'Kept Special',
        alcoholic: String(r.alcoholic || 'Alcoholic'),
        glass: String(r.glass || 'Coupe'),
        instructions: String(r.instructions || ''),
        thumb: '',
        video: '',
        tags: Array.isArray(r.tags) ? r.tags : [],
        iba: '',
        ingredients: r.ingredients.map((i) => ({ name: String(i.name || ''), measure: String(i.measure || '') })),
        source: r.source === 'fallback' ? 'fallback' : 'ai',
        house: true,
        kept: true,
        // Kept AI/fallback drinks are legitimate browseable recipes even when
        // they have no verified photograph. The final catalogue audit only
        // governs the fixed 691 records; this explicit admission keeps the
        // user's saved special visible without inventing media.
        browseable: true,
      };
      withVibe(drink);
      if (r.vibe && Object.keys(VIBES).includes(r.vibe)) drink.vibe = r.vibe;
      cocktails.push(drink);
      validIds.add(id);
      addKept(drink);
    }
    res.json(drink);
  });

  app.get('/api/health', (_req, res) =>
    res.json({
      ok: true,
      cocktails: visibleRecipes(cocktails).length,
      catalogueCocktails: cocktails.length,
      ingredients: ingredients.length,
      llm: llmAvailable() ? llmConfig.model : null,
    })
  );

  app.get('/api/vibes', (_req, res) => res.json(Object.values(VIBES)));

  /* ---- dedicated typeahead API ---- */
  app.get('/api/ingredients/search', (req, res) => {
    const q = String(req.query.q || '');
    const limit = Math.min(Number(req.query.limit) || 12, 30);
    res.json(searchIngredients(ingredients, q, limit));
  });

  /* ---- browse / featured ---- */
  app.get('/api/recipes', (req, res) => {
    try {
      res.json(recipePage(cocktails, getLikes(), req.query));
    } catch (error) {
      if (error instanceof RecipeQueryError) return res.status(400).json({ error: error.message });
      throw error;
    }
  });

  /* ---- match pantry -> recipes ---- */
  app.post('/api/recipes/match', (req, res) => {
    const pantry = Array.isArray(req.body?.ingredients) ? req.body.ingredients.map(String) : [];
    if (!pantry.length) return res.json({ canMake: [], almost: [] });
    const q = String(req.body?.q || '');
    // Filter the full catalogue before the matcher's 24-card result cap. This
    // lets a shelf search retrieve a matching lane/glass/access result even if
    // it was not present in the unfiltered first page.
    const candidates = q.trim()
      ? cocktails.filter((recipe) => recipeSearchScore(recipe, q) >= 0)
      : cocktails;
    res.json(matchRecipes(candidates, pantry));
  });

  /* ---- identify ingredients in an uploaded photo (LLM vision) ---- */
  app.post('/api/identify', async (req, res) => {
    const { imageBase64, mimeType } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });
    if (!llmAvailable())
      return res.status(503).json({ error: 'Photo recognition isn\'t set up yet. Add an API key to .env to switch it on.' });
    try {
      const reply = await chat(
        [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'You are a bartender\'s assistant. Identify every cocktail-relevant ingredient visible in this photo — spirits, liqueurs, wine/beer, bitters, mixers, juices, syrups, fruit, herbs, spices, dairy, egg. Use short generic names (e.g. "gin", "lime", "mint leaves", "angostura bitters", "tonic water"), naming the specific spirit/liqueur type when a label is readable (e.g. "mezcal", "aperol"). Respond ONLY with a JSON array of strings. If nothing relevant is visible, respond with [].',
              },
              { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}` } },
            ],
          },
        ],
        { temperature: 0.1 }
      );
      const names = extractJson(reply);
      if (!Array.isArray(names)) throw new Error('Expected a JSON array');
      const detected = [...new Set(names.map((n) => String(n).trim()).filter(Boolean))].map((name) => {
        const [hit] = searchIngredients(ingredients, name, 1);
        const resolved = hit && norm(hit.name).includes(norm(name).split(' ')[0]) ? hit : null;
        return resolved
          ? { ...resolved, detectedAs: name }
          : { name, category: categorise(name), image: '', detectedAs: name };
      });
      res.json({ detected });
    } catch (err) {
      console.error('[identify]', err.message);
      res.status(502).json({ error: `Couldn't read that photo. ${err.message}` });
    }
  });

  /* ---- invent a brand-new recipe ---- */
  app.post('/api/generate', async (req, res) => {
    const pantry = Array.isArray(req.body?.ingredients) ? req.body.ingredients.map(String).filter(Boolean) : [];
    const vibe = String(req.body?.vibe || '');
    const avoid = Array.isArray(req.body?.avoid) ? req.body.avoid.map(String).slice(0, 10) : [];
    const taste = Array.isArray(req.body?.taste) ? req.body.taste.map(String).slice(0, 8) : [];
    if (!pantry.length) return res.status(400).json({ error: 'ingredients required' });

    const knownIngredientNames = new Set(ingredients.map((ingredient) => norm(ingredient.name)));
    const zeroProofIngredients = (items) => items.every((ingredient) => {
      const name = String(ingredient.name || '').trim();
      return name && knownIngredientNames.has(norm(name)) && !['Spirit', 'Liqueur', 'Wine & Fortified', 'Beer & Cider'].includes(categorise(name));
    });

    const MOODS = {
      tropical: 'tropical and sunny',
      refreshing: 'fresh, citrusy and light',
      boozy: 'spirit-forward and stiff',
      sweet: 'dessert-like and indulgent',
      cozy: 'warm and comforting',
      party: 'a fun, punchy party serve',
      zeroproof: 'strictly zero-proof: no alcohol in any ingredient, not even a dash',
      indian: 'distinctly Indian: lean on Indian flavours such as kokum, tamarind, gondhoraj lime, masala spices, jaggery, cardamom, curry leaf, coconut or filter coffee, and give it an evocative Indian name',
    };

    if (llmAvailable()) {
      let lastError;
      const attempts = vibe === 'zeroproof' ? 2 : 1;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
        const cue = ['bitter-forward', 'herbal', 'silky', 'effervescent', 'smoky', 'bright and tart', 'aromatic', 'bone-dry', 'lightly sweet', 'savoury'][Math.floor(Math.random() * 10)];
        const reply = await chat(
          [
            {
              role: 'system',
              content:
                'You are a world-class mixologist who invents original, balanced, practical cocktails for a home bar. Always respond with a single JSON object, no prose.',
            },
            {
              role: 'user',
              content: `Invent ONE original cocktail for a guest at a home bar.

THE SHELF (build the drink around these): ${pantry.join(', ')}
THE MOOD: ${MOODS[vibe] ? `make it ${MOODS[vibe]}` : 'bartender’s choice: read the shelf and surprise the guest'}.
${
  taste.length
    ? `THE GUEST’S TAB TONIGHT (drinks they saved; read their palate from these and lean toward it):\n${taste.map((t) => `- ${t}`).join('\n')}`
    : 'The guest has no saved drinks yet: assume a curious drinker who enjoys balanced, crowd-pleasing serves with one memorable twist.'
}

RULES:
- Use shelf items as the backbone of the drink. You may add at most 2 ingredients that are not on the shelf, and only if they are cheap, common bar staples (fresh citrus, an everyday syrup, a soda, common bitters). Nothing obscure or laboratory-like: never saline solution, never burnt sugar syrup.
- 3 to 7 ingredients, realistic measures in ml and dashes, balanced base : sour : sweet.
- Be clearly different from these earlier drafts tonight; change the base spirit, the technique or the serve: ${avoid.length ? avoid.join('; ') : 'none yet'}.
- Lean ${cue}.
- Give it a creative, evocative name that is not an existing cocktail, and clear step-by-step instructions.

Respond with JSON exactly like:
{"name": "...", "tagline": "one poetic sentence", "vibe": "tropical|refreshing|boozy|sweet|cozy|party|zeroproof", "glass": "...", "ingredients": [{"name": "...", "measure": "..."}], "instructions": "...", "garnish": "..."}`,
            },
          ],
          { temperature: 0.95 }
        );
        const r = extractJson(reply);
        const generatedIngredients = (Array.isArray(r.ingredients) ? r.ingredients : []).map((i) => ({
          name: String(i.name || '').trim(),
          measure: String(i.measure || ''),
        })).filter((i) => i.name);
        if (vibe === 'zeroproof' && (!generatedIngredients.length || !zeroProofIngredients(generatedIngredients))) {
          throw new Error('Generated Zero Proof recipe contained an unknown or alcoholic ingredient');
        }
        const drink = {
          id: `custom-${Date.now()}`,
          name: String(r.name || 'The Unnamed'),
          tagline: String(r.tagline || ''),
          category: 'AI Original',
          alcoholic: vibe === 'zeroproof' ? 'Non alcoholic' : 'Alcoholic',
          glass: String(r.glass || 'Coupe'),
          instructions: String(r.instructions || '') + (r.garnish ? ` Garnish with ${r.garnish}.` : ''),
          thumb: '',
          video: '',
          tags: ['AI Original'],
          iba: '',
          ingredients: generatedIngredients,
          source: 'ai',
        };
        if (vibe === 'zeroproof') drink.vibe = 'zeroproof';
        else if (Object.keys(VIBES).includes(r.vibe)) drink.vibe = r.vibe;
        else withVibe(drink);
        return res.json(drink);
        } catch (err) {
          lastError = err;
          if (attempt + 1 < attempts) continue;
        }
      }
      if (lastError) console.error('[generate] LLM failed, falling back:', lastError.message);
    }
    res.json(vibe === 'zeroproof' ? generateZeroProofFallback(pantry, ingredients) : generateFallback(pantry, avoid));
  });

  /* ================= last orders (the quiz) ================= */
  // an endless run, streamed in batches; `seed` keeps one run's order stable
  app.get('/api/quiz/stream', (req, res) => {
    const seed = String(req.query.seed || 'x');
    const from = Math.max(Number(req.query.from) || 0, 0);
    const count = Math.min(Math.max(Number(req.query.count) || 20, 1), 50);
    const { questions, total } = playlistSlice(seed, from, count);
    res.json({ questions, total, high: getHighScore().score });
  });

  app.get('/api/quiz/high', (_req, res) =>
    res.json({ ...getHighScore(), hall: getHall(), bank: QUESTIONS.length })
  );

  app.post('/api/quiz/high', (req, res) => {
    const score = Number(req.body?.score);
    if (!Number.isFinite(score) || score < 0 || score > 1000)
      return res.status(400).json({ error: 'bad score' });
    const beaten = submitScore(score);
    res.json({ ...getHighScore(), beaten });
  });

  // the wall: only a run that cleared every question in the bank gets on it
  app.post('/api/quiz/hall', (req, res) => {
    const score = Number(req.body?.score);
    if (score !== QUESTIONS.length)
      return res.status(400).json({ error: 'not a clean sweep' });
    const entry = addToHall(req.body?.name, score);
    if (!entry) return res.status(400).json({ error: 'need a name' });
    res.json({ hall: getHall(), entry });
  });

  // one question a day, the same for everyone
  app.get('/api/quiz/today', (_req, res) => {
    const q = questionOfDay();
    if (!q) return res.status(503).json({ error: 'no questions loaded' });
    res.json(q);
  });


  /* ================= the watch shelf ================= */
  app.get('/api/videos', (_req, res) => res.json(buildLibrary(getVideoStats())));

  /** Anonymous Watch discovery counters: no video id, user, or device data. */
  app.post('/api/watch/event', (req, res) => {
    const parsed = validateWatchEvent(req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    res.json({ ok: true, metrics: recordWatchEvent(parsed.value) });
  });

  app.get('/api/watch/status', (req, res) => {
    const token = req.get('x-push-secret') || '';
    if (!PUSH_SECRET || token !== PUSH_SECRET) return res.status(401).json({ error: 'unauthorized' });
    const metrics = getWatchMetrics();
    res.json({
      ...metrics,
      landingPreviewClickThroughRate: metrics.impressions ? Number((metrics.landingOpens / metrics.impressions).toFixed(4)) : 0,
      sourceTotals: {
        landing: metrics.landingOpens,
        nav: metrics.navOpens,
        deepLink: metrics.deepLinkOpens,
        direct: metrics.directOpens,
      },
    });
  });

  /* ================= the Shorts shelf ================= */
  app.get('/api/shorts', (_req, res) => res.json(buildShortLibrary(getVideoStats())));

  /** Anonymous, capped counters only. No account, device, or viewing history is accepted. */
  app.post('/api/shorts/session', (req, res) => {
    const parsed = validateShortSession(req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    res.json({ ok: true, metrics: recordShortSession(parsed.value) });
  });

  app.get('/api/shorts/status', (req, res) => {
    const token = req.get('x-push-secret') || '';
    if (!PUSH_SECRET || token !== PUSH_SECRET) return res.status(401).json({ error: 'unauthorized' });
    const metrics = getShortMetrics();
    res.json({
      ...metrics,
      averageShortsPerSession: metrics.sessions ? Number((metrics.videosStarted / metrics.sessions).toFixed(2)) : 0,
      averageStartupMs: metrics.videosStarted ? Math.round(metrics.startupMsTotal / metrics.videosStarted) : 0,
      conversions: {
        landing: metrics.landingSessions,
        navigation: metrics.navSessions,
        deepLink: metrics.deepLinkSessions,
      },
    });
  });

  /**
   * Refreshes view counts and checks every embed still works. Fired weekly by
   * a scheduled workflow, never by a visitor: it is slow, it is rate-limited
   * upstream, and nobody should wait on it to see the page.
   *
   * Without YOUTUBE_API_KEY it still runs, doing the health check alone. That
   * is the half that actually protects the page, since a dead embed is worse
   * than a missing view count.
   */
  app.post('/api/videos/refresh', async (req, res) => {
    const token = req.get('x-push-secret') || '';
    if (!PUSH_SECRET || token !== PUSH_SECRET) return res.status(401).json({ error: 'unauthorized' });

    const key = process.env.YOUTUBE_API_KEY || '';
    const ids = [...new Set([...VIDEOS, ...SHORTS].map((v) => v.id))];
    const shortIds = new Set(SHORTS.map((short) => short.id));
    const next = {};
    let dead = 0;
    let counted = 0;
    let apiBatches = 0;

    /**
     * The Data API is the authoritative health check when configured. A
     * successful response that omits an id is a confirmed removal; a failed
     * request is never treated as evidence that an embed died.
     */
    if (key) {
      for (let i = 0; i < ids.length; i += 50) {
        const batchIds = ids.slice(i, i + 50);
        const batch = batchIds.join(',');
        try {
          const response = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=status,contentDetails,statistics&id=${batch}&key=${key}`,
            { signal: AbortSignal.timeout(15000) }
          );
          if (!response.ok) {
            console.error(`[watch] YouTube videos.list ${response.status} for batch ${i / 50 + 1}`);
            continue;
          }
          const payload = await response.json();
          apiBatches++;
          const returned = new Set();
          for (const item of payload.items || []) {
            if (!item?.id) continue;
            returned.add(item.id);
            const health = classifyVideoStatus(item, { short: shortIds.has(item.id) });
            const stats = item.statistics || {};
            next[item.id] = {
              dead: health.dead,
              deadReason: health.dead ? health.reason : null,
              views: Number(stats.viewCount) || 0,
              likes: Number(stats.likeCount) || 0,
            };
            if (health.dead) dead++;
            if (item.statistics) counted++;
          }
          for (const id of batchIds) {
            if (returned.has(id)) continue;
            next[id] = { dead: true, deadReason: 'missing' };
            dead++;
          }
        } catch (error) {
          console.error(`[watch] YouTube videos.list failed for batch ${i / 50 + 1}:`, error.message);
        }
      }
    }

    /**
     * oEmbed is the no-key fallback and a recovery path for a transient API
     * batch failure. Only a 404/410 (or a no-key non-2xx response) is treated
     * as dead; timeouts and rate limits leave the previous state untouched.
     */
    const unresolved = ids.filter((id) => !Object.prototype.hasOwnProperty.call(next, id));
    const queue = [...unresolved];
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        for (let id = queue.pop(); id; id = queue.pop()) {
          try {
            const response = await fetch(
              `https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${id}&hl=en&gl=IN`,
              { signal: AbortSignal.timeout(10000) }
            );
            // Only terminal not-found responses prove an embed is gone. A
            // 403/429/5xx can be a quota, consent, region, or transient
            // network response and must preserve the previous health state.
            const gone = !response.ok && (response.status === 404 || response.status === 410);
            if (gone) {
              next[id] = { dead: true, deadReason: `oembed:${response.status}` };
              dead++;
            } else if (response.ok) {
              next[id] = { dead: false, deadReason: null };
            }
          } catch {
            /* A network blip is not evidence a video is gone. */
          }
        }
      })
    );

    saveVideoStats(next);
    console.log(`[watch] refreshed ${ids.length} videos, ${counted} counted, ${dead} dead (${apiBatches} API batches)`);
    res.json({ checked: ids.length, counted, dead, hasKey: Boolean(key), apiBatches });
  });

  /* ================= bar nudges (web push) ================= */
  const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
  const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
  const pushReady = Boolean(VAPID_PUBLIC && VAPID_PRIVATE);
  if (pushReady) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:hello@the-pubcrawl.app', VAPID_PUBLIC, VAPID_PRIVATE);
  }
  console.log(`[push] ${pushReady ? `ready — ${getSubs().length} subscribed` : 'disabled (no VAPID keys)'}`);

  /** send one notification; drop the subscription if the browser says it's dead */
  async function deliver(record, payload) {
    try {
      await webpush.sendNotification(record.sub, JSON.stringify(payload));
      return true;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) removeSub(record.sub.endpoint);
      return false;
    }
  }

  app.get('/api/push/key', (_req, res) =>
    res.json({ key: pushReady ? VAPID_PUBLIC : null })
  );

  app.post('/api/push/subscribe', async (req, res) => {
    const sub = req.body?.subscription;
    if (!pushReady) return res.status(503).json({ error: 'Nudges are not set up on this server.' });
    if (!sub?.endpoint) return res.status(400).json({ error: 'subscription required' });
    const isNew = addSub(sub);
    if (isNew) deliver({ sub }, WELCOME).catch(() => {}); // "You're in."
    res.json({ ok: true });
  });

  app.post('/api/push/unsubscribe', (req, res) => {
    const endpoint = req.body?.endpoint;
    if (endpoint) removeSub(endpoint);
    res.json({ ok: true });
  });

  // the app pings this on open, so "been away" nudges only reach the away
  app.post('/api/push/seen', (req, res) => {
    const endpoint = req.body?.endpoint;
    if (endpoint) touchSub(endpoint);
    res.json({ ok: true });
  });

  /**
   * Who is signed up, without sending anything. Checking used to mean firing a
   * real nudge at everyone's phone just to read the count back. Behind the same
   * secret as /send, and it reports no endpoints or keys — only counts, the
   * browser each subscription belongs to, and when it was last seen.
   */
  app.get('/api/push/status', (req, res) => {
    const token = req.get('x-push-secret') || '';
    if (!PUSH_SECRET || token !== PUSH_SECRET) return res.status(401).json({ error: 'unauthorized' });
    const host = (e) => {
      try {
        return new URL(e).host;
      } catch {
        return 'unknown';
      }
    };
    res.json({
      pushReady,
      store: storeMode(),
      subscribers: getSubs().length,
      list: getSubs().map((s) => ({
        via: host(s.sub.endpoint),
        createdAt: s.createdAt || null,
        lastSeen: s.lastSeen || null,
      })),
    });
  });

  // fired by the schedulers: kind=nudge every couple of days, kind=daily at 5pm
  app.post('/api/push/send', async (req, res) => {
    if (!pushReady) return res.status(503).json({ error: 'push disabled' });
    const token = req.get('x-push-secret') || req.body?.secret || '';
    if (!PUSH_SECRET || token !== PUSH_SECRET) return res.status(401).json({ error: 'unauthorized' });

    const kind = String(req.query.kind || req.body?.kind || 'nudge');
    const records = [...getSubs()];
    let sent = 0;
    for (const rec of records) {
      const payload =
        kind === 'daily'
          ? buildDailyQuestionNudge()
          : buildNudge(cocktails, (Date.now() - (rec.lastSeen || rec.createdAt || 0)) / 86400000);
      if (await deliver(rec, payload)) sent++;
    }
    console.log(`[push] ${kind}: sent ${sent}/${records.length}`);
    res.json({ kind, sent, total: records.length });
  });

  return app;
}

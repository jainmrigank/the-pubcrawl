/**
 * Cocktail API — mounted as Vite middleware in dev (see vite.config.ts),
 * or run standalone via `node server/index.mjs` (e.g. behind an ngrok tunnel
 * feeding the Vercel-hosted frontend).
 */
import './env.mjs'; // must run before store.mjs / push keys read process.env
import express from 'express';
import webpush from 'web-push';
import { loadCatalog, searchIngredients, matchRecipes, categorise, norm } from './catalog.mjs';
import { VIBES, withVibe } from './vibes.mjs';
import { chat, extractJson, llmAvailable, llmConfig } from './llm.mjs';
import { generateFallback } from './generator.mjs';
import { buildNudge, WELCOME } from './push.mjs';
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
} from './store.mjs';

export async function createApp() {
  await initStore();
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // CORS: the frontend may be served from another origin (Vercel) while the
  // API runs here. Wide-open is fine for a public read-mostly menu API.
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, ngrok-skip-browser-warning');
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
    res.json({ ok: true, cocktails: cocktails.length, ingredients: ingredients.length, llm: llmAvailable() ? llmConfig.model : null })
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
    const vibe = String(req.query.vibe || '');
    const q = norm(String(req.query.q || ''));
    const limit = Math.min(Number(req.query.limit) || 12, 120);
    let list = cocktails.filter((c) => c.thumb || c.house);
    if (vibe === 'zeroproof') list = list.filter((c) => (c.alcoholic || '').toLowerCase().includes('non'));
    else if (vibe === 'indian') list = list.filter((c) => (c.tags || []).includes('India'));
    else if (vibe) list = list.filter((c) => c.vibe === vibe);

    // Ranked search: name beats ingredients beats metadata, and metadata only
    // matches whole words — "lassi" must never surface every IBA cLASSIc.
    let rank = null;
    if (q) {
      const scoreOf = (c) => {
        const n = norm(c.name);
        if (n === q) return 0;
        if (n.startsWith(q)) return 1;
        if (` ${n} `.includes(` ${q} `)) return 2;
        if (n.includes(q)) return 3;
        if (c.ingredients.some((i) => norm(i.name).includes(q))) return 4;
        const meta = ` ${norm(c.category)} ${norm(c.iba || '')} ${(c.tags || []).map((t) => norm(t)).join(' ')} `;
        if (meta.includes(` ${q} `)) return 5;
        return -1;
      };
      rank = new Map();
      list = list.filter((c) => {
        const s = scoreOf(c);
        if (s < 0) return false;
        rank.set(c.id, s);
        return true;
      });
    }

    const seedStr = String(req.query.seed || 'x');
    let seed = 0;
    for (const ch of seedStr) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    // id-string hash (house extras have non-numeric ids)
    const idNum = (c) => {
      let h = 7;
      for (const ch of String(c.id)) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
      return h;
    };
    const hash = (c) => ((idNum(c) + seed) * 2654435761) >>> 0;
    const ordered =
      String(req.query.sort || '') === 'likes'
        ? [...list].sort((a, b) => (likes[b.id] || 0) - (likes[a.id] || 0) || hash(a) - hash(b))
        : rank
          ? [...list].sort((a, b) => rank.get(a.id) - rank.get(b.id) || hash(a) - hash(b))
          : [...list].sort((a, b) => hash(a) - hash(b));
    res.json(ordered.slice(0, limit));
  });

  /* ---- match pantry -> recipes ---- */
  app.post('/api/recipes/match', (req, res) => {
    const pantry = Array.isArray(req.body?.ingredients) ? req.body.ingredients.map(String) : [];
    if (!pantry.length) return res.json({ canMake: [], almost: [] });
    res.json(matchRecipes(cocktails, pantry));
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
{"name": "...", "tagline": "one poetic sentence", "vibe": "tropical|refreshing|boozy|sweet|cozy|party", "glass": "...", "ingredients": [{"name": "...", "measure": "..."}], "instructions": "...", "garnish": "..."}`,
            },
          ],
          { temperature: 0.95 }
        );
        const r = extractJson(reply);
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
          ingredients: (Array.isArray(r.ingredients) ? r.ingredients : []).map((i) => ({
            name: String(i.name || ''),
            measure: String(i.measure || ''),
          })),
          source: 'ai',
        };
        if (Object.keys(VIBES).includes(r.vibe)) drink.vibe = r.vibe;
        else withVibe(drink);
        return res.json(drink);
      } catch (err) {
        console.error('[generate] LLM failed, falling back:', err.message);
      }
    }
    res.json(generateFallback(pantry, avoid));
  });

  /* ================= bar nudges (web push) ================= */
  const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
  const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
  const PUSH_SECRET = process.env.PUSH_SECRET || '';
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

  // fired by the scheduler every couple of days (see .github/workflows)
  app.post('/api/push/send', async (req, res) => {
    if (!pushReady) return res.status(503).json({ error: 'push disabled' });
    const token = req.get('x-push-secret') || req.body?.secret || '';
    if (!PUSH_SECRET || token !== PUSH_SECRET) return res.status(401).json({ error: 'unauthorized' });

    const records = [...getSubs()];
    let sent = 0;
    for (const rec of records) {
      const awayDays = (Date.now() - (rec.lastSeen || rec.createdAt || 0)) / 86400000;
      const nudge = buildNudge(cocktails, awayDays);
      if (await deliver(rec, nudge)) sent++;
    }
    console.log(`[push] sent ${sent}/${records.length}`);
    res.json({ sent, total: records.length });
  });

  return app;
}

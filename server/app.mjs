/**
 * Cocktail API — mounted as Vite middleware in dev (see vite.config.ts),
 * or run standalone via `node server/index.mjs` (e.g. behind an ngrok tunnel
 * feeding the Vercel-hosted frontend).
 */
import express from 'express';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog, searchIngredients, matchRecipes, categorise, norm } from './catalog.mjs';
import { VIBES, withVibe } from './vibes.mjs';
import { chat, extractJson, llmAvailable, llmConfig } from './llm.mjs';
import { generateFallback } from './generator.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function createApp() {
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
  console.log(`[cocktail-api] ${cocktails.length} cocktails, ${ingredients.length} ingredients, LLM: ${llmAvailable() ? llmConfig.model : 'offline fallback'}`);

  /* ---- public likes (shared across every visitor of this server) ---- */
  const likesPath = join(ROOT, 'data', 'likes.json');
  let likes = {};
  try {
    if (existsSync(likesPath)) likes = JSON.parse(readFileSync(likesPath, 'utf8'));
  } catch {}
  const saveLikes = () => {
    try {
      writeFileSync(likesPath, JSON.stringify(likes, null, 1));
    } catch (err) {
      console.error('[likes] could not persist:', err.message);
    }
  };
  const validIds = new Set(cocktails.map((c) => c.id));

  app.get('/api/likes', (_req, res) => res.json(likes));

  app.post('/api/likes/:id', (req, res) => {
    const { id } = req.params;
    if (!validIds.has(id)) return res.status(404).json({ error: 'Unknown drink' });
    const delta = req.body?.action === 'unlike' ? -1 : 1;
    const next = Math.max(0, (likes[id] || 0) + delta);
    if (next === 0) delete likes[id];
    else likes[id] = next;
    saveLikes();
    res.json({ id, likes: next });
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

  return app;
}

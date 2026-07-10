/**
 * Cocktail API — mounted as Vite middleware in dev (see vite.config.ts),
 * or run standalone via `node server/index.mjs`.
 */
import express from 'express';
import { loadCatalog, searchIngredients, matchRecipes, categorise, norm } from './catalog.mjs';
import { VIBES, withVibe } from './vibes.mjs';
import { chat, extractJson, llmAvailable, llmConfig } from './llm.mjs';
import { generateFallback } from './generator.mjs';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  const { cocktails, ingredients } = loadCatalog();
  console.log(`[cocktail-api] ${cocktails.length} cocktails, ${ingredients.length} ingredients, LLM: ${llmAvailable() ? llmConfig.model : 'offline fallback'}`);

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
    const limit = Math.min(Number(req.query.limit) || 12, 60);
    let list = cocktails.filter((c) => c.thumb);
    if (vibe) list = list.filter((c) => c.vibe === vibe);
    if (q) list = list.filter((c) => norm(c.name).includes(q) || c.ingredients.some((i) => norm(i.name).includes(q)));
    const seedStr = String(req.query.seed || 'x');
    let seed = 0;
    for (const ch of seedStr) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const shuffled = [...list].sort((a, b) => {
      const ha = (Number(a.id) * 2654435761 + seed) >>> 0;
      const hb = (Number(b.id) * 2654435761 + seed) >>> 0;
      return ha - hb;
    });
    res.json(shuffled.slice(0, limit));
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
      return res.status(503).json({ error: 'Photo recognition isn\'t set up yet — add an API key to .env to switch it on.' });
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
      res.status(502).json({ error: `Couldn't read that photo — ${err.message}` });
    }
  });

  /* ---- invent a brand-new recipe ---- */
  app.post('/api/generate', async (req, res) => {
    const pantry = Array.isArray(req.body?.ingredients) ? req.body.ingredients.map(String).filter(Boolean) : [];
    const vibe = String(req.body?.vibe || '');
    const avoid = Array.isArray(req.body?.avoid) ? req.body.avoid.map(String).slice(0, 12) : [];
    if (!pantry.length) return res.status(400).json({ error: 'ingredients required' });

    if (llmAvailable()) {
      try {
        const cue = ['bitter-forward', 'herbal', 'silky', 'effervescent', 'smoky', 'bright and tart', 'aromatic', 'bone-dry', 'lightly sweet', 'savoury'][Math.floor(Math.random() * 10)];
        const reply = await chat(
          [
            {
              role: 'system',
              content:
                'You are a world-class mixologist who invents original, balanced cocktails. Always respond with a single JSON object, no prose.',
            },
            {
              role: 'user',
              content: `Invent ONE original cocktail using ONLY these available ingredients (plus ice/water/sugar/salt): ${pantry.join(', ')}.${vibe ? ` The vibe must be "${vibe}".` : ''} Lean ${cue}.
Rules: use 3-7 ingredients from the list, real-world sensible measures in ml/dashes, balanced (base : sour : sweet), a creative evocative name that is NOT an existing cocktail, and clear step-by-step instructions.${avoid.length ? ` Do NOT reuse any of these names or make trivially similar drinks: ${avoid.join(', ')}.` : ''}
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
          alcoholic: 'Alcoholic',
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

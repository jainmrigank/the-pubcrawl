import { norm } from '../shared/catalog-engine.mjs';
import { chat, extractJson } from './llm.mjs';
import { generateFallback, generateZeroProofFallback } from './generator.mjs';

const PRIMARY_VIBES = new Set(['tropical', 'refreshing', 'boozy', 'sweet', 'cozy', 'party', 'zeroproof']);
const ALCOHOL_CATEGORIES = new Set(['Spirit', 'Liqueur', 'Wine & Fortified', 'Beer & Cider']);
const MAX_IMAGE_CHARS = 15 * 1024 * 1024;

const IDENTIFY_PROMPT = 'You are a bartender\'s assistant. Identify every cocktail-relevant ingredient visible in this photo — spirits, liqueurs, wine or beer, bitters, mixers, juices, syrups, fruit, herbs, spices, dairy, and egg. Use short generic names, naming a specific spirit or liqueur only when its label is readable. Respond only with a JSON array of strings. If nothing relevant is visible, respond with [].';

function cleanList(value, { count, itemChars, totalChars }) {
  if (!Array.isArray(value)) return [];
  const output = [];
  let used = 0;
  for (const entry of value) {
    if (output.length >= count || used >= totalChars) break;
    const clean = String(entry ?? '').replace(/\s+/g, ' ').trim().slice(0, itemChars);
    if (!clean) continue;
    const remaining = totalChars - used;
    const bounded = clean.slice(0, remaining);
    if (!bounded) break;
    output.push(bounded);
    used += bounded.length;
  }
  return output;
}

function knownIngredient(bundle, name) {
  const needle = norm(name);
  if (!needle) return null;
  return bundle.ingredients.find((ingredient) => norm(ingredient.name) === needle)
    || bundle.ingredients.find((ingredient) => {
      const candidate = norm(ingredient.name);
      return candidate.startsWith(`${needle} `) || needle.startsWith(`${candidate} `);
    })
    || null;
}

function categoryFor(bundle, name) {
  return knownIngredient(bundle, name)?.category || 'Other';
}

function generationMessages(shelf, vibe, avoid, taste) {
  const mood = {
    tropical: 'tropical and sunny', refreshing: 'fresh, citrusy and light', boozy: 'spirit-forward and stiff',
    sweet: 'dessert-like and indulgent', cozy: 'warm and comforting', party: 'a fun, punchy party serve',
    zeroproof: 'strictly zero-proof, with no alcoholic ingredient or alcoholic dash',
    india: 'distinctly Indian, using practical familiar Indian flavours',
  }[vibe] || 'bartender\'s choice';
  const tasteBlock = taste.length ? `THE GUEST\'S TAB:\n${taste.map((item) => `- ${item}`).join('\n')}` : '';
  const avoidBlock = avoid.length ? `AVOID THESE EARLIER DRAFTS: ${avoid.join('; ')}` : '';
  return [
    { role: 'system', content: 'You are a world-class mixologist who invents original, balanced, practical drinks for a home bar. Respond with one JSON object and no prose.' },
    { role: 'user', content: `Invent one original cocktail.\nTHE SHELF: ${shelf.join(', ')}\nTHE MOOD: ${mood}\n${tasteBlock}\n${avoidBlock}\nUse 3 to 7 ingredients with realistic measures and clear instructions. Add at most two common bar staples. Respond exactly as {"name":"...","tagline":"...","vibe":"tropical|refreshing|boozy|sweet|cozy|party|zeroproof","glass":"...","ingredients":[{"name":"...","measure":"..."}],"instructions":"...","garnish":"..."}.` },
  ];
}

function normalizeGenerated(value, requestedVibe, bundle) {
  if (!value || typeof value !== 'object') throw new Error('invalid generated recipe');
  const ingredients = (Array.isArray(value.ingredients) ? value.ingredients : [])
    .slice(0, 7)
    .map((item) => ({
      name: String(item?.name || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      measure: String(item?.measure || '').replace(/\s+/g, ' ').trim().slice(0, 40),
    }))
    .filter((item) => item.name);
  if (!ingredients.length) throw new Error('generated recipe has no ingredients');
  if (requestedVibe === 'zeroproof') {
    const invalid = ingredients.some((ingredient) => {
      const known = knownIngredient(bundle, ingredient.name);
      return !known || ALCOHOL_CATEGORIES.has(known.category);
    });
    if (invalid) throw new Error('generated Zero Proof recipe contained an unknown or alcoholic ingredient');
  }
  const name = String(value.name || 'The Unnamed').replace(/\s+/g, ' ').trim().slice(0, 80) || 'The Unnamed';
  const instructions = String(value.instructions || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
  if (!instructions) throw new Error('generated recipe has no instructions');
  const modelVibe = PRIMARY_VIBES.has(String(value.vibe)) ? String(value.vibe) : '';
  const vibe = requestedVibe === 'zeroproof' ? 'zeroproof' : modelVibe || 'boozy';
  const garnish = String(value.garnish || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    tagline: String(value.tagline || '').replace(/\s+/g, ' ').trim().slice(0, 180),
    category: vibe === 'zeroproof' ? 'Zero Proof Original' : 'AI Original',
    alcoholic: vibe === 'zeroproof' ? 'Non alcoholic' : 'Alcoholic',
    glass: String(value.glass || 'Coupe').replace(/\s+/g, ' ').trim().slice(0, 50),
    instructions: `${instructions}${garnish ? ` Garnish with ${garnish}.` : ''}`,
    thumb: '',
    video: '',
    tags: vibe === 'zeroproof' ? ['AI Original', 'Zero Proof'] : ['AI Original'],
    iba: '',
    source: 'ai',
    vibe,
    ingredients,
  };
}

export function normalizeGenerateInput(body) {
  const shelf = cleanList(body?.ingredients, { count: 12, itemChars: 80, totalChars: 720 });
  const avoid = cleanList(body?.avoid, { count: 10, itemChars: 180, totalChars: 1400 });
  const taste = cleanList(body?.taste, { count: 8, itemChars: 220, totalChars: 1400 });
  const rawVibe = String(body?.vibe || '').trim().toLowerCase();
  const vibe = rawVibe === 'indian' ? 'india' : (PRIMARY_VIBES.has(rawVibe) || rawVibe === 'india' ? rawVibe : '');
  return { shelf, avoid, taste, vibe };
}

export async function identifyIngredients(body, env, bundle) {
  const imageBase64 = typeof body?.imageBase64 === 'string' ? body.imageBase64.trim() : '';
  if (!imageBase64) throw Object.assign(new Error('imageBase64 required'), { status: 400 });
  if (imageBase64.length > MAX_IMAGE_CHARS) throw Object.assign(new Error('image is too large'), { status: 413 });
  if (!env.LLM_API_KEY) throw Object.assign(new Error('Photo recognition is not configured on this Worker.'), { status: 503 });
  const mimeType = /^image\/(jpeg|png|webp|heic|heif)$/i.test(String(body?.mimeType || '')) ? String(body.mimeType).toLowerCase() : 'image/jpeg';
  const reply = await chat(env, [{
    role: 'user',
    content: [
      { type: 'text', text: IDENTIFY_PROMPT },
      { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
    ],
  }], { temperature: 0.1 });
  const parsed = extractJson(reply);
  if (!Array.isArray(parsed)) throw new Error('Expected an ingredient array');
  const names = cleanList(parsed, { count: 30, itemChars: 80, totalChars: 1600 });
  const seen = new Set();
  const detected = [];
  for (const name of names) {
    const key = norm(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const resolved = knownIngredient(bundle, name);
    detected.push(resolved
      ? { ...resolved, detectedAs: name }
      : { name, category: categoryFor(bundle, name), image: '', detectedAs: name });
  }
  return { detected };
}

export async function generateDrink(body, env, bundle) {
  const input = normalizeGenerateInput(body);
  if (!input.shelf.length) throw Object.assign(new Error('ingredients required'), { status: 400 });
  if (!env.LLM_API_KEY) {
    return input.vibe === 'zeroproof'
      ? generateZeroProofFallback(input.shelf, bundle.ingredients)
      : generateFallback(input.shelf, input.vibe);
  }
  let lastError;
  const attempts = input.vibe === 'zeroproof' ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const reply = await chat(env, generationMessages(input.shelf, input.vibe, input.avoid, input.taste), { temperature: 0.9 });
      return normalizeGenerated(extractJson(reply), input.vibe, bundle);
    } catch (error) {
      lastError = error;
    }
  }
  // Browsing and Bar matching remain useful even during an AI-provider outage.
  // The fallback is deterministic and enforces the requested Zero Proof rule.
  return input.vibe === 'zeroproof'
    ? generateZeroProofFallback(input.shelf, bundle.ingredients)
    : generateFallback(input.shelf, input.vibe);
}

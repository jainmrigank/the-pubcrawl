/**
 * Minimal OpenAI-compatible chat client. Reads LLM_* config from
 * cocktail-app/.env or the parent "New project"/.env (whichever exists first).
 * Works with the existing Gemini key (OpenAI-compat endpoint) or any other
 * OpenAI-compatible provider.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const env = { ...process.env };
  for (const p of [join(ROOT, '..', '.env'), join(ROOT, '.env')]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

const env = loadEnv();

export const llmConfig = {
  apiKey: env.LLM_API_KEY || '',
  baseUrl: (env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/$/, ''),
  model: env.LLM_MODEL || 'gemini-3.5-flash',
  timeoutMs: (Number(env.LLM_TIMEOUT_SECONDS) || 45) * 1000,
};

export const llmAvailable = () => Boolean(llmConfig.apiKey);

// If the configured model is over quota, retired or simply busy, walk down this
// chain so a real LLM still answers (verified live against this key's models).
const FALLBACK_MODELS = ['gemini-3-flash-preview', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest'];

async function chatOnce(model, messages, temperature) {
  const res = await fetch(`${llmConfig.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${llmConfig.apiKey}`,
    },
    body: JSON.stringify({ model, temperature, messages }),
    signal: AbortSignal.timeout(llmConfig.timeoutMs),
  });
  if (res.status === 429) throw Object.assign(new Error(`429 quota exhausted on ${model}`), { status: 429 });
  if (!res.ok)
    throw Object.assign(new Error(`LLM ${res.status} on ${model}: ${(await res.text()).slice(0, 200)}`), {
      status: res.status,
    });
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content;
  if (!text) throw new Error(`LLM returned empty response on ${model}`);
  return text;
}

/**
 * Is this failure worth asking a different model about?
 *
 * Anything the server says about itself is: over quota, retired, overloaded,
 * timed out. "This model is currently experiencing high demand" is a 503 and
 * used to fall straight through, which meant the fallback chain sat unused
 * during exactly the outage it was built for.
 *
 * A 400 is not worth retrying. The request is malformed and every model in the
 * chain will say so, slowly.
 */
function worthRetrying(err) {
  const status = err?.status;
  if (status === 429 || status === 404 || status === 408) return true;
  if (typeof status === 'number' && status >= 500) return true;
  if (typeof status === 'number') return false; // 400/401/403: our fault, not theirs
  return /quota|not found|no longer available|high demand|overload|timeout|timed out|aborted|network|fetch failed/i.test(
    err?.message || ''
  );
}

/** messages: OpenAI-style array. Returns assistant text or throws after trying the model chain. */
export async function chat(messages, { temperature = 0.7 } = {}) {
  if (!llmAvailable()) throw new Error('No LLM_API_KEY configured');
  const models = [llmConfig.model, ...FALLBACK_MODELS.filter((m) => m !== llmConfig.model)];
  let lastErr;
  for (const model of models) {
    try {
      const text = await chatOnce(model, messages, temperature);
      if (model !== llmConfig.model) console.log(`[llm] served by fallback model ${model}`);
      return text;
    } catch (err) {
      lastErr = err;
      if (!worthRetrying(err)) throw err;
      console.warn(`[llm] ${err.message} — trying next model`);
    }
  }
  console.error('[llm] every model failed:', lastErr?.message);
  throw new Error('Our bartender is swamped right now. Give it a minute and try again.');
}

/** Pull the first JSON value out of an LLM reply (handles ```json fences). */
export function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = Math.min(...['[', '{'].map((c) => {
    const i = body.indexOf(c);
    return i === -1 ? Infinity : i;
  }));
  if (start === Infinity) throw new Error('No JSON in LLM reply');
  return JSON.parse(body.slice(start, findJsonEnd(body, start) + 1));
}

function findJsonEnd(s, start) {
  const open = s[start];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inStr = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === open || (ch === '[' || ch === '{')) depth++;
    else if (ch === close || (ch === ']' || ch === '}')) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return s.length - 1;
}

/**
 * Small Cloudflare-compatible OpenAI/Gemini chat adapter.
 *
 * It deliberately has no Node imports, filesystem access, or logging of
 * prompts/secrets. The Worker can therefore proxy the existing AI features
 * without bringing the Render process or its cold-start path back into the
 * browser's critical path.
 */

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const DEFAULT_MODEL = 'gemini-3.5-flash';
const FALLBACK_MODELS = ['gemini-3-flash-preview', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest'];
const MAX_MESSAGES = 8;
const MAX_TEXT_ITEM_CHARS = 16000;
const MAX_TOTAL_TEXT_CHARS = 32000;
const MAX_CONTENT_PARTS = 4;
const MAX_IMAGE_URL_CHARS = 15 * 1024 * 1024 + 128;

function boundedMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGES) {
    throw Object.assign(new Error('LLM context has an invalid message count'), { status: 400 });
  }
  let totalText = 0;
  return messages.map((message) => {
    const role = ['system', 'user', 'assistant'].includes(message?.role) ? message.role : null;
    if (!role) throw Object.assign(new Error('LLM context has an invalid role'), { status: 400 });
    if (typeof message.content === 'string') {
      if (message.content.length > MAX_TEXT_ITEM_CHARS) throw Object.assign(new Error('LLM context item is too large'), { status: 400 });
      totalText += message.content.length;
      return { role, content: message.content };
    }
    if (!Array.isArray(message.content) || message.content.length > MAX_CONTENT_PARTS) {
      throw Object.assign(new Error('LLM context content is invalid'), { status: 400 });
    }
    const content = message.content.map((part) => {
      if (part?.type === 'text') {
        const value = String(part.text || '');
        if (value.length > MAX_TEXT_ITEM_CHARS) throw Object.assign(new Error('LLM context item is too large'), { status: 400 });
        totalText += value.length;
        return { type: 'text', text: value };
      }
      if (part?.type === 'image_url') {
        const url = String(part.image_url?.url || '');
        if (!url.startsWith('data:image/') || url.length > MAX_IMAGE_URL_CHARS) throw Object.assign(new Error('LLM image input is invalid'), { status: 400 });
        return { type: 'image_url', image_url: { url } };
      }
      throw Object.assign(new Error('LLM context part is invalid'), { status: 400 });
    });
    return { role, content };
  }).map((message, _index, normalized) => {
    if (totalText > MAX_TOTAL_TEXT_CHARS) throw Object.assign(new Error('LLM context is too large'), { status: 400 });
    return message;
  });
}

function timeoutSignal(milliseconds) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('LLM request timed out')), milliseconds);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

function shouldTryAnother(error) {
  const status = Number(error?.status);
  if ([408, 404, 429].includes(status) || status >= 500) return true;
  return /quota|not found|overload|high demand|timeout|network|fetch failed|aborted/i.test(String(error?.message || ''));
}

async function chatOnce(env, model, messages, temperature, timeoutMs) {
  if (!env.LLM_API_KEY) throw new Error('No LLM_API_KEY configured');
  const baseUrl = String(env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const timer = timeoutSignal(timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.LLM_API_KEY}`,
      },
      body: JSON.stringify({ model, temperature, messages }),
      signal: timer.signal,
    });
    if (!response.ok) {
      const error = new Error(`LLM request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    const text = Array.isArray(content)
      ? content.map((part) => typeof part === 'string' ? part : part?.text || '').join('')
      : content;
    if (!text || typeof text !== 'string') throw new Error('LLM returned an empty response');
    return text;
  } finally {
    timer.clear();
  }
}

export async function chat(env, messages, { temperature = 0.7, budgetMs = 70000 } = {}) {
  if (!env.LLM_API_KEY) throw new Error('No LLM_API_KEY configured');
  const safeMessages = boundedMessages(messages);
  const configured = String(env.LLM_MODEL || DEFAULT_MODEL);
  const models = [configured, ...FALLBACK_MODELS.filter((model) => model !== configured)];
  const deadline = Date.now() + budgetMs;
  let lastError;
  for (const model of models) {
    if (Date.now() >= deadline) break;
    try {
      return await chatOnce(env, model, safeMessages, temperature, Math.max(1000, Math.min(45000, deadline - Date.now())));
    } catch (error) {
      lastError = error;
      if (!shouldTryAnother(error)) throw error;
    }
  }
  throw new Error(lastError?.message || 'The bartender is busy right now');
}

function jsonEnd(value, start) {
  const opening = value[start];
  const closing = opening === '[' ? ']' : '}';
  let depth = 0;
  let quoted = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (character === '\\') index += 1;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === opening || character === '[' || character === '{') depth += 1;
    else if (character === closing || character === ']' || character === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

export function extractJson(text) {
  const fenced = String(text).match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : String(text);
  const starts = ['[', '{'].map((character) => body.indexOf(character)).filter((index) => index >= 0);
  const start = starts.length ? Math.min(...starts) : -1;
  if (start < 0) throw new Error('No JSON in LLM response');
  const end = jsonEnd(body, start);
  if (end < start) throw new Error('Incomplete JSON in LLM response');
  return JSON.parse(body.slice(start, end + 1));
}

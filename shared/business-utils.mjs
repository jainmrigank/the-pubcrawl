import { siteOrigin } from './business-metrics.mjs';

const encoder = new TextEncoder();
export const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export const DAY = 86400;

export class BusinessError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  } });
}

export async function rawBody(request, limit = 10000) {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let result = '', length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new BusinessError(413, 'Request too large');
    }
    result += decoder.decode(value, { stream: true });
  }
  return result + decoder.decode();
}

export function parseBody(raw) {
  try {
    const input = JSON.parse(raw);
    if (input && typeof input === 'object' && !Array.isArray(input)) return input;
  } catch {}
  throw new BusinessError(400, 'Invalid request');
}

export function text(value, min, max) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (result.length < min || result.length > max) throw new BusinessError(400, 'Check the required fields and try again.');
  return result;
}

export function emailAddress(value) {
  const address = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return address.length <= 254 && /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(address) ? address : '';
}

function hex(bytes) {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export const digest = async (value) => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
export async function sign(secret, message) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

export function equalStrings(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function secureLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export const publicOrigin = env => secureLink(env.PUBCRAWL_PUBLIC_ORIGIN)
  ? new URL(env.PUBCRAWL_PUBLIC_ORIGIN).origin : siteOrigin;

export function signer(env) {
  const key = String(env.PUBCRAWL_BUSINESS_SIGNING_KEY || '');
  return {
    available: key.length >= 32,
    async issue(purpose, id) {
      return id + '.' + await sign(key, purpose + ':' + id);
    },
    async verify(purpose, token) {
      if (key.length < 32 || typeof token !== 'string' || !/^[a-f0-9-]+\.[a-f0-9]{64}$/i.test(token) || token.length > 140) return null;
      const [id, signature] = token.split('.');
      return equalStrings(await sign(key, purpose + ':' + id), signature) ? id : null;
    },
  };
}

export function mailer(env, fetcher) {
  const from = env.PUBCRAWL_EMAIL_FROM;
  const key = env.RESEND_API_KEY;
  const replyTo = emailAddress(env.PUBCRAWL_CONTACT_EMAIL);
  return {
    available: Boolean(from && key),
    async send({ to, subject, body, idempotency }) {
      const response = await fetcher('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json', 'idempotency-key': idempotency },
        body: JSON.stringify({ from, to: [to], subject, text: body, ...(replyTo ? { reply_to: replyTo } : {}) }),
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok) throw new BusinessError(503, 'Email delivery is temporarily unavailable.');
    },
  };
}

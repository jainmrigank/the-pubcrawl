const base = String(import.meta.env.VITE_API_BASE || '').trim().replace(/\/$/, '');
const headersForBase: Record<string, string> = base.includes('ngrok') ? { 'ngrok-skip-browser-warning': '1' } : {};

export function businessFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(headersForBase)) headers.set(key, value);
  if (typeof init.body === 'string') headers.set('content-type', 'application/json');
  return fetch(base + '/api/business' + path, {
    ...init,
    headers,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    signal: init.signal || (typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(18000) : undefined),
  });
}

export async function businessJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await businessFetch(path, init);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Service unavailable. Please try again.');
  return result as T;
}

export const businessPost = <T>(path: string, body: unknown) => businessJson<T>(path, { method: 'POST', body: JSON.stringify(body) });

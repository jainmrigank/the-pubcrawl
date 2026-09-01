import { handleRequest } from '../worker/router.mjs';

const env = { FRONTEND_ORIGIN: 'https://the-pubcrawl.vercel.app', RATE_LIMIT_SALT: 'local-test' };
const checks = [
  ['health', '/api/health'],
  ['vibes', '/api/vibes'],
  ['recipes', '/api/recipes?offset=0&limit=12'],
  ['zero-proof', '/api/recipes?category=zeroproof&offset=0&limit=12'],
];
for (const [name, path] of checks) {
  const response = await handleRequest(new Request(`http://worker.test${path}`, { headers: { origin: 'https://the-pubcrawl.vercel.app' } }), env);
  if (!response.ok) throw new Error(`${name} failed: ${response.status}`);
  const body = await response.json();
  console.log(`${name}: ${response.status} (${JSON.stringify(body).length} bytes)`);
}
const denied = await handleRequest(new Request('http://worker.test/api/health', { headers: { origin: 'https://example.com' } }), env);
if (denied.status !== 403) throw new Error(`CORS denial failed: ${denied.status}`);
console.log('cors-deny: 403');

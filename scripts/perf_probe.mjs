import { performance } from 'node:perf_hooks';
import { loadCatalog } from '../server/catalog.mjs';
import { handleRequest } from '../worker/router.mjs';

const { cocktails } = loadCatalog();
const env = { FRONTEND_ORIGIN: 'https://the-pubcrawl.vercel.app' };
for (const path of ['/api/health', '/api/recipes?offset=0&limit=12', '/api/vibes']) {
  const started = performance.now();
  const response = await handleRequest(new Request(`http://worker.test${path}`), env);
  await response.arrayBuffer();
  console.log(`${path} ${response.status} ${Math.round(performance.now() - started)}ms`);
}
console.log(`catalogue ${cocktails.length} recipes`);

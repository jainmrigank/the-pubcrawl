import assert from 'node:assert/strict';
import test from 'node:test';
import { handleRequest } from '../worker/router.mjs';

const origin = 'https://the-pubcrawl.vercel.app';
const env = { FRONTEND_ORIGIN: origin, RATE_LIMIT_SALT: 'worker-contract-test' };

async function call(path, options = {}, customEnv = env) {
  const headers = new Headers(options.headers || {});
  if (!headers.has('origin')) headers.set('origin', origin);
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const request = new Request(`https://worker.test${path}`, { ...options, headers });
  const response = await handleRequest(request, customEnv);
  const body = await response.json().catch(() => null);
  return { response, body };
}

test('Worker API preserves catalogue, dynamic state, CORS, AI fallback, and validation contracts', async () => {
  const health = await call('/api/health');
  assert.equal(health.response.status, 200);
  assert.equal(health.body.runtime, 'cloudflare-worker');
  assert.equal(health.body.catalogueCocktails, 691);
  assert.equal(health.body.store, 'unconfigured');

  const preflight = await call('/api/health', { method: 'OPTIONS' });
  assert.equal(preflight.response.status, 204);
  assert.equal(preflight.response.headers.get('access-control-allow-origin'), origin);

  const denied = await call('/api/health', { headers: { origin: 'https://malicious.example' } });
  assert.equal(denied.response.status, 403);
  assert.equal(denied.response.headers.get('access-control-allow-origin'), null);

  const previewOrigin = 'https://preview.example';
  const preview = await call('/api/health', { headers: { origin: previewOrigin } }, { ...env, FRONTEND_ORIGIN: previewOrigin });
  assert.equal(preview.response.status, 200);
  assert.equal(preview.response.headers.get('access-control-allow-origin'), previewOrigin);

  const recipes = await call('/api/recipes?offset=0&limit=12');
  assert.equal(recipes.response.status, 200);
  assert.equal(recipes.body.recipes.length, 12);
  assert.equal(recipes.body.total, 691);
  assert.equal(recipes.response.headers.get('cache-control'), 'no-store');
  const knownId = recipes.body.recipes[0].id;

  const zeroProof = await call('/api/recipes?category=zeroproof&limit=48');
  assert.ok(zeroProof.body.recipes.length > 0);
  assert.ok(zeroProof.body.recipes.every((recipe) => recipe.vibe === 'zeroproof'));

  const invalidCategory = await call('/api/recipes?category=not-real');
  assert.equal(invalidCategory.response.status, 400);

  const match = await call('/api/recipes/match', {
    method: 'POST',
    body: JSON.stringify({ ingredients: ['gin', 'lime juice', 'simple syrup'] }),
  });
  assert.equal(match.response.status, 200);
  assert.ok(Array.isArray(match.body.canMake));
  assert.ok(Array.isArray(match.body.almost));

  const keptRecipe = {
    name: 'Worker Contract Pour',
    tagline: 'A test-only kept drink.',
    alcoholic: 'Non alcoholic',
    glass: 'Highball glass',
    instructions: 'Build over ice and stir.',
    vibe: 'zeroproof',
    source: 'fallback',
    ingredients: [{ name: 'Lime Juice', measure: '30 ml' }, { name: 'Soda Water', measure: 'top up' }],
  };
  const kept = await call('/api/keep', { method: 'POST', body: JSON.stringify({ recipe: keptRecipe }) });
  assert.equal(kept.response.status, 200);
  assert.match(kept.body.id, /^kept-/);
  const keptAgain = await call('/api/keep', { method: 'POST', body: JSON.stringify({ recipe: keptRecipe }) });
  assert.equal(keptAgain.body.id, kept.body.id);
  const keptList = await call('/api/kept');
  assert.equal(keptList.body.filter((recipe) => recipe.id === kept.body.id).length, 1);

  const liked = await call(`/api/likes/${encodeURIComponent(kept.body.id)}`, { method: 'POST', body: JSON.stringify({ action: 'like' }) });
  assert.equal(liked.body.likes, 1);
  const unliked = await call(`/api/likes/${encodeURIComponent(kept.body.id)}`, { method: 'POST', body: JSON.stringify({ action: 'unlike' }) });
  assert.equal(unliked.body.likes, 0);
  const unknownLike = await call('/api/likes/not-a-drink', { method: 'POST', body: JSON.stringify({ action: 'like' }) });
  assert.equal(unknownLike.response.status, 404);

  const quiz = await call('/api/quiz/stream?seed=contract&from=0&count=25');
  assert.equal(quiz.body.questions.length, 25);
  assert.ok(quiz.body.questions.every((question) => question.d >= 3 && question.d <= 5));
  const high = await call('/api/quiz/high', { method: 'POST', body: JSON.stringify({ score: 17 }) });
  assert.equal(high.body.score, 17);
  assert.equal(high.body.beaten, true);
  const lower = await call('/api/quiz/high', { method: 'POST', body: JSON.stringify({ score: 2 }) });
  assert.equal(lower.body.score, 17);
  assert.equal(lower.body.beaten, false);
  const badHall = await call('/api/quiz/hall', { method: 'POST', body: JSON.stringify({ name: 'Tester', score: 4 }) });
  assert.equal(badHall.response.status, 400);

  const watchEvent = await call('/api/watch/event', { method: 'POST', body: JSON.stringify({ type: 'open', source: 'nav' }) });
  assert.equal(watchEvent.body.metrics.opens, 1);
  assert.equal(watchEvent.body.metrics.navOpens, 1);
  const shortSession = await call('/api/shorts/session', { method: 'POST', body: JSON.stringify({ source: 'nav', videosStarted: 2, advances: 1 }) });
  assert.equal(shortSession.body.metrics.sessions, 1);
  assert.equal(shortSession.body.metrics.videosStarted, 2);
  const invalidSession = await call('/api/shorts/session', { method: 'POST', body: JSON.stringify({ source: 'invalid' }) });
  assert.equal(invalidSession.response.status, 400);

  const subscription = { endpoint: 'https://push.example/contract', keys: { auth: 'a', p256dh: 'b' } };
  assert.equal((await call('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription }) })).response.status, 200);
  assert.equal((await call('/api/push/seen', { method: 'POST', body: JSON.stringify({ endpoint: subscription.endpoint }) })).response.status, 200);
  assert.equal((await call('/api/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: subscription.endpoint }) })).response.status, 200);

  const generated = await call('/api/generate', { method: 'POST', body: JSON.stringify({ ingredients: ['Lime Juice', 'Soda Water'], vibe: 'zeroproof' }) });
  assert.equal(generated.response.status, 200);
  assert.equal(generated.body.vibe, 'zeroproof');
  assert.equal(generated.body.alcoholic, 'Non alcoholic');
  const alcoholicShelf = await call('/api/generate', { method: 'POST', body: JSON.stringify({ ingredients: ['Aperol', 'Lime Juice'], vibe: 'zeroproof' }) });
  assert.equal(alcoholicShelf.response.status, 200);
  assert.equal(alcoholicShelf.body.vibe, 'zeroproof');
  assert.equal(alcoholicShelf.body.alcoholic, 'Non alcoholic');
  assert.ok(alcoholicShelf.body.ingredients.every((ingredient) => !/aperol|campari|vodka|gin|rum|whisk|liqueur|wine|beer|bitters/i.test(ingredient.name)));
  const noShelf = await call('/api/generate', { method: 'POST', body: JSON.stringify({ ingredients: [] }) });
  assert.equal(noShelf.response.status, 400);
  const noImage = await call('/api/identify', { method: 'POST', body: JSON.stringify({}) });
  assert.equal(noImage.response.status, 400);

  const likes = await call('/api/likes');
  assert.equal(Number(likes.body[knownId] || 0), 0);
  const missing = await call('/api/not-real');
  assert.equal(missing.response.status, 404);
});

test('AI routes fail closed when the rate-limit salt is not configured', async () => {
  const withoutSalt = { ...env };
  delete withoutSalt.RATE_LIMIT_SALT;

  const health = await call('/api/health', {}, withoutSalt);
  assert.equal(health.response.status, 200);
  assert.equal(health.body.ok, true);

  const recipes = await call('/api/recipes?offset=0&limit=1', {}, withoutSalt);
  assert.equal(recipes.response.status, 200);
  assert.equal(recipes.body.recipes.length, 1);

  const identify = await call('/api/identify', {
    method: 'POST',
    body: JSON.stringify({ imageBase64: 'not-a-real-image' }),
  }, withoutSalt);
  assert.equal(identify.response.status, 503);
  assert.deepEqual(identify.body, { error: 'This feature is temporarily unavailable.' });

  const generate = await call('/api/generate', {
    method: 'POST',
    body: JSON.stringify({ ingredients: ['gin'] }),
  }, withoutSalt);
  assert.equal(generate.response.status, 503);
  assert.deepEqual(generate.body, { error: 'This feature is temporarily unavailable.' });
});

test('Worker queues the opt-in welcome only for a newly stored subscription', async () => {
  const queued = [];
  const queueEnv = {
    ...env,
    PUSH_DELIVERY_QUEUE: {
      async send(body) { queued.push(body); },
      async sendBatch() {},
    },
  };
  const subscription = {
    endpoint: 'https://push.example/welcome-contract',
    keys: { auth: 'welcome-auth', p256dh: 'welcome-key' },
  };
  const request = { method: 'POST', body: JSON.stringify({ subscription }) };
  assert.equal((await call('/api/push/subscribe', request, queueEnv)).response.status, 200);
  assert.equal((await call('/api/push/subscribe', request, queueEnv)).response.status, 200);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].kind, 'welcome');
  assert.equal(queued[0].subscription.endpoint, subscription.endpoint);
  assert.match(queued[0].recipientHash, /^[a-f0-9]{32}$/);
});

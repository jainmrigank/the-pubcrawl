import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('memory store mode never contacts Upstash or writes persistence files', () => {
  const storeUrl = new URL('../server/store.mjs', import.meta.url).href;
  const script = `
    globalThis.fetch = async () => { throw new Error('unexpected Upstash request'); };
    const store = await import(${JSON.stringify(storeUrl)});
    await store.initStore();
    if (store.storeMode() !== 'memory') throw new Error('store did not enter memory mode');
    const like = await store.updateLike('memory-test', 1);
    const unliked = await store.updateLike('memory-test', -1);
    const kept = store.addKept({ id: 'memory-kept', name: 'Memory Kept' });
    const scoreChanged = store.submitScore(7);
    const shortMetrics = store.recordShortSession({
      source: 'direct', videosStarted: 1, advances: 1, shares: 0,
      recipeClicks: 0, autoplayFailures: 0, unavailableSkips: 0,
      bufferingEvents: 0, startupMsTotal: 120,
    });
    const watchMetrics = store.recordWatchEvent({ type: 'open', source: 'direct' });
    process.stdout.write(JSON.stringify({
      mode: store.storeMode(), like, unliked, kept: kept.id,
      scoreChanged, score: store.getHighScore().score,
      shortSessions: shortMetrics.sessions, watchOpens: watchMetrics.opens,
    }));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      PUBCRAWL_STORE_MODE: 'memory',
      KV_REST_API_URL: 'https://invalid.example',
      KV_REST_API_TOKEN: 'not-a-real-token',
    },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(JSON.parse(result.stdout), {
    mode: 'memory',
    like: 1,
    unliked: 0,
    kept: 'memory-kept',
    scoreChanged: true,
    score: 7,
    shortSessions: 1,
    watchOpens: 1,
  });
});

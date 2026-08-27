import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectShort } from '../scripts/shorts_common.mjs';

const candidate = {
  id: 'abcdefghijk',
  title: 'A quick cocktail pour',
  channel: 'A trusted bartender',
  channelId: 'UC1234567890',
};

test('weekly verifier rejects a normal watch redirect as not a Short', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => ({
    status: 200,
    url: 'https://www.youtube.com/watch?v=abcdefghijk',
    text: async () => '<html><meta name="description" content="video"><script>lengthSeconds":"30"</script></html>',
  });
  try {
    const result = await inspectShort(candidate);
    assert.deepEqual(result, { ok: false, reason: 'not-a-short' });
  } finally {
    globalThis.fetch = previous;
  }
});

test('weekly verifier accepts a Shorts URL only after duration and oEmbed checks', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/shorts/')) {
      return {
        status: 200,
        url: 'https://www.youtube.com/shorts/abcdefghijk',
        text: async () => '<link rel="canonical" href="https://www.youtube.com/shorts/abcdefghijk"><script>"isShorts":true,"lengthSeconds":"30"</script>',
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        title: 'A quick cocktail pour',
        author_name: 'A trusted bartender',
        thumbnail_url: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',
      }),
    };
  };
  try {
    const result = await inspectShort(candidate);
    assert.equal(result.ok, true);
    assert.equal(result.durationSeconds, 30);
    assert.match(result.thumbnail, /i\.ytimg\.com/);
  } finally {
    globalThis.fetch = previous;
  }
});

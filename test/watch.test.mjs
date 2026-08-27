import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LANDING_FEATURED_IDS, LANES, VIDEOS, validateLandingFeatured } from '../server/videos.mjs';
import { emptyWatchMetrics, validateWatchEvent } from '../server/watch-schema.mjs';

test('landing Watch set is present, live by default, and distributed three per lane', () => {
  const result = validateLandingFeatured();
  assert.equal(LANDING_FEATURED_IDS.length, 12);
  assert.equal(result.ok, true, result.missing.concat(result.dead).join(', '));
  assert.deepEqual(result.distribution, { craft: 3, education: 3, comedy: 3, people: 3 });
});

test('the reviewed Watch catalogue can supply a complete statistics-free fallback', () => {
  const raw = JSON.parse(readFileSync(join(process.cwd(), 'data', 'watchlist.json'), 'utf8'));
  const seen = new Set();
  const valid = raw.videos.filter((video) => {
    const ok = /^[A-Za-z0-9_-]{11}$/.test(video.id) && video.title && video.channel && LANES[video.lane];
    if (!ok || seen.has(video.id)) return false;
    seen.add(video.id);
    return true;
  });
  assert.equal(valid.length, VIDEOS.length);
  assert.ok(valid.length >= 6);
  assert.equal(new Set(valid.map((video) => video.lane)).size, 4);
});

test('Watch metrics accept only aggregate discovery events', () => {
  assert.deepEqual(validateWatchEvent({ type: 'preview-impression', videoId: 'secret' }).value, { type: 'preview-impression' });
  assert.deepEqual(validateWatchEvent({ type: 'open', source: 'landing', videoId: 'secret' }).value, { type: 'open', source: 'landing' });
  assert.equal(validateWatchEvent({ type: 'open', source: 'unknown' }).ok, false);
  assert.equal(validateWatchEvent({ type: 'preview-impression', source: 'landing' }).ok, true);
  assert.deepEqual(emptyWatchMetrics(), {
    impressions: 0,
    opens: 0,
    landingOpens: 0,
    navOpens: 0,
    deepLinkOpens: 0,
    directOpens: 0,
  });
});

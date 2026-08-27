import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyVideoStatus, indiaAllowsVideo, parseYouTubeDuration } from '../server/youtube-health.mjs';

const good = (overrides = {}) => ({
  id: 'abcdefghijk',
  status: { privacyStatus: 'public', uploadStatus: 'processed', embeddable: true },
  contentDetails: {},
  ...overrides,
});

test('weekly health classification rejects unavailable and restricted entries', () => {
  assert.equal(classifyVideoStatus(good()).dead, false);
  assert.equal(classifyVideoStatus(null).reason, 'missing');
  assert.equal(classifyVideoStatus(good({ status: { privacyStatus: 'private', uploadStatus: 'processed', embeddable: true } })).reason, 'privacy:private');
  assert.equal(classifyVideoStatus(good({ status: { privacyStatus: 'public', uploadStatus: 'uploaded', embeddable: true } })).reason, 'upload:uploaded');
  assert.equal(classifyVideoStatus(good({ status: { privacyStatus: 'public', uploadStatus: 'processed', embeddable: false } })).reason, 'not-embeddable');
  assert.equal(classifyVideoStatus(good({ contentDetails: { regionRestriction: { blocked: ['IN'] } } })).reason, 'india-blocked');
  assert.equal(classifyVideoStatus(good({ status: { privacyStatus: 'public', uploadStatus: 'processed', embeddable: true, madeForKids: true } }), { short: true }).reason, 'made-for-kids');
  assert.equal(classifyVideoStatus(good({ contentDetails: { contentRating: { ytRating: 'ytAgeRestricted' } } }), { short: true }).reason, 'age-restricted');
});

test('India region rules and ISO duration parsing are deterministic', () => {
  assert.equal(indiaAllowsVideo({ allowed: ['US', 'IN'] }), true);
  assert.equal(indiaAllowsVideo({ allowed: ['US'] }), false);
  assert.equal(indiaAllowsVideo({ blocked: ['US'] }), true);
  assert.equal(parseYouTubeDuration('PT1M12S'), 72);
  assert.equal(parseYouTubeDuration('PT2H'), 7200);
  assert.equal(parseYouTubeDuration('garbage'), 0);
});

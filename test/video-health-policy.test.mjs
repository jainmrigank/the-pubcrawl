import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  createHealthReport,
  evidenceFor,
  parseHealthReport,
  shortPruneReason,
  watchPruneReason,
} from '../scripts/video_health_policy.mjs';

test('same-run report marks missing evidence unknown rather than dead', () => {
  const at = Date.parse('2031-01-01T00:00:00Z');
  const report = createHealthReport(['alive', 'dead', 'unresolved'], {
    alive: { dead: false, views: 20_000, checkedAt: at },
    dead: { dead: true, deadReason: 'missing', checkedAt: at },
  }, { generatedAt: at, source: 'fixture' });
  assert.equal(parseHealthReport(report), report);
  assert.deepEqual(evidenceFor(report, 'unresolved'), { status: 'unknown' });
  assert.equal(evidenceFor(report, 'dead').status, 'dead');
  assert.equal(evidenceFor(report, 'alive').views, 20_000);
});

test('Watch pruning requires terminal evidence or fresh alive view evidence', () => {
  const now = Date.parse('2031-04-01T00:00:00Z');
  const old = { id: 'old', addedAt: '2030-01-01T00:00:00Z' };
  assert.equal(watchPruneReason(old, { status: 'unknown' }, { now, days: 60, minimumViews: 10_000 }), null);
  assert.equal(watchPruneReason(old, { status: 'alive', views: 9_999 }, { now, days: 60, minimumViews: 10_000 }), 'stagnant:9999');
  assert.equal(watchPruneReason(old, { status: 'alive', views: 10_000 }, { now, days: 60, minimumViews: 10_000 }), null);
  assert.equal(watchPruneReason(old, { status: 'dead', reason: 'private' }, { now }), 'private');
});

test('new unpublished Shorts survive missing health evidence while established age policy remains', () => {
  const now = Date.parse('2031-04-01T00:00:00Z');
  assert.equal(shortPruneReason({ addedAt: '2031-03-31T00:00:00Z' }, { status: 'unknown' }, { now, days: 120 }), null);
  assert.equal(shortPruneReason({ addedAt: '2030-01-01T00:00:00Z', evergreen: true }, { status: 'unknown' }, { now, days: 120 }), null);
  assert.equal(shortPruneReason({ addedAt: '2030-01-01T00:00:00Z' }, { status: 'unknown' }, { now, days: 120 }), 'older than 120 days');
  assert.equal(shortPruneReason({ addedAt: '2031-03-31T00:00:00Z' }, { status: 'dead', reason: 'deleted' }, { now }), 'deleted');
});

test('configuration validator prints names only and legacy sender defaults to a no-write dry run', () => {
  const validate = spawnSync(process.execPath, ['scripts/validate_ci_config.mjs', '--required', 'SAFE_PRESENT,SAFE_MISSING'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, SAFE_PRESENT: 'do-not-print-this-value' },
    encoding: 'utf8',
  });
  assert.equal(validate.status, 1);
  assert.match(validate.stderr, /SAFE_MISSING/);
  assert.doesNotMatch(`${validate.stdout}${validate.stderr}`, /do-not-print-this-value/);

  const diagnostic = spawnSync(process.execPath, ['scripts/send_push_notifications.mjs', '--dry-run', '--date', '2031-01-02'], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8',
  });
  assert.equal(diagnostic.status, 0, diagnostic.stderr);
  assert.match(diagnostic.stdout, /no notification sent and no production state written/);

  const safeDefault = spawnSync(process.execPath, ['scripts/send_push_notifications.mjs', '--date', '2031-01-02'], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8',
  });
  assert.equal(safeDefault.status, 0, safeDefault.stderr);
  assert.match(safeDefault.stdout, /no notification sent and no production state written/);

  const live = spawnSync(process.execPath, ['scripts/send_push_notifications.mjs', '--send'], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8',
  });
  assert.notEqual(live.status, 0);
  assert.match(live.stderr, /Legacy sender disabled/);
});

test('workflow definitions serialize health work and contain no notification schedules', () => {
  const root = new URL('..', import.meta.url);
  const daily = readFileSync(new URL('.github/workflows/daily-question.yml', root), 'utf8');
  const nudges = readFileSync(new URL('.github/workflows/bar-nudges.yml', root), 'utf8');
  const library = readFileSync(new URL('.github/workflows/watch-library.yml', root), 'utf8');
  const refresh = readFileSync(new URL('.github/workflows/watch-refresh.yml', root), 'utf8');
  assert.doesNotMatch(daily, /\bschedule:/);
  assert.doesNotMatch(nudges, /\bschedule:/);
  assert.match(daily, /--dry-run/);
  assert.match(nudges, /--dry-run/);
  assert.match(library, /pubcrawl-video-health-maintenance/);
  assert.match(refresh, /pubcrawl-video-health-maintenance/);
  assert.match(library, /--health-report/);
  assert.match(library, /--force-with-lease/);
  assert.doesNotMatch(library, /git push -f(?:\s|$)/);
});

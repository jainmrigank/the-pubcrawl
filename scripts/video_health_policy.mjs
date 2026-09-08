/** Pure policy shared by the refresh report and both catalogue pruners. */

export const VIDEO_HEALTH_REPORT_VERSION = 1;
export const TERMINAL_HEALTH_STATUSES = new Set(['dead']);

export function createHealthReport(ids, refreshed, options = {}) {
  const generatedAt = Number(options.generatedAt ?? Date.now());
  const candidates = {};
  for (const id of ids) {
    const result = refreshed[id];
    if (!result || Number(result.checkedAt) < generatedAt) {
      candidates[id] = { status: 'unknown' };
      continue;
    }
    candidates[id] = {
      status: result.dead ? 'dead' : 'alive',
      ...(result.deadReason ? { reason: String(result.deadReason) } : {}),
      ...(Number.isFinite(result.views) ? { views: Number(result.views) } : {}),
      checkedAt: Number(result.checkedAt),
    };
  }
  return {
    version: VIDEO_HEALTH_REPORT_VERSION,
    generatedAt,
    source: String(options.source || 'unknown'),
    candidates,
  };
}

export function parseHealthReport(value) {
  if (!value || Number(value.version) !== VIDEO_HEALTH_REPORT_VERSION || !value.candidates || typeof value.candidates !== 'object') {
    throw new Error('invalid video health report');
  }
  return value;
}

export function evidenceFor(report, id) {
  const evidence = report?.candidates?.[id];
  if (!evidence || !['alive', 'dead', 'unknown'].includes(evidence.status)) return { status: 'unknown' };
  return evidence;
}

export function watchPruneReason(video, evidence, options = {}) {
  if (TERMINAL_HEALTH_STATUSES.has(evidence.status)) return evidence.reason || 'confirmed unavailable';
  if (evidence.status !== 'alive') return null;
  const now = Number(options.now ?? Date.now());
  const days = Math.max(1, Number(options.days) || 60);
  const minimumViews = Math.max(0, Number(options.minimumViews) || 0);
  const addedAt = Date.parse(video?.addedAt || '');
  const oldEnough = Number.isFinite(addedAt) && addedAt < now - days * 86_400_000;
  if (oldEnough && Number.isFinite(evidence.views) && evidence.views < minimumViews) {
    return `stagnant:${evidence.views}`;
  }
  return null;
}

export function shortPruneReason(short, evidence, options = {}) {
  if (TERMINAL_HEALTH_STATUSES.has(evidence.status)) return evidence.reason || 'confirmed unavailable';
  const now = Number(options.now ?? Date.now());
  const days = Math.max(1, Number(options.days) || 120);
  const addedAt = Date.parse(short?.addedAt || '');
  const old = Number.isFinite(addedAt) && addedAt < now - days * 86_400_000;
  return old && !short?.evergreen ? `older than ${days} days` : null;
}

const SOURCES = new Set(['landing', 'nav', 'deep-link', 'direct']);

export function validateWatchEvent(body) {
  const type = String(body?.type || '');
  if (type === 'preview-impression') return { ok: true, value: { type } };
  if (type === 'open') {
    const source = String(body?.source || 'direct');
    if (!SOURCES.has(source)) return { ok: false, error: 'source must be landing, nav, deep-link, or direct' };
    return { ok: true, value: { type, source } };
  }
  return { ok: false, error: 'type must be preview-impression or open' };
}

export const emptyWatchMetrics = () => ({
  impressions: 0,
  opens: 0,
  landingOpens: 0,
  navOpens: 0,
  deepLinkOpens: 0,
  directOpens: 0,
});

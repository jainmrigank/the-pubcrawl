/** Runtime-neutral policy for PubCrawl's single daily notification campaign. */

export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
export const CAMPAIGN_START_HOUR = 17;
export const CAMPAIGN_START_MINUTE = 30;
export const CAMPAIGN_EXPIRY_HOUR = 18;
export const CAMPAIGN_REFERENCE_DATE = '2026-09-07';
export const DELIVERY_RECEIPT_TTL_SECONDS = 48 * 60 * 60;
export const CAMPAIGN_RESULT_TTL_SECONDS = 30 * 24 * 60 * 60;
export const TRANSIENT_RETRY_DELAYS_SECONDS = Object.freeze([60, 300]);
export const WELCOME_NOTIFICATION = Object.freeze({
  title: "You're in.",
  body: "Tell us what's on your shelf and we'll pour you something.",
  url: '/#/menu',
  tag: 'welcome',
});

const DAY_MS = 24 * 60 * 60 * 1000;
const KINDS = Object.freeze(['drink', 'fact', 'quiz']);
const DRINK_LINES = Object.freeze([
  (name) => ({ title: `Ever made a ${name}?`, body: "Takes about three minutes. Tonight's as good a night as any." }),
  (name) => ({ title: `${name}.`, body: "That's it. That's the suggestion." }),
  (name) => ({ title: `Tonight's idea: ${name}`, body: 'You might already have everything for it.' }),
]);
const QUIZ_LINES = Object.freeze([
  { title: 'Quick round?', body: "Today's question takes ten seconds." },
  { title: 'Know your poison?', body: "Prove it. Today's question is up." },
  { title: 'One for the road?', body: "Today's question is waiting at the bar." },
]);

function parseDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('campaign date must be YYYY-MM-DD');
  const epoch = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString().slice(0, 10) !== value) throw new Error('invalid campaign date');
  return epoch;
}

function deterministicIndex(dateKey, salt, length) {
  if (!Number.isInteger(length) || length < 1) return -1;
  let hash = 2166136261;
  for (const character of `${dateKey}:${salt}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

export function istDateKey(at = Date.now()) {
  return new Date(Number(at) + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function campaignKindForDate(dateKey) {
  const reference = parseDateKey(CAMPAIGN_REFERENCE_DATE);
  const target = parseDateKey(dateKey);
  const days = Math.floor((target - reference) / DAY_MS);
  return KINDS[((days % KINDS.length) + KINDS.length) % KINDS.length];
}

export function campaignBounds(dateKey) {
  const midnightUtc = parseDateKey(dateKey) - IST_OFFSET_MS;
  const scheduledAt = midnightUtc + (CAMPAIGN_START_HOUR * 60 + CAMPAIGN_START_MINUTE) * 60 * 1000;
  const expiresAt = midnightUtc + CAMPAIGN_EXPIRY_HOUR * 60 * 60 * 1000;
  return { scheduledAt, expiresAt };
}

export function deliveryWindow(at = Date.now(), dateKey = istDateKey(at)) {
  const now = Number(at);
  const { scheduledAt, expiresAt } = campaignBounds(dateKey);
  const eligible = Number.isFinite(now) && now >= scheduledAt && now < expiresAt;
  return {
    dateKey,
    scheduledAt,
    expiresAt,
    eligible,
    ttlSeconds: eligible ? Math.max(1, Math.floor((expiresAt - now) / 1000)) : 0,
    reason: now < scheduledAt ? 'too-early' : now >= expiresAt ? 'expired' : null,
  };
}

export function buildCampaign(dateKey, { cocktails = [], facts = [] } = {}) {
  const kind = campaignKindForDate(dateKey);
  const { scheduledAt, expiresAt } = campaignBounds(dateKey);
  let content;
  if (kind === 'drink') {
    const pool = cocktails.filter((drink) => drink?.name && drink?.thumb && !/^(kept-|custom-)/.test(String(drink.id || '')));
    if (!pool.length) throw new Error('approved drink catalogue is empty');
    const drink = pool[deterministicIndex(dateKey, 'drink', pool.length)];
    const line = DRINK_LINES[deterministicIndex(dateKey, 'drink-copy', DRINK_LINES.length)](drink.name);
    content = { ...line, url: `/#/menu?q=${encodeURIComponent(drink.name)}` };
  } else if (kind === 'fact') {
    const pool = facts.filter((fact) => typeof fact === 'string' && fact.trim());
    if (!pool.length) throw new Error('approved fact catalogue is empty');
    content = { title: 'Bar Talk', body: pool[deterministicIndex(dateKey, 'fact', pool.length)], url: '/#/menu' };
  } else {
    content = { ...QUIZ_LINES[deterministicIndex(dateKey, 'quiz-copy', QUIZ_LINES.length)], url: '/#/quiz?daily=1' };
  }
  return {
    id: dateKey,
    date: dateKey,
    kind,
    scheduledAt,
    expiresAt,
    payload: {
      ...content,
      tag: `pubcrawl-daily-${dateKey}`,
      campaignDate: dateKey,
      scheduledAt,
      expiresAt,
    },
  };
}

export function retryDelaySeconds(attempt, retryAfterSeconds, now, expiresAt) {
  const base = TRANSIENT_RETRY_DELAYS_SECONDS[attempt] ?? null;
  if (base == null) return null;
  const requested = Number(retryAfterSeconds);
  const delay = Number.isFinite(requested) && requested > base ? Math.ceil(requested) : base;
  return Number(now) + delay * 1000 < Number(expiresAt) ? delay : null;
}

export function classifyPushResult(status) {
  const code = Number(status);
  if (code >= 200 && code < 300) return 'accepted';
  if (code === 404 || code === 410) return 'expired-subscription';
  if (code === 401 || code === 403) return 'configuration-failure';
  if (code === 429 || code === 503) return 'retryable';
  return 'failed';
}

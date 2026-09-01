/**
 * Scheduled web-push sender.
 *
 * Keeping delivery in a short-lived GitHub Actions process means neither the
 * Worker nor the Render compatibility server has to stay awake for a batch of
 * notifications. Only confirmed 404/410 subscription failures are removed;
 * all other failures remain eligible for the next run.
 *
 * Run:
 *   node scripts/send_push_notifications.mjs --kind regular
 *   node scripts/send_push_notifications.mjs --kind daily --dry-run
 */
import webpush from 'web-push';
import { loadCatalog } from '../server/catalog.mjs';
import { buildDailyQuestionNudge, buildNudge } from '../server/push.mjs';

const KIND = process.argv.includes('--kind')
  ? process.argv[process.argv.indexOf('--kind') + 1]
  : 'regular';
const DRY_RUN = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const KV_URL = String(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const KV_TOKEN = String(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '');
const VAPID_PUBLIC = String(process.env.VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE = String(process.env.VAPID_PRIVATE_KEY || '').trim();
const VAPID_SUBJECT = String(process.env.VAPID_SUBJECT || 'mailto:hello@the-pubcrawl.app').trim();
const SUBS_KEY = 'pubcrawl:subs';

if (!['regular', 'daily'].includes(KIND)) throw new Error('--kind must be regular or daily');

async function kv(args) {
  if (!KV_URL || !KV_TOKEN) throw new Error('KV_REST_API_URL and KV_REST_API_TOKEN are required');
  const response = await fetch(KV_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${KV_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Upstash request failed (${response.status})`);
  const payload = await response.json();
  if (!Object.prototype.hasOwnProperty.call(payload, 'result')) throw new Error('Upstash response missing result');
  return payload.result;
}

async function readSubscriptions() {
  if (!KV_URL || !KV_TOKEN) {
    if (DRY_RUN) return [];
    throw new Error('KV_REST_API_URL and KV_REST_API_TOKEN are required');
  }
  const raw = await kv(['GET', SUBS_KEY]);
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('stored subscriptions are not an array');
  return parsed.filter((record) => record?.sub?.endpoint && typeof record.sub.endpoint === 'string');
}

const records = await readSubscriptions();
const retained = [...records];
const { cocktails } = loadCatalog();
const dailyPayload = KIND === 'daily' ? buildDailyQuestionNudge() : null;

if (!DRY_RUN) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) throw new Error('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required');
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

let sent = 0;
let failed = 0;
let removed = 0;

for (const record of records) {
  const awayDays = (Date.now() - Number(record.lastSeen || record.createdAt || 0)) / 86400000;
  const payload = dailyPayload || buildNudge(cocktails, awayDays);
  if (DRY_RUN) {
    sent += 1;
    continue;
  }
  try {
    await webpush.sendNotification(record.sub, JSON.stringify(payload));
    sent += 1;
  } catch (error) {
    failed += 1;
    const code = Number(error?.statusCode);
    if (code === 404 || code === 410) {
      const index = retained.findIndex((item) => item?.sub?.endpoint === record.sub.endpoint);
      if (index >= 0) retained.splice(index, 1);
      removed += 1;
    }
  }
}

if (!DRY_RUN) await kv(['SET', SUBS_KEY, JSON.stringify(retained)]);

// Deliberately report counts only. Endpoints, payloads, and credentials never
// belong in CI logs.
console.log(`[push] ${KIND}: sent ${sent}, failed ${failed}, removed ${removed}, total ${records.length}`);
if (DRY_RUN) console.log('[push] dry-run: no notifications sent and no Upstash write performed');

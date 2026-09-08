/**
 * Compatibility diagnostic for the retired GitHub push broadcasters.
 *
 * Production delivery is owned by the Cloudflare scheduled/Queue handlers.
 * This command is deliberately incapable of sending or writing production
 * state; keeping the familiar filename makes old manual runbooks fail safely.
 *
 * Run: node scripts/send_push_notifications.mjs [--dry-run] [--date YYYY-MM-DD]
 */
import catalogue from '../src/generated/client_catalog.json' with { type: 'json' };
import facts from '../data/facts.json' with { type: 'json' };
import { buildCampaign, istDateKey } from '../shared/push-campaign.mjs';

const SEND_REQUESTED = process.argv.includes('--send');
const dateIndex = process.argv.indexOf('--date');
const date = dateIndex >= 0 ? String(process.argv[dateIndex + 1] || '') : istDateKey();

if (SEND_REQUESTED) {
  throw new Error('Legacy sender disabled. Production delivery is owned by the Cloudflare daily campaign.');
}

const campaign = buildCampaign(date, { cocktails: catalogue.recipes, facts });
console.log(`[push] dry-run campaign: ${campaign.date} ${campaign.kind}; destination ${campaign.payload.url}`);
console.log('[push] dry-run: no notification sent and no production state written');

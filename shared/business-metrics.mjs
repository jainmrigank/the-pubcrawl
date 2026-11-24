export const siteOrigin = 'https://thepubcrawl.in';
export const hostingPrice = 39900; // INR paise
export const campaignKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];

export const legacyRecipeNames = {
  'whiskey-sour': 'Whiskey Sour',
  daiquiri: 'Daiquiri',
  margarita: 'Margarita',
  mojito: 'Mojito',
  negroni: 'Negroni',
  'old-fashioned': 'Old Fashioned',
  'espresso-martini': 'Espresso Martini',
  'irish-coffee': 'Irish Coffee',
  shikanji: 'Nimbu Shikanji',
  'masala-chaas': 'Masala Chaas',
};

export function cleanCampaign(input) {
  const fields = {};
  for (const key of campaignKeys) {
    const value = input?.[key];
    if (typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value)) fields[key] = value.toLowerCase();
  }
  return fields;
}

export const eventNames = new Set([
  'page_view', 'recipe_open', 'shelf_add', 'tab_save', 'tab_share',
  'sample_open', 'affiliate_click', 'gear_click', 'workshop_ticket_click', 'party_plan', 'party_export',
]);

const searchDomains = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com)$/;
const sourceDomains = [
  ['instagram', /(^|\.)instagram\.com$/],
  ['youtube', /(^|\.)(youtube\.com|youtu\.be)$/],
  ['x', /(^|\.)(x\.com|twitter\.com|t\.co)$/],
  ['facebook', /(^|\.)facebook\.com$/],
  ['whatsapp', /(^|\.)whatsapp\.com$/],
];
export function trafficSource(campaign, referrer) {
  if (campaign.utm_source === 'twitter') return 'x';
  if (campaign.utm_source) return campaign.utm_source;
  if (typeof referrer === 'string' && searchDomains.test(referrer)) return 'search';
  return sourceDomains.find(([, test]) => typeof referrer === 'string' && test.test(referrer))?.[0]
    || (referrer ? 'referral' : 'direct');
}

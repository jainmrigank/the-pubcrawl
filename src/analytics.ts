import { campaignKeys, cleanCampaign, type Campaign } from '../shared/business-metrics.mjs';
import { businessFetch } from './businessApi';

type ProductEvent =
  | 'recipe_open' | 'shelf_add' | 'tab_save' | 'tab_share' | 'sample_open'
  | 'affiliate_click' | 'gear_click' | 'workshop_ticket_click' | 'party_plan' | 'party_export';
type TrackerPayload = {
  website: string;
  hostname: string;
  language?: string;
  screen?: string;
  url: string;
  referrer: string;
  name?: ProductEvent;
};
type Tracker = { track: (buildPayload: (defaults: TrackerPayload) => TrackerPayload) => Promise<unknown> };
type Visit = {
  id: string; last: number; campaign: Campaign; referrer: string; referrerOrigin: string;
  entry?: string; screen?: 'narrow' | 'wide';
};
const websiteId = String(import.meta.env.VITE_UMAMI_WEBSITE_ID ?? '').trim();
const umamiConfigured = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(websiteId);
const visitKey = 'pubcrawl.analytics.visit';
const preferenceKey = 'pubcrawl.analytics.off';
let trackerLoading: Promise<Tracker | undefined> | undefined;
let currentPath: string | undefined;
let currentVisit: Visit | undefined;

export function browserAnalyticsBlocked() {
  const browser = window.navigator as Navigator & { globalPrivacyControl?: boolean };
  return browser.doNotTrack === '1' || browser.doNotTrack === 'yes' || browser.globalPrivacyControl === true;
}

export function trackingAllowed() {
  if (browserAnalyticsBlocked()) return false;
  try { return localStorage.getItem(preferenceKey) !== '1'; } catch { return true; }
}

export function setAnalyticsPreference(enabled: boolean) {
  localStorage.setItem(preferenceKey, enabled ? '0' : '1');
  if (!enabled) {
    currentVisit = undefined;
    sessionStorage.removeItem(visitKey);
  }
}

function internalDomain(domain: string) {
  return domain === location.hostname || domain === 'thepubcrawl.in' || domain === 'www.thepubcrawl.in';
}

function visit(): Visit | undefined {
  if (!trackingAllowed() || !crypto.randomUUID) return;
  const now = Date.now();
  const params = new URLSearchParams(window.location.search);
  const campaign = cleanCampaign(Object.fromEntries(campaignKeys.map(key => [key, params.get(key)])));
  if (!currentVisit) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(visitKey) || 'null') as Visit | null;
      if (saved?.id && Number.isFinite(saved.last)) currentVisit = saved;
    } catch {}
  }
  const recampaign = currentVisit && Object.keys(campaign).length &&
    campaignKeys.some(key => campaign[key] !== currentVisit?.campaign[key]);
  if (!currentVisit || now - currentVisit.last >= 30 * 60 * 1000 || recampaign) {
    let referrer = '', referrerOrigin = '';
    try {
      const source = new URL(document.referrer);
      if ((source.protocol === 'https:' || source.protocol === 'http:') && !internalDomain(source.hostname)) {
        referrer = source.hostname;
        referrerOrigin = source.origin;
      }
    } catch {}
    currentVisit = { id: crypto.randomUUID(), last: now, campaign, referrer, referrerOrigin, entry: currentPath,
      screen: matchMedia('(max-width: 767px)').matches ? 'narrow' : 'wide' };
  }
  currentVisit.last = now;
  try { sessionStorage.setItem(visitKey, JSON.stringify(currentVisit)); } catch {}
  return currentVisit;
}

export function campaignAttribution() {
  const incoming = visit();
  return incoming ? { campaign: incoming.campaign, referrer: incoming.referrer } : {};
}

function loadTracker() {
  const browser = window as Window & { umami?: Tracker };
  if (!trackerLoading) {
    trackerLoading = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cloud.umami.is/script.js';
      script.async = true;
      script.dataset.websiteId = websiteId;
      script.dataset.autoTrack = 'false';
      script.referrerPolicy = 'origin';
      script.onload = () => resolve(browser.umami);
      script.onerror = () => resolve(undefined);
      document.head.appendChild(script);
    });
  }
  return trackerLoading;
}

function send(path: string, name?: ProductEvent, detail?: string) {
  const incoming = visit();
  if (!incoming) return;
  const payload = { path, event: name || 'page_view', visit: incoming.id, entry: incoming.entry, screen: incoming.screen,
    campaign: incoming.campaign, referrer: incoming.referrer, detail };
  void businessFetch('/track', { method: 'POST', body: JSON.stringify(payload), keepalive: true }).catch(() => {});
  if (!umamiConfigured) return;
  const query = new URLSearchParams(incoming.campaign).toString();
  void loadTracker().then((tracker) => {
    if (!trackingAllowed()) return;
    return tracker?.track(({ website, hostname, language, screen }) => ({
      website, hostname, language, screen,
      url: path + (query ? '?' + query : ''),
      referrer: incoming.referrerOrigin,
      name,
    }));
  }).catch(() => {});
}

export function trackPageView(path: string) {
  if (path === currentPath) return;
  currentPath = path;
  send(path);
}

export function trackProductEvent(name: ProductEvent, detail?: string) {
  if (currentPath) send(currentPath, name, detail);
}

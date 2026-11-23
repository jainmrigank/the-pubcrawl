import './site.css';
import { browserAnalyticsBlocked, campaignAttribution, setAnalyticsPreference, trackingAllowed, trackPageView, trackProductEvent } from '../analytics';
import { businessFetch, businessJson, businessPost } from '../businessApi';

type SiteConfig = {
  leads: boolean;
  newsletter: boolean;
  checkout: boolean;
  checkoutTest: boolean;
  affiliate: Record<string, string>;
  supportEmail: string;
  merchantName: string;
  workshop: null | { date: string; venue: string; capacity: number; price: number; cancellation: string; booking: string };
};
type Order = {
  state: 'pending' | 'paid' | 'refunded' | 'expired' | 'cancelled';
  reference: string;
  receivedPaise: number;
  test: boolean;
  receiptSent: boolean;
};
const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector);
const page = $('[data-page]');
const orderKey = 'pubcrawl.hosting.order';
const currency = Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

function status(element: HTMLElement | null, message: string, error = false) {
  if (element) {
    element.textContent = message;
    element.dataset.error = String(error);
  }
}

function bindForm(form: HTMLFormElement, submit: (data: FormData, attemptId: string) => Promise<string | void>) {
  let attemptId = '';
  let fingerprint = '';
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
    if (button.disabled) return;
    const message = form.querySelector<HTMLElement>('[data-message]');
    const data = new FormData(form);
    const nextFingerprint = JSON.stringify([...data]);
    if (nextFingerprint !== fingerprint) {
      attemptId = crypto.randomUUID();
      fingerprint = nextFingerprint;
    }
    status(message, 'Working…');
    button.disabled = true;
    try {
      const success = await submit(data, attemptId);
      if (success) {
        form.reset();
        fingerprint = '';
        status(message, success);
      }
    } catch (error) {
      status(message, error instanceof Error ? error.message : 'Try again in a moment.', true);
    } finally { button.disabled = false; }
  });
}

function applyConfig(config: SiteConfig) {
  for (const field of document.querySelectorAll('[data-contact]')) {
    if (config.supportEmail) {
      const link = document.createElement('a');
      link.href = 'mailto:' + config.supportEmail;
      link.textContent = config.supportEmail;
      field.replaceChildren(link);
    } else {
      const link = document.createElement('a');
      link.href = 'https://www.instagram.com/thepubcrawl.in/';
      link.textContent = 'Pubcrawl on Instagram';
      field.replaceChildren(link);
    }
  }
  const merchant = $('[data-merchant]');
  if (merchant && config.merchantName) {
    merchant.hidden = false;
    merchant.textContent = 'Sold by ' + config.merchantName + '.';
  }
  const checkout = $<HTMLFormElement>('[data-form=checkout]');
  if (checkout) {
    checkout.hidden = !config.checkout;
    status($('[data-checkout-state]'), config.checkoutTest ? 'Test checkout. Use Razorpay test payment details.' : config.checkout
      ? 'Pay ₹399 through Razorpay with your available payment methods.' : 'Checkout is being set up. You can open the free menu now.');
    if (config.checkout) bindForm(checkout, async (data, attemptId) => {
      const result = await businessPost<{ checkout: string; token: string }>('/checkout', {
        attemptId, email: data.get('email'), ...campaignAttribution(),
      });
      try { sessionStorage.setItem(orderKey, result.token); } catch {}
      location.assign(result.checkout);
    });
  }
  const lead = $<HTMLFormElement>('[data-form=content], [data-form=workshop]');
  if (lead) {
    lead.hidden = !config.leads;
    status($('[data-lead-state]'), config.leads ? '' : 'The enquiry form is temporarily unavailable. Visit Pubcrawl on Instagram.');
    if (config.leads) bindForm(lead, async (data, attemptId) => {
      await businessPost('/enquiry', {
        ...Object.fromEntries(data), attemptId, kind: lead.dataset.form, headcount: Number(data.get('headcount')), ...campaignAttribution(),
      });
      return 'Enquiry received. We’ll reply to the email address you entered.';
    });
  }
  const newsletter = $('[data-section=newsletter]');
  if (newsletter && config.newsletter) {
    newsletter.hidden = false;
    bindForm(newsletter.querySelector('form')!, async (data, attemptId) => {
      await businessPost('/email/signup', {
        attemptId, email: data.get('email'), consent: data.get('consent') === 'on', website: data.get('website'), ...campaignAttribution(),
      });
      return 'Check your inbox for a confirmation if this address is new.';
    });
  }
  const workshop = $('[data-workshop-event]');
  if (workshop && config.workshop) {
    const event = config.workshop;
    const date = Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(event.date));
    const price = currency.format(event.price);
    $('[data-workshop-details]')!.textContent = date + ' IST · ' + event.venue + ' · ' + price + ' per seat · ' + event.capacity + ' seats total';
    $('[data-workshop-cancellation]')!.textContent = event.cancellation;
    const link = $<HTMLAnchorElement>('[data-workshop-book]')!;
    link.href = event.booking;
    link.addEventListener('click', () => trackProductEvent('workshop_ticket_click'));
    workshop.hidden = false;
  }
  for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-gear-link]')) {
    const affiliate = config.affiliate[link.dataset.gearLink || ''];
    if (!affiliate) continue;
    link.href = affiliate;
    link.rel = 'sponsored nofollow noopener';
    link.dataset.affiliate = 'true';
    link.textContent = 'Shop · affiliate link ↗';
    $('[data-affiliate-copy]')!.hidden = false;
  }
}

function bindPrivacy() {
  const button = $<HTMLButtonElement>('[data-privacy-toggle]');
  if (!button) return;
  const message = $('[data-privacy-status]');
  button.hidden = false;
  const update = () => {
    const blocked = browserAnalyticsBlocked();
    button.disabled = blocked;
    button.textContent = trackingAllowed() ? 'Turn site analytics off' : 'Turn site analytics on';
    status(message, blocked ? 'Your browser’s privacy choice keeps analytics off.' : trackingAllowed() ? 'Site analytics are on.' : 'Site analytics are off in this browser.');
  };
  button.addEventListener('click', () => {
    try { setAnalyticsPreference(!trackingAllowed()); update(); }
    catch { status(message, 'Your browser is blocking preference storage.', true); }
  });
  update();
}

async function receiptController() {
  const state = $('[data-order-state]');
  if (!state) return;
  window.addEventListener('hashchange', () => {
    if (new URLSearchParams(location.hash.slice(1)).has('access')) location.reload();
  });
  const query = new URLSearchParams(location.hash.slice(1));
  let token = query.get('access') || '';
  try {
    if (token) sessionStorage.setItem(orderKey, token);
    else token = sessionStorage.getItem(orderKey) || '';
  } catch {}
  const callback = location.search.includes('razorpay_');
  if (location.search || location.hash) history.replaceState(null, '', location.pathname);
  if (!token) {
    status(state, 'Open the order link in your receipt email to check a payment or download the pack.');
    return;
  }
  const refresh = $<HTMLButtonElement>('[data-order-refresh]')!;
  const download = $<HTMLButtonElement>('[data-order-download]')!;
  const details = $('[data-order-facts]')!;
  async function show(refreshPayment: boolean) {
    refresh.disabled = true;
    status(state, 'Checking your order…');
    try {
      const order = await businessPost<Order>('/order', { token, refresh: refreshPayment });
      const messages = {
        paid: order.test ? 'Test payment confirmed. The pack is ready.' : order.receiptSent ? 'Payment confirmed. Your pack is ready and your receipt has been emailed.' : 'Payment confirmed. You can download the pack here.',
        pending: 'Payment is awaiting confirmation. If you just paid, check again in a moment.',
        refunded: 'This order has been refunded.',
        cancelled: 'Checkout was cancelled. You can start a new purchase from the pack page.',
        expired: 'This payment link expired. You can start a new purchase from the pack page.',
      };
      status(state, messages[order.state]);
      details.hidden = false;
      $('[data-order-reference]')!.textContent = order.reference;
      $('[data-order-amount]')!.textContent = currency.format(order.receivedPaise / 100);
      download.hidden = order.state !== 'paid';
      refresh.hidden = order.state !== 'pending';
    } catch (error) {
      refresh.hidden = false;
      status(state, error instanceof Error ? error.message : 'Try again in a moment.', true);
    } finally { refresh.disabled = false; }
  }
  refresh.addEventListener('click', () => void show(true));
  download.addEventListener('click', async () => {
    download.disabled = true;
    try {
      const response = await businessFetch('/order/download', { method: 'POST', body: JSON.stringify({ token }) });
      if (!response.ok) throw new Error('Download unavailable. Check your payment status and try again.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = 'the-pubcrawl-hosting-pack.html';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (error) { status(state, error instanceof Error ? error.message : 'Try again.', true); }
    finally { download.disabled = false; }
  });
  await show(callback);
}

function emailController() {
  const state = $('[data-email-state]');
  if (!state) return;
  const button = $<HTMLButtonElement>('[data-email-action]')!;
  let flow = 0;
  function readLink() {
    const params = new URLSearchParams(location.hash.slice(1));
    const action = params.has('confirm') ? 'confirm' : params.has('unsubscribe') ? 'unsubscribe' : '';
    const token = params.get(action);
    if (!action || !token) return;
    const current = ++flow;
    history.replaceState(null, '', location.pathname);
    button.hidden = false;
    button.disabled = false;
    button.textContent = action === 'confirm' ? 'Confirm email signup' : 'Unsubscribe';
    status(state, action === 'confirm' ? 'Confirm that you want to receive Pubcrawl hosting ideas by email.' : 'Remove your address from Pubcrawl’s mailing list.');
    button.onclick = async () => {
      button.disabled = true;
      try {
        const result = await businessPost<{ confirmed?: boolean }>('/email/' + action, { token });
        if (current !== flow) return;
        status(state, action === 'unsubscribe' ? 'You’re unsubscribed.' : result.confirmed ? 'You’re subscribed.' : 'This link is no longer active. You can sign up for a new one.');
        button.hidden = true;
      } catch (error) {
        if (current === flow) status(state, error instanceof Error ? error.message : 'Try again.', true);
      } finally {
        if (current === flow) button.disabled = false;
      }
    };
  }
  readLink();
  window.addEventListener('hashchange', readLink);
}

function bindGear() {
  const search = $<HTMLInputElement>('[data-gear-search]');
  if (!search) return;
  search.closest('label')!.hidden = false;
  const items = Array.from(document.querySelectorAll<HTMLElement>('[data-gear]'));
  search.addEventListener('input', () => {
    const words = search.value.toLowerCase().trim().split(/\s+/);
    for (const item of items) item.hidden = !words.every(word => item.dataset.keywords?.toLowerCase().includes(word));
    $('[data-gear-empty]')!.hidden = items.some(item => !item.hidden);
  });
  for (const link of document.querySelectorAll<HTMLElement>('[data-gear-link]')) {
    link.addEventListener('click', () => trackProductEvent(link.dataset.affiliate === 'true' ? 'affiliate_click' : 'gear_click', link.dataset.gearLink));
  }
}

if (page?.dataset.track === 'true') {
  const path = page.dataset.page!.replace(/\/$/, '') || '/';
  trackPageView(path);
  if (path.startsWith('/recipes/')) trackProductEvent('recipe_open');
  if (path === '/hosting-sample') trackProductEvent('sample_open');
}

$('[data-print]')?.addEventListener('click', () => window.print());
$('[data-share-recipe]')?.addEventListener('click', async () => {
  const url = document.querySelector<HTMLLinkElement>('link[rel=canonical]')!.href;
  const shareMessage = $('[data-share-message]');
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ url, title: document.title });
    } else {
      await navigator.clipboard.writeText(url);
      status(shareMessage, 'Recipe link copied.');
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    status(shareMessage, 'Share this recipe at ' + url);
  }
});
bindPrivacy();
bindGear();
void receiptController();
emailController();
if ($('[data-contact], [data-form], [data-gear-link], [data-workshop-event]')) {
  void businessJson<SiteConfig>('/config').then(applyConfig).catch(() => {
    status($('[data-lead-state]'), 'The enquiry form is temporarily unavailable. Try again shortly.');
    status($('[data-checkout-state]'), 'Checkout is temporarily unavailable. You can open the free menu now.');
  });
}
if ($('[data-ops-login]')) void import('./operator').then(({ mountOperator }) => mountOperator());

import { cleanCampaign, eventNames, hostingPrice, trafficSource } from './business-metrics.mjs';
import { createOrders } from './business-orders.mjs';
import { DAY, BusinessError, digest, emailAddress, equalStrings, json, mailer, parseBody, publicOrigin, rawBody, secureLink, signer, text, uuidPattern } from './business-utils.mjs';
import { createBusinessStore, istDay, metric, metricField } from './business-store.mjs';
import { siteRecipes } from './site-recipes.mjs';

const paths = new Set([
  '/', '/menu', '/taste-map', '/bar', '/basics', '/tab', '/quiz', '/watch', '/shorts', '/atlas',
  '/start', '/recipes', '/hosting-pack', '/hosting-sample', '/work-with-us',
  '/gurgaon-mocktail-workshop', '/barware', '/batch-mocktails-for-10', '/privacy',
  ...siteRecipes.map(recipe => '/recipes/' + recipe.slug),
]);
const optionalAffiliateKeys = ['jigger', 'shaker', 'strainer', 'soda'];
const ACTION_LIMITS = { enquiry: 8, checkout: 12, order: 45, email: 8 };

function affiliateLinks(config) {
  try {
    const input = JSON.parse(config || '{}');
    return Object.fromEntries(optionalAffiliateKeys.flatMap(key => {
      const url = secureLink(input[key]);
      return url ? [[key, url]] : [];
    }));
  } catch { return {}; }
}

function workshopConfig(config) {
  try {
    const event = JSON.parse(config || '{}');
    const date = new Date(event.date);
    const booking = secureLink(event.booking);
    if (date.getTime() > Date.now() && booking && typeof event.venue === 'string' && event.venue.trim() &&
        Number.isInteger(event.capacity) && event.capacity > 0 && Number.isInteger(event.price) && event.price > 0 &&
        typeof event.cancellation === 'string' && event.cancellation.trim()) {
      return { date: date.toISOString(), booking, capacity: event.capacity, price: event.price, venue: event.venue, cancellation: event.cancellation };
    }
  } catch {}
  return null;
}

function referral(input) {
  return typeof input === 'string' && /^[a-z0-9.-]{1,128}$/i.test(input) ? input.toLowerCase() : '';
}

function attribution(input) {
  const campaign = cleanCampaign(input.campaign);
  return { campaign, source: trafficSource(campaign, referral(input.referrer)) };
}

const field = (name, path, row, value = 1, day = istDay()) => metric(day, metricField(name, path, row.source, row.campaign), value);

export function createBusinessService(env, { memory = false, fetcher = fetch } = {}) {
  const store = createBusinessStore(env, memory);
  const tokens = signer(env);
  const mail = mailer(env, fetcher);
  const orderEnv = memory && String(env.RAZORPAY_KEY_ID || '').startsWith('rzp_live_') ? { ...env, RAZORPAY_KEY_ID: '' } : env;
  const orders = createOrders(orderEnv, store, tokens, mail, fetcher);
  const origin = publicOrigin(env);
  const contactEmail = emailAddress(env.PUBCRAWL_CONTACT_EMAIL);
  const newsletter = store.available && tokens.available && mail.available && Boolean(contactEmail);
  const adminKey = String(env.PUBCRAWL_BUSINESS_ADMIN_KEY || '');
  const config = {
    leads: store.available && (memory || adminKey.length >= 32),
    newsletter,
    checkout: orders.available,
    checkoutTest: orders.available && orders.test,
    affiliate: affiliateLinks(env.PUBCRAWL_AFFILIATE_LINKS_JSON),
    supportEmail: contactEmail,
    merchantName: String(env.PUBCRAWL_MERCHANT_NAME || '').trim(),
    price: hostingPrice,
  };

  async function limit(request, action) {
    const address = request.headers.get('cf-connecting-ip') || request.headers.get('x-pubcrawl-local-client') || 'unknown';
    const client = await digest(String(env.RATE_LIMIT_SALT || adminKey || 'pubcrawl-local') + ':' + address);
    if (await store.rate(action + ':' + client, 3600) > ACTION_LIMITS[action]) {
      throw new BusinessError(429, 'Too many requests. Please try again later.');
    }
  }

  async function track(request, input) {
    if (request.headers.get('dnt') === '1' || request.headers.get('sec-gpc') === '1') return json({ ok: true });
    if (!paths.has(input.path) || !eventNames.has(input.event) || typeof input.visit !== 'string' || !uuidPattern.test(input.visit)) {
      throw new BusinessError(400, 'Unknown analytics event');
    }
    const { campaign, source } = attribution(input);
    const detail = ['affiliate_click', 'gear_click'].includes(input.event) && optionalAffiliateKeys.includes(input.detail) ? input.detail : '';
    const entry = paths.has(input.entry) ? input.entry : input.path;
    const screen = ['narrow', 'wide'].includes(input.screen) ? input.screen : '';
    await store.recordTrack(istDay(), await digest(input.visit), {
      visit: metricField('visit', '', source, campaign),
      entry: metricField('entry_view', entry, source, campaign, screen),
      engaged: ['shelf_add', 'tab_save'].includes(input.event) ? metricField('engaged_visit', '', source, campaign) : '',
      action: metricField(input.event, input.path, source, campaign, detail),
    });
    return json({ ok: true });
  }

  async function submitLead(input) {
    if (!config.leads) throw new BusinessError(503, 'The enquiry form is being set up.');
    const id = input.attemptId;
    if (input.website) return json({ received: true });
    if (typeof id !== 'string' || !uuidPattern.test(id)) throw new BusinessError(400, 'Reload the page and try again.');
    const kind = input.kind;
    if (kind !== 'content' && kind !== 'workshop') throw new BusinessError(400, 'Choose an enquiry type');
    const email = emailAddress(input.email);
    if (!email) throw new BusinessError(400, 'Enter a valid email address.');
    const row = {
      id, kind, email, name: text(input.name, 1, 100), organisation: text(input.organisation, 1, 120),
      details: text(input.details, 8, 1200), status: 'new', time: Date.now(), ...attribution(input),
    };
    if (kind === 'workshop') {
      if (!Number.isInteger(input.headcount) || input.headcount < 2 || input.headcount > 500) throw new BusinessError(400, 'Enter a group size from 2 to 500.');
      row.headcount = input.headcount;
      row.location = text(input.location, 1, 100);
      row.date = text(input.date, 0, 10);
      if (row.date) {
        const date = new Date(row.date + 'T00:00:00Z');
        if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== row.date || row.date < istDay()) {
          throw new BusinessError(400, 'Choose a date from today onward.');
        }
      }
    } else {
      row.budget = text(input.budget, 0, 80);
    }
    await store.write('lead', id, row, { mode: 'once', ttl: 180 * DAY, index: true, deltas: [
      field('enquiry', kind === 'content' ? '/work-with-us' : '/gurgaon-mocktail-workshop', row),
    ] });
    return json({ received: true });
  }

  async function changeLead(input) {
    if (typeof input.id !== 'string' || !uuidPattern.test(input.id) || !['new', 'qualified', 'won', 'closed'].includes(input.status)) throw new BusinessError(400, 'Invalid lead update');
    const lead = await store.get('lead', input.id);
    if (!lead) throw new BusinessError(404, 'Enquiry unavailable');
    const updated = { ...lead, status: input.status };
    await store.write('lead', lead.id, updated, { ttl: Math.max(DAY, 180 * DAY - Math.round((Date.now() - lead.time) / 1000)) });
    if (['qualified', 'won'].includes(input.status)) {
      const path = lead.kind === 'content' ? '/work-with-us' : '/gurgaon-mocktail-workshop';
      for (const status of input.status === 'won' ? ['qualified', 'won'] : ['qualified']) {
        await store.write('lead-' + status, lead.id, true, { mode: 'once', ttl: 180 * DAY,
          deltas: [field(status + '_enquiry', path, lead, 1, istDay(lead.time))] });
      }
    }
    return json({ status: updated.status });
  }

  async function startSignup(input) {
    if (!newsletter) throw new BusinessError(503, 'Email signup is being set up.');
    if (input.website) return json({ accepted: true });
    const email = emailAddress(input.email);
    const id = input.attemptId;
    if (!email || input.consent !== true || typeof id !== 'string' || !uuidPattern.test(id)) {
      throw new BusinessError(400, 'Enter an email address and opt in to receive the newsletter.');
    }
    const existing = await store.get('subscriber', await digest(email));
    if (existing?.active) return json({ accepted: true });
    await store.write('signup', id, { email, time: Date.now(), ...attribution(input) }, { mode: 'once', ttl: 2 * DAY });
    const pending = await store.get('signup', id);
    if (pending.email !== email) throw new BusinessError(409, 'Start again to change the email address.');
    const token = await tokens.issue('confirm', id);
    await mail.send({ to: email, idempotency: 'pubcrawl-confirm-' + id, subject: 'Confirm your Pubcrawl email signup',
      body: 'Confirm your signup for The Pubcrawl’s hosting ideas and recipes.\n\n' + origin + '/email/#confirm=' + token +
        '\n\nThe link is valid for 48 hours.' });
    return json({ accepted: true });
  }

  async function confirmSignup(input) {
    const id = await tokens.verify('confirm', input.token);
    const pending = id && await store.get('signup', id);
    if (!pending) throw new BusinessError(404, 'This confirmation link has expired. Sign up again for a fresh link.');
    const hash = await digest(pending.email);
    const old = await store.get('subscriber', hash);
    if (old?.active || (old && old.updatedAt >= pending.time)) return json({ confirmed: Boolean(old?.active) });
    const row = { email: pending.email, active: true, updatedAt: pending.time, confirmedAt: Date.now() };
    await store.write('subscriber', hash, row, { mode: 'newer', time: pending.time, index: true,
      deltas: [field('email_signup', '/hosting-sample', pending)],
    });
    return json({ confirmed: Boolean((await store.get('subscriber', hash))?.active) });
  }

  async function unsubscribe(input) {
    const hash = await tokens.verify('unsubscribe', input.token);
    const subscriber = hash && await store.get('subscriber', hash);
    if (!subscriber) throw new BusinessError(404, 'This email preferences link is unavailable.');
    await store.write('subscriber', hash, { email: '', active: false, updatedAt: Date.now() }, { mode: 'newer', index: true });
    return json({ unsubscribed: true });
  }

  async function report(url) {
    const days = Math.max(1, Math.min(30, Math.floor(Number(url.searchParams.get('days'))) || 7));
    const dates = Array.from({ length: days }, (_, index) => istDay(Date.now() - (days - index - 1) * DAY * 1000));
    const daily = [];
    // The oldest daily hashes can be fetched in small batches. Workers cap
    // simultaneous external connections.
    for (let i = 0; i < dates.length; i += 5) {
      daily.push(...await Promise.all(dates.slice(i, i + 5).map(async day => {
        const rows = await store.readMetrics(day);
        return { day, metrics: rows.map(([label, value]) => {
          const [event, path, source, campaign, content, detail = '', medium = ''] = JSON.parse(label);
          return { event, path, source, campaign, content, detail, medium, value: Number(value) };
        }) };
      })));
    }
    const [leads, orders] = await Promise.all([store.list('lead'), store.list('paid', 25)]);
    return json({ daily, leads, orders });
  }

  async function subscribers(url) {
    const offset = Math.max(0, Math.floor(Number(url.searchParams.get('offset'))) || 0);
    const rows = await store.list('subscriber', 100, offset);
    const active = rows.filter(row => row.active);
    return json({
      items: await Promise.all(active.map(async row => ({
        email: row.email,
        unsubscribe: origin + '/email/#unsubscribe=' + await tokens.issue('unsubscribe', await digest(row.email)),
      }))),
      next: rows.length === 100 ? offset + 100 : null,
    });
  }

  return async function handleBusiness(request) {
    const url = new URL(request.url);
    const path = url.pathname.slice('/api/business'.length).replace(/\/$/, '');
    const method = request.method;
    if (method === 'GET' && path === '/config') return json({ ...config, workshop: workshopConfig(env.PUBCRAWL_WORKSHOP_JSON) });
    try {
      if (path.startsWith('/admin/')) {
        if (adminKey.length < 32 || !equalStrings(request.headers.get('authorization'), 'Bearer ' + adminKey)) {
          throw new BusinessError(401, 'Enter the analytics access key.');
        }
      }
      if (!store.available) throw new BusinessError(503, 'The service is being set up.');
      if (method === 'GET' && path === '/admin/report') return await report(url);
      if (method === 'GET' && path === '/admin/subscribers') return await subscribers(url);
      if (method !== 'POST') throw new BusinessError(404, 'Page unavailable');
      if (path === '/webhook/razorpay') return await orders.receiveWebhook(request, await rawBody(request, 65536));
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new BusinessError(415, 'Use application/json');
      const input = parseBody(await rawBody(request));
      switch (path) {
        case '/track': return await track(request, input);
        case '/enquiry': await limit(request, 'enquiry'); return await submitLead(input);
        case '/checkout': await limit(request, 'checkout'); return await orders.requestCheckout(input);
        case '/order': await limit(request, 'order'); return await orders.openOrder(input);
        case '/order/download': await limit(request, 'order'); return await orders.openOrder(input, true);
        case '/email/signup': await limit(request, 'email'); return await startSignup(input);
        case '/email/confirm': return await confirmSignup(input);
        case '/email/unsubscribe': return await unsubscribe(input);
        case '/admin/lead': return await changeLead(input);
        default: throw new BusinessError(404, 'Page unavailable');
      }
    } catch (error) {
      if (error instanceof BusinessError) return json({ error: error.message }, error.status);
      return json({ error: 'The service is temporarily unavailable. Try again shortly.' }, 503);
    }
  };
}

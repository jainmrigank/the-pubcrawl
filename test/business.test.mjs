import assert from 'node:assert/strict';
import test from 'node:test';
import { createBusinessService } from '../shared/business-service.mjs';
import { sign } from '../shared/business-utils.mjs';
import { buildPartyPlan, partyRecipes } from '../shared/party-plan.mjs';
import { hostingPrice } from '../shared/business-metrics.mjs';

const credentials = {
  PUBCRAWL_BUSINESS_ADMIN_KEY: 'business-tests-admin-key-000000000000',
  PUBCRAWL_BUSINESS_SIGNING_KEY: 'business-tests-signing-key-0000000000',
  RAZORPAY_KEY_ID: 'rzp_test_not_a_real_key',
  RAZORPAY_KEY_SECRET: 'unit-test-key',
  RAZORPAY_WEBHOOK_SECRET: 'unit-test-webhook',
  RESEND_API_KEY: 'unit-test-resend',
  PUBCRAWL_EMAIL_FROM: 'Pubcrawl <pubcrawl@example.test>',
  PUBCRAWL_CONTACT_EMAIL: 'help@example.test',
  PUBCRAWL_MERCHANT_NAME: 'Pubcrawl Test',
};

const response = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
function providerMock() {
  const emails = [];
  const links = new Map();
  const fetcher = async (href, init = {}) => {
    const url = new URL(href);
    if (url.hostname === 'api.resend.com') {
      emails.push({ ...JSON.parse(init.body), idempotency: init.headers['idempotency-key'] });
      return response({ id: 'mail_1' });
    }
    if (url.pathname === '/v1/payment_links' && init.method === 'GET') {
      const reference = url.searchParams.get('reference_id');
      return response({ payment_links: links.has(reference) ? [links.get(reference)] : [] });
    }
    if (url.pathname === '/v1/payment_links' && init.method === 'POST') {
      const form = JSON.parse(init.body);
      assert.equal(form.amount, hostingPrice);
      assert.equal(form.currency, 'INR');
      assert.equal(form.accept_partial, false);
      const link = { ...form, id: 'plink_example', short_url: 'https://rzp.io/rzp/example', status: 'created' };
      links.set(form.reference_id, link);
      return response(link);
    }
    if (url.pathname === '/v1/payment_links/plink_example') return response([...links.values()][0]);
    if (url.pathname === '/v1/payments/pay_example') return response({ id: 'pay_example', amount_refunded: hostingPrice });
    throw new Error('Unexpected provider call');
  };
  return { emails, links, fetcher };
}
function client(env = credentials) {
  const mock = providerMock();
  const handle = createBusinessService(env, { memory: true, fetcher: mock.fetcher });
  const call = (path, body, headers) => handle(new Request('https://thepubcrawl.in/api/business' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  }));
  const auth = { authorization: 'Bearer ' + credentials.PUBCRAWL_BUSINESS_ADMIN_KEY };
  const report = async () => (await call('/admin/report?days=1', undefined, auth)).json();
  const metrics = async () => (await report()).daily[0].metrics;
  const sendWebhook = async (event, correct = true) => {
    const raw = JSON.stringify(event);
    return call('/webhook/razorpay', raw, { 'x-razorpay-signature': correct ? await sign(credentials.RAZORPAY_WEBHOOK_SECRET, raw) : 'invalid' });
  };
  return { ...mock, call, auth, report, metrics, sendWebhook };
}
const events = (rows, name) => rows.find(row => row.event === name)?.value || 0;

test('campaign metrics distinguish visits, actions and first engagement while respecting privacy choices', async () => {
  const api = client({});
  const visit = crypto.randomUUID();
  const arrival = { visit, entry: '/recipes/whiskey-sour', screen: 'narrow', campaign: {
    utm_source: 'Instagram', utm_medium: 'organic_social', utm_content: 'night-story', email: 'someone@example.test',
  } };
  const track = (event, path, headers) => api.call('/track', { ...arrival, event, path }, headers);
  assert.equal((await track('page_view', '/recipes/whiskey-sour')).status, 200);
  assert.equal((await track('shelf_add', '/bar', { 'sec-gpc': '1' })).status, 200);
  assert.equal((await track('shelf_add', '/bar?ingredient=private')).status, 400);
  assert.equal((await api.call('/admin/report')).status, 401);
  assert.deepEqual(await (await api.call('/config')).json(), {
    leads: true, newsletter: false, checkout: false, checkoutTest: false, affiliate: {}, supportEmail: '',
    merchantName: '', price: 39900, workshop: null,
  });

  const authorised = client();
  const send = (event, path, headers) => authorised.call('/track', { ...arrival, event, path }, headers);
  await Promise.all([send('page_view', '/recipes/whiskey-sour'), send('shelf_add', '/bar'), send('tab_save', '/menu')]);
  await send('shelf_add', '/bar', { dnt: '1' });
  const rows = await authorised.metrics();
  assert.equal(events(rows, 'visit'), 1);
  assert.deepEqual(rows.filter(row => row.event === 'entry_view').map(row => [row.path, row.detail, row.value]), [['/recipes/whiskey-sour', 'narrow', 1]]);
  assert.equal(events(rows, 'engaged_visit'), 1);
  assert.equal(events(rows, 'shelf_add'), 1);
  assert.equal(events(rows, 'tab_save'), 1);
  assert.ok(rows.every(row => row.source === 'instagram' && row.medium === 'organic_social' && row.content === 'night-story'));
  assert.doesNotMatch(JSON.stringify(rows), /someone|@|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}/);
});

test('enquiry retries count once and qualification is measured once', async () => {
  const api = client();
  const id = crypto.randomUUID();
  const data = { attemptId: id, name: 'Organizer', organisation: 'Example Café', email: 'owner@example.test', kind: 'content', details: 'Please develop our group drinks menu.', campaign: { utm_source: 'x' } };
  assert.equal((await api.call('/enquiry', data)).status, 200);
  assert.equal((await api.call('/enquiry', data)).status, 200);
  assert.equal((await api.call('/enquiry', { ...data, kind: 'workshop', headcount: 12, location: 'Gurgaon', date: '2099-02-31' })).status, 400);
  const update = status => api.call('/admin/lead', { id, status }, api.auth);
  assert.equal((await update('qualified')).status, 200);
  assert.equal((await update('won')).status, 200);
  assert.equal((await update('won')).status, 200);
  const { leads, daily } = await api.report();
  assert.equal(leads.length, 1);
  assert.equal(leads[0].status, 'won');
  assert.equal(events(daily[0].metrics, 'enquiry'), 1);
  assert.equal(events(daily[0].metrics, 'qualified_enquiry'), 1);
  assert.equal(events(daily[0].metrics, 'won_enquiry'), 1);
});

test('verified capture unlocks the pack and records one sale, receipt and refund on replay', async () => {
  const api = client();
  const id = crypto.randomUUID();
  const checkout = { attemptId: id, email: 'buyer@example.test', campaign: { utm_source: 'instagram', utm_content: 'story' } };
  const localWithLiveKeys = client({ ...credentials, RAZORPAY_KEY_ID: 'rzp_live_dummy' });
  assert.equal((await localWithLiveKeys.call('/checkout', checkout)).status, 503);
  const first = await api.call('/checkout', checkout);
  assert.equal(first.status, 200);
  const { token } = await first.json();
  assert.deepEqual(await (await api.call('/checkout', checkout)).json(), { token, checkout: 'https://rzp.io/rzp/example' });
  assert.equal((await api.call('/order/download', { token })).status, 403);
  const link = api.links.get(id);
  Object.assign(link, { status: 'paid', amount_paid: hostingPrice, payments: [{ payment_id: 'pay_example', amount: hostingPrice, status: 'captured' }] });
  const event = { event: 'payment_link.paid', payload: {
    payment_link: { entity: link }, payment: { entity: { id: 'pay_example', amount: hostingPrice, status: 'captured', fee: 942 } },
  } };
  assert.equal((await api.sendWebhook(event, false)).status, 401);
  assert.equal((await api.call('/order/download', { token })).status, 403);
  assert.equal((await api.sendWebhook(event)).status, 200);
  assert.equal((await api.sendWebhook(event)).status, 200);
  const order = await (await api.call('/order', { token })).json();
  assert.equal(order.receivedPaise, hostingPrice);
  assert.equal(order.state, 'paid');
  assert.equal(order.test, true);
  assert.equal(api.emails.length, 1);
  assert.ok(api.emails[0].text.includes('/order/#access=' + token));
  const file = await api.call('/order/download', { token });
  assert.equal(file.status, 200);
  assert.match(file.headers.get('content-disposition'), /attachment/);
  assert.match(await file.text(), /Jamun and mango/);
  const refund = { event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_example', payment_id: 'pay_example', amount: hostingPrice, currency: 'INR', status: 'processed' } } } };
  assert.equal((await api.sendWebhook(refund)).status, 200);
  assert.equal((await api.sendWebhook(refund)).status, 200);
  assert.equal((await api.call('/order/download', { token })).status, 403);
  const rows = await api.metrics();
  assert.equal(events(rows, 'test_begin_checkout'), 1);
  assert.equal(events(rows, 'test_checkout_completed'), 1);
  assert.equal(events(rows, 'test_purchase'), 1);
  assert.equal(events(rows, 'purchase'), 0);
  assert.equal(events(rows, 'test_refund_paise'), hostingPrice);
  assert.equal(events(rows, 'test_gateway_fee_paise'), 942);
  assert.equal(events(rows, 'test_gateway_fee_reported'), 1);
});

test('email opt-in is counted after confirmation and an old link cannot undo unsubscribe', async () => {
  const api = client();
  const email = 'subscriber@example.test';
  const form = { email, consent: true, attemptId: crypto.randomUUID() };
  assert.equal((await api.call('/email/signup', { ...form, consent: false })).status, 400);
  assert.equal((await api.call('/email/signup', form)).status, 200);
  assert.equal(events(await api.metrics(), 'email_signup'), 0);
  const token = api.emails[0].text.match(/#confirm=([^\s]+)/)[1];
  assert.equal((await api.call('/email/confirm', { token })).status, 200);
  assert.equal((await api.call('/email/confirm', { token })).status, 200);
  assert.equal(events(await api.metrics(), 'email_signup'), 1);
  const { items } = await (await api.call('/admin/subscribers', undefined, api.auth)).json();
  assert.equal(items[0].email, email);
  const unsubscribe = new URLSearchParams(new URL(items[0].unsubscribe).hash.slice(1)).get('unsubscribe');
  assert.equal((await api.call('/email/unsubscribe', { token: unsubscribe })).status, 200);
  assert.deepEqual(await (await api.call('/email/confirm', { token })).json(), { confirmed: false });
  assert.deepEqual((await (await api.call('/admin/subscribers', undefined, api.auth)).json()).items, []);
});

test('batch calculations scale each drink, combine quantities and identify Shelf ingredients', () => {
  const sheet = buildPartyPlan([
    { recipe: partyRecipes[0], servings: 6 },
    { recipe: partyRecipes[1], servings: 12 },
  ], ['Lime juice']);
  assert.deepEqual(sheet.rows.find(row => row.name === 'Lime juice'), { name: 'Lime juice', unit: 'ml', prepare: 150, serve: 0, onShelf: true });
  assert.equal(sheet.rows.find(row => row.name === 'Sugar syrup (1:1)').prepare, 360);
  assert.equal(sheet.rows.find(row => row.name === 'Chilled water').serve, 1980);
  assert.throws(() => buildPartyPlan([{ recipe: partyRecipes[0], servings: 0 }]), RangeError);
});

test('shelving offers closes public submissions while keeping tracking and reports available', async () => {
  const api = client({ ...credentials, PUBCRAWL_PUBLIC_OFFERS: '0' });
  const config = await (await api.call('/config')).json();
  assert.equal(config.leads, false);
  assert.equal(config.checkout, false);
  assert.equal(config.newsletter, false);
  for (const path of ['/enquiry', '/checkout', '/email/signup']) {
    assert.equal((await api.call(path, {})).status, 503);
  }
  assert.equal((await api.call('/track', { visit: crypto.randomUUID(), event: 'page_view', path: '/' })).status, 200);
  assert.equal(events(await api.metrics(), 'visit'), 1);
});

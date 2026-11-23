import { cleanCampaign, hostingPrice, trafficSource } from './business-metrics.mjs';
import { istDay, metric, metricField } from './business-store.mjs';
import { hostingPackDownload } from './hosting-pack.mjs';
import { BusinessError, DAY, emailAddress, equalStrings, json, parseBody, publicOrigin, secureLink, sign, uuidPattern } from './business-utils.mjs';

const linkPattern = /^plink_[a-zA-Z0-9]+$/;
const paymentPattern = /^pay_[a-zA-Z0-9]+$/;
const orderPath = '/hosting-pack';
const orderMetric = (name, order, day, value) => metric(day, metricField(order.mode === 'test' ? 'test_' + name : name, orderPath, order.source, order.campaign), value);

export function createOrders(env, store, tokens, mail, fetcher) {
  const key = env.RAZORPAY_KEY_ID || '';
  const keySecret = env.RAZORPAY_KEY_SECRET || '';
  const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET || '';
  const contactEmail = emailAddress(env.PUBCRAWL_CONTACT_EMAIL);
  const merchant = String(env.PUBCRAWL_MERCHANT_NAME || '').trim();
  const available = store.available && tokens.available && mail.available && Boolean(contactEmail && merchant && keySecret && webhookSecret && /^rzp_(test|live)_/.test(key));
  const origin = publicOrigin(env);

  async function gateway(method, path, body) {
    const response = await fetcher('https://api.razorpay.com/v1' + path, {
      method,
      headers: { authorization: 'Basic ' + btoa(key + ':' + keySecret), 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
    const result = await response.json().catch(() => ({}));
    return response.ok ? result : null;
  }

  async function requestCheckout(input) {
    if (!available) throw new BusinessError(503, 'Checkout is being set up. The free menu is available now.');
    const id = input.attemptId;
    const email = emailAddress(input.email);
    if (!email || typeof id !== 'string' || !uuidPattern.test(id)) throw new BusinessError(400, 'Enter a valid delivery email and try again.');
    const campaign = cleanCampaign(input.campaign);
    const referrer = typeof input.referrer === 'string' && /^[a-z0-9.-]{1,128}$/i.test(input.referrer) ? input.referrer : '';
    const row = { id, email, campaign, source: trafficSource(campaign, referrer), createdAt: Date.now(), amount: hostingPrice, mode: key.startsWith('rzp_test_') ? 'test' : 'live' };
    await store.write('order', id, row, { mode: 'once' });
    const order = await store.get('order', id);
    if (order.email !== email) throw new BusinessError(409, 'Start a new checkout to change the delivery email.');
    const token = await tokens.issue('order', id);
    const stored = await store.get('checkout', id);
    if (stored) return json({ checkout: stored.url, token });
    if (!(await store.write('checkout-lock', id, true, { mode: 'once', ttl: 20 }))) {
      throw new BusinessError(409, 'Checkout is being prepared. Try again in a few seconds.');
    }

    const query = new URLSearchParams({ reference_id: id, count: '1' });
    const previous = await gateway('GET', '/payment_links?' + query);
    const link = previous?.payment_links?.find(link => link.reference_id === id) ?? await gateway('POST', '/payment_links', {
      amount: hostingPrice,
      currency: 'INR',
      accept_partial: false,
      expire_by: Math.floor(Date.now() / 1000) + 3600,
      reference_id: id,
      description: 'The Pubcrawl Hosting Pack',
      customer: { email },
      notify: { sms: false, email: false },
      reminder_enable: false,
      callback_url: origin + '/order/',
      callback_method: 'get',
    });
    const shortUrl = secureLink(link?.short_url);
    const host = shortUrl && new URL(shortUrl).hostname;
    if (!linkPattern.test(link?.id || '') || link.reference_id !== id || Number(link.amount) !== hostingPrice ||
        link.currency !== 'INR' || !host || (host !== 'rzp.io' && host !== 'razorpay.com' && !host.endsWith('.razorpay.com'))) {
      throw new BusinessError(503, 'Could not start checkout. Try again in a moment.');
    }
    const createdDay = istDay(order.createdAt);
    await store.write('checkout', id, { id: link.id, url: shortUrl }, { mode: 'once',
      deltas: [orderMetric('begin_checkout', order, createdDay)],
    });
    return json({ checkout: shortUrl, token });
  }

  async function sendReceipt(order) {
    if (await store.get('receipt', order.id)) return true;
    const token = await tokens.issue('order', order.id);
    await mail.send({
      to: order.email,
      subject: order.mode === 'test' ? 'Test receipt · Pubcrawl Hosting Pack' : 'Your Pubcrawl Hosting Pack',
      body: 'The Pubcrawl Hosting Pack\n' + (order.mode === 'test' ? 'This is a test payment.\n' : '') +
        'Order reference ' + order.id + '\n' + merchant + '\nINR ' + (order.amount / 100).toFixed(2) +
        ' received.\n\nOpen your receipt and download the printable pack:\n' + origin + '/order/#access=' + token +
        '\n\nFor help, write to ' + contactEmail + '.',
      idempotency: 'pubcrawl-hosting-receipt-' + order.id,
    });
    await store.write('receipt', order.id, true, { mode: 'once' });
    return true;
  }

  async function acceptPaid(link, capturedPayment) {
    if (!link || !uuidPattern.test(link.reference_id || '') || !linkPattern.test(link.id || '') ||
        link.status !== 'paid' || link.currency !== 'INR' || Number(link.amount_paid) !== hostingPrice || Number(link.amount) !== hostingPrice) return null;
    const order = await store.get('order', link.reference_id);
    if (!order || order.amount !== hostingPrice) return null;
    const checkout = await store.get('checkout', order.id);
    if (checkout && checkout.id !== link.id) return null;
    const capture = capturedPayment?.status === 'captured' && Number(capturedPayment.amount) === order.amount ? capturedPayment : null;
    const payId = capture?.id || link.payments?.find(payment => Number(payment.amount) === order.amount && (!payment.status || payment.status === 'captured'))?.payment_id;
    if (!paymentPattern.test(payId || '')) return null;
    const mapped = await store.write('payment-order', payId, { id: order.id }, { mode: 'once' });
    if (!mapped && (await store.get('payment-order', payId))?.id !== order.id) return null;
    const now = Date.now();
    await store.write('paid', order.id, { id: order.id, paymentId: payId, time: now, amount: order.amount, mode: order.mode, source: order.source }, { mode: 'once', index: true, time: now, deltas: [
      orderMetric('purchase', order, istDay(now)),
      orderMetric('revenue_paise', order, istDay(now), order.amount),
      orderMetric('checkout_completed', order, istDay(order.createdAt)),
    ] });
    if (Number.isInteger(capture?.fee) && capture.fee >= 0 && capture.fee <= order.amount) {
      const paid = await store.get('paid', order.id);
      if (paid.paymentId === payId) await store.write('payment-fee', order.id, capture.fee, { mode: 'once', deltas: [
        orderMetric('gateway_fee_paise', order, istDay(paid.time), capture.fee),
        orderMetric('gateway_fee_reported', order, istDay(paid.time)),
      ] });
    }
    return order;
  }

  async function receiveWebhook(request, raw) {
    const signature = request.headers.get('x-razorpay-signature');
    if (!available || !equalStrings(await sign(webhookSecret, raw), signature)) throw new BusinessError(401, 'Webhook signature invalid');
    const event = parseBody(raw);
    if (event.event === 'payment_link.paid') {
      const order = await acceptPaid(event.payload?.payment_link?.entity, event.payload?.payment?.entity);
      if (order) await sendReceipt(order);
    } else if (event.event === 'refund.processed') {
      const refund = event.payload?.refund?.entity;
      if (/^rfnd_[a-zA-Z0-9]+$/.test(refund?.id || '') && paymentPattern.test(refund.payment_id || '') &&
          refund.status === 'processed' && refund.currency === 'INR' && Number.isInteger(refund.amount) && refund.amount > 0) {
        const mapping = await store.get('payment-order', refund.payment_id);
        const order = mapping && await store.get('order', mapping.id);
        if (order) {
          await store.write('refund', refund.id, { orderId: order.id, amount: refund.amount }, { mode: 'once',
            deltas: [orderMetric('refund_paise', order, istDay(), refund.amount)],
          });
          // Razorpay's payment entity has the cumulative refunded amount.
          const payment = event.payload?.payment?.entity || await gateway('GET', '/payments/' + refund.payment_id);
          if (!payment) throw new BusinessError(503, 'Payment status temporarily unavailable.');
          if (payment.id === refund.payment_id && Number(payment.amount_refunded) >= order.amount) {
            await store.write('refunded', order.id, true, { mode: 'once' });
          }
        }
      }
    }
    return json({ received: true });
  }

  async function openOrder(input, download = false) {
    const id = await tokens.verify('order', input.token);
    const order = id && await store.get('order', id);
    if (!order) throw new BusinessError(404, 'Order link unavailable. Open the link in your receipt.');
    let paid = await store.get('paid', id);
    let state = 'pending';
    if (!paid && available && input.refresh && !download) {
      const checkout = await store.get('checkout', id);
      if (checkout) {
        const link = await gateway('GET', '/payment_links/' + checkout.id);
        if (await acceptPaid(link)) paid = await store.get('paid', id);
        if (['expired', 'cancelled'].includes(link?.status)) state = link.status;
      }
    }
    const refunded = paid && await store.get('refunded', id);
    if (download) {
      if (!paid || refunded) throw new BusinessError(403, 'Download is available after payment confirmation.');
      return new Response(hostingPackDownload(), { headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-disposition': 'attachment; filename="the-pubcrawl-hosting-pack.html"',
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      } });
    }
    const receiptSent = paid && available && !refunded
      ? await sendReceipt(order).catch(() => false) : Boolean(paid && await store.get('receipt', id));
    return json({
      state: refunded ? 'refunded' : paid ? 'paid' : state,
      reference: id,
      receivedPaise: paid ? order.amount : 0,
      test: order.mode === 'test',
      receiptSent,
    });
  }

  return { available, test: key.startsWith('rzp_test_'), requestCheckout, receiveWebhook, openOrder };
}

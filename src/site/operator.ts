import { businessJson } from '../businessApi';

type Metric = { event: string; path: string; source: string; medium: string; campaign: string; content: string; detail: string; value: number };
type Lead = { id: string; kind: string; email: string; name: string; organisation: string; details: string; status: string; time: number;
  source: string; headcount?: number; location?: string; date?: string; budget?: string };
type Order = { id: string; paymentId: string; time: number; amount: number; mode?: string; source?: string };
type Report = { daily: Array<{ day: string; metrics: Metric[] }>; leads: Lead[]; orders: Order[] };
const currency = Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const dateFormat = Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
const number = Intl.NumberFormat('en-IN');
const words: Record<string, string> = {
  visit: 'Visits', page_view: 'Page views', engaged_visit: 'Engaged visits', recipe_open: 'Recipe opens',
  shelf_add: 'Shelf adds', tab_save: 'Tab saves', tab_share: 'Tab shares', party_plan: 'Party planners opened',
  party_export: 'Party plans exported', sample_open: 'Free menus opened', affiliate_click: 'Affiliate clicks',
  gear_click: 'Shop example clicks', workshop_ticket_click: 'Workshop booking clicks',
  email_signup: 'Confirmed email signups', enquiry: 'Submitted enquiries', qualified_enquiry: 'Qualified enquiries',
  won_enquiry: 'Won enquiries', begin_checkout: 'Checkouts started', purchase: 'Confirmed orders',
};
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(label: string, click: () => void) {
  const node = element('button', label);
  node.type = 'button';
  node.className = 'entry-button secondary';
  node.addEventListener('click', click);
  return node;
}
function table(labels: string[], rows: Array<Array<string | HTMLElement>>) {
  const wrapper = element('div');
  wrapper.className = 'ops-table-wrap';
  const sheet = element('table');
  const head = element('tr');
  for (const title of labels) {
    const cell = element('th', title);
    cell.scope = 'col';
    head.append(cell);
  }
  sheet.createTHead().append(head);
  const body = sheet.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    for (const value of row) tr.insertCell().append(value);
  }
  wrapper.append(sheet);
  return wrapper;
}
const total = (rows: Metric[], event: string) => rows.filter(row => row.event === event).reduce((sum, row) => sum + row.value, 0);

function group(rows: Metric[], keyFor: (row: Metric) => string, columns: string[]) {
  const map = new Map<string, Metric[]>();
  for (const row of rows) {
    if (!columns.includes(row.event)) continue;
    const key = keyFor(row);
    if (!key) continue;
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }
  return [...map].map(([key, entries]) => [key, ...columns.map(column => total(entries, column))] as [string, ...number[]])
    .sort((a, b) => b.slice(1).reduce<number>((p, n) => p + Number(n), 0) - a.slice(1).reduce<number>((p, n) => p + Number(n), 0));
}
function cells(values: [string, ...number[]]) {
  const [title, ...counts] = values;
  return [title, ...counts.map(n => number.format(n))];
}

export function mountOperator() {
  const login = document.querySelector<HTMLFormElement>('[data-ops-login]')!;
  const keyInput = login.querySelector<HTMLInputElement>('[data-ops-key]')!;
  const submit = login.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const status = document.querySelector<HTMLElement>('[data-ops-status]')!;
  const content = document.querySelector<HTMLElement>('[data-ops-content]')!;
  let key = '';
  let days = 7;
  let requestId = 0;
  const call = <T>(path: string, body?: object) => businessJson<T>(path, {
    headers: { authorization: 'Bearer ' + key },
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
  });

  async function refresh() {
    const id = ++requestId;
    status.textContent = 'Loading report…';
    try {
      const report = await call<Report>('/admin/report?days=' + days);
      if (id !== requestId) return;
      login.hidden = true;
      content.replaceChildren();
      content.hidden = false;
      status.textContent = '';
      draw(report);
      return true;
    } catch (error) {
      if (id !== requestId) return;
      status.textContent = error instanceof Error ? error.message : 'Report unavailable.';
    }
  }

  async function exportSubscribers() {
    try {
      let offset: number | null = 0;
      const rows = ['email,unsubscribe_url'];
      while (offset !== null) {
        const page: { items: Array<{ email: string; unsubscribe: string }>; next: number | null } =
          await call('/admin/subscribers?offset=' + offset);
        for (const item of page.items) {
          const escaped = /^[=+@-]/.test(item.email) ? "'" + item.email : item.email;
          rows.push('"' + escaped.replaceAll('"', '""') + '","' + item.unsubscribe.replaceAll('"', '""') + '"');
        }
        offset = page.next;
      }
      const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
      const link = element('a');
      link.href = url;
      link.download = 'pubcrawl-newsletter-subscribers.csv';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      status.textContent = 'Subscriber export prepared.';
    } catch (error) { status.textContent = error instanceof Error ? error.message : 'Export unavailable.'; }
  }

  function draw(report: Report) {
    const rows = report.daily.flatMap(day => day.metrics);
    const visits = total(rows, 'visit');
    const engaged = total(rows, 'engaged_visit');
    const entries = rows.filter(row => row.event === 'entry_view');
    const knownScreens = entries.filter(row => row.detail === 'narrow' || row.detail === 'wide');
    const narrow = total(knownScreens.filter(row => row.detail === 'narrow'), 'entry_view');
    const screens = total(knownScreens, 'entry_view');
    const enquiries = total(rows, 'enquiry');
    const qualified = total(rows, 'qualified_enquiry');
    const starts = total(rows, 'begin_checkout');
    const successes = total(rows, 'checkout_completed');
    const revenue = total(rows, 'revenue_paise') - total(rows, 'refund_paise');
    const fees = total(rows, 'gateway_fee_paise');
    const feeReported = total(rows, 'gateway_fee_reported');
    const purchases = total(rows, 'purchase');
    const settings = element('div');
    settings.className = 'ops-toolbar';
    const range = element('label', 'Date range');
    const select = element('select');
    for (const n of [1, 7, 14, 30]) {
      const option = element('option', n === 1 ? 'Today' : 'Last ' + n + ' days');
      option.value = String(n);
      option.selected = days === n;
      select.append(option);
    }
    select.addEventListener('change', () => { days = Number(select.value); void refresh(); });
    range.append(select);
    settings.append(range, button('Refresh', () => void refresh()), button('Export email subscribers', () => void exportSubscribers()),
      button('Sign out', () => {
        key = '';
        requestId++;
        content.hidden = true;
        content.replaceChildren();
        login.hidden = false;
        status.textContent = '';
        login.querySelector('input')?.focus();
      }));
    content.append(settings);
    const cards = element('dl');
    cards.className = 'ops-kpis';
    for (const [label, value] of [
      ['Visits', number.format(visits)],
      ['Phone-width visits', screens ? (narrow / screens * 100).toFixed(1) + '% · ' + number.format(narrow) : '0'],
      ['Shelf or Tab engagement', visits ? (engaged / visits * 100).toFixed(1) + '% · ' + number.format(engaged) : '0'],
      ['Enquiries qualified', enquiries ? number.format(qualified) + ' of ' + number.format(enquiries) : '0'],
      ['Checkout completion', starts ? number.format(successes) + ' of ' + number.format(starts) : '0'],
      ['Confirmed sales', number.format(purchases)],
      ['After refunds and reported fees', currency.format((revenue - fees) / 100)],
    ]) {
      const card = element('div');
      card.append(element('dt', label), element('dd', value));
      cards.append(card);
    }
    content.append(cards);
    if (purchases > feeReported) content.append(element('p', 'Gateway fees are available for ' + feeReported + ' of ' + purchases + ' sales in this range.'));

    const daySection = element('section');
    daySection.className = 'ops-section';
    daySection.append(element('h2', 'Traffic by day'));
    const series = element('ol');
    series.className = 'ops-series';
    const max = Math.max(1, ...report.daily.map(day => total(day.metrics, 'visit')));
    for (const day of report.daily) {
      const amount = total(day.metrics, 'visit');
      const bar = element('li');
      const date = element('time', day.day.slice(5));
      date.dateTime = day.day;
      const track = element('div');
      track.className = 'ops-track';
      track.setAttribute('aria-hidden', 'true');
      track.style.setProperty('--bar', (amount / max * 100).toFixed(1) + '%');
      bar.append(date, track, element('span', number.format(amount)));
      series.append(bar);
    }
    daySection.append(series);
    content.append(daySection);

    const acquisition = element('section');
    acquisition.className = 'ops-section';
    acquisition.append(element('h2', 'Acquisition by placement'));
    const columns = ['visit', 'engaged_visit', 'email_signup', 'enquiry', 'qualified_enquiry', 'begin_checkout', 'purchase'];
    const placement = group(rows, row => [row.source, row.medium, row.campaign, row.content].filter(Boolean).join(' / '), columns);
    if (placement.length) acquisition.append(table(['Source / medium / campaign / placement', ...columns.map(column => words[column])], placement.map(cells)));
    else acquisition.append(element('p', 'No visits or conversions in this period.'));
    acquisition.append(element('p', 'Visits are counted once per India day. A tab starts a new visit after 30 minutes of inactivity.'));
    content.append(acquisition);

    const detail = element('section');
    detail.className = 'ops-section';
    detail.append(element('h2', 'Pages and actions'));
    const entryPaths = group(entries, row => row.path, ['entry_view']);
    if (entryPaths.length) detail.append(table(['Entry page', 'Visits'], entryPaths.map(cells)));
    const onPage = ['page_view', 'recipe_open', 'shelf_add', 'tab_save', 'sample_open', 'affiliate_click'];
    const routes = group(rows, row => row.path, onPage);
    if (routes.length) detail.append(table(['Page', ...onPage.map(column => words[column])], routes.map(cells)));
    const observed = Object.entries(words).filter(([event]) => total(rows, event) > 0);
    if (observed.length) detail.append(table(['Action', 'Count'], observed.map(([event, label]) => [label, number.format(total(rows, event))])));
    const gear = group(rows, row => row.detail, ['gear_click', 'affiliate_click']);
    if (gear.length) detail.append(table(['Bar tool', 'Example clicks', 'Affiliate clicks'], gear.map(cells)));
    content.append(detail);

    const sales = element('section');
    sales.className = 'ops-section';
    sales.append(element('h2', 'Recent confirmed orders'));
    if (report.orders.length) sales.append(table(['Order', 'Payment ID', 'Confirmed at (IST)', 'Received', 'Source', 'Mode'], report.orders.map(order => [
      order.id, order.paymentId, dateFormat.format(new Date(order.time)), currency.format(order.amount / 100), order.source || 'direct', order.mode || 'live',
    ])));
    else sales.append(element('p', 'No confirmed orders yet.'));
    const test = total(rows, 'test_purchase');
    if (test) sales.append(element('p', number.format(test) + ' test payment(s) in this period.'));
    content.append(sales);

    const leads = element('section');
    leads.className = 'ops-section';
    leads.append(element('h2', 'Recent enquiries'));
    if (!report.leads.length) leads.append(element('p', 'No enquiries yet.'));
    for (const lead of report.leads) {
      const entry = element('article');
      entry.className = 'ops-lead';
      const email = element('a', lead.email);
      email.href = 'mailto:' + lead.email;
      const qualifier = element('select');
      qualifier.dataset.leadStatus = lead.id;
      qualifier.setAttribute('aria-label', 'Status for ' + lead.organisation);
      for (const value of ['new', 'qualified', 'won', 'closed']) {
        const option = element('option', value[0].toUpperCase() + value.slice(1));
        option.value = value;
        option.selected = lead.status === value;
        qualifier.append(option);
      }
      const updateStatus = element('p');
      updateStatus.setAttribute('role', 'status');
      qualifier.addEventListener('change', async () => {
        qualifier.disabled = true;
        try {
          await call('/admin/lead', { id: lead.id, status: qualifier.value });
          lead.status = qualifier.value;
          updateStatus.textContent = 'Updated.';
          if (await refresh()) {
            content.querySelector<HTMLSelectElement>(`[data-lead-status="${CSS.escape(lead.id)}"]`)?.focus({ preventScroll: true });
            status.textContent = 'Enquiry updated.';
          }
        } catch (error) {
          qualifier.value = lead.status;
          updateStatus.textContent = error instanceof Error ? error.message : 'Update unavailable.';
        } finally { qualifier.disabled = false; }
      });
      entry.append(element('h3', lead.organisation), element('p', lead.kind + ' · ' + lead.source + ' · ' + dateFormat.format(lead.time)),
        element('p', lead.name + ' · '), element('p', lead.details));
      entry.children[2].append(email);
      const context = [lead.budget, lead.headcount ? lead.headcount + ' guests' : '', lead.location, lead.date].filter(Boolean);
      if (context.length) entry.append(element('p', context.join(' · ')));
      entry.append(qualifier, updateStatus);
      leads.append(entry);
    }
    content.append(leads);
  }

  login.addEventListener('submit', event => {
    event.preventDefault();
    key = keyInput.value.trim();
    login.reset();
    void refresh();
  });
  status.textContent = '';
  keyInput.disabled = false;
  submit.disabled = false;
}

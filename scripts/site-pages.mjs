import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import sharp from 'sharp';
import { loadEnv } from 'vite';
import { featuredRecipeSlug, siteRecipes, siteRecipePath } from '../shared/site-recipes.mjs';
import { hostingPrice, siteOrigin } from '../shared/business-metrics.mjs';
import { emitMenu, escapeHtml as e, freeHostingMenu, hostingTimeline } from '../shared/hosting-pack.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const commerceEnabled = loadEnv('production', root, 'VITE_').VITE_PUBCRAWL_COMMERCIAL !== '0';
const commercialPages = new Set(['/hosting-pack/', '/work-with-us/', '/gurgaon-mocktail-workshop/', '/barware/', '/order/', '/email/']);
const photoSource = JSON.parse(await readFile(join(root, 'scripts/site-recipe-photos.json'), 'utf8'));
const photoIds = new Set(siteRecipes.map(recipe => recipe.id));
const imagePath = id => '/recipe-photos/' + id + '.jpg';
const imageCache = new Map();
const defaultShare = '/icon-512.png';
const licences = {
  'CC BY 2.5': 'https://creativecommons.org/licenses/by/2.5/',
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC BY-SA 3.0': 'https://creativecommons.org/licenses/by-sa/3.0/',
  'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC0 1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  'Unsplash License': 'https://unsplash.com/license',
};
const instagram = 'https://www.instagram.com/thepubcrawl.in/';
const cash = '₹' + hostingPrice / 100;
const martini = '<svg width="27" height="27" viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 15 Q32 20 51 14 M13.5 15.5 Q23 27 31.5 37.5 M50.5 14.5 Q41 26.5 32.5 37.5 M32 38 Q32.6 43 31.7 49 M22 51.5 Q32 49.5 42.5 51 M40 20 Q42.5 15.5 46 13"/><circle cx="40" cy="23" r="3"/></svg>';

async function recipeImage(id) {
  if (!imageCache.has(id)) imageCache.set(id, (async () => {
    const file = await readFile(join(root, 'scripts/instagram/photos', id + '.jpg'));
    if (createHash('sha256').update(file).digest('hex') !== photoSource[id]?.sha256) {
      throw new Error('Photo source hash mismatch for ' + id);
    }
    return await sharp(file).rotate().resize(768, 768, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  })());
  return imageCache.get(id);
}

function photo(recipe, { hero = false } = {}) {
  const { author, licence, source } = photoSource[recipe.id];
  return '<figure class="recipe-photo"><img ' + (hero ? 'fetchpriority="high"' : 'loading="lazy"') + ' decoding="async" src="' +
    imagePath(recipe.id) + '" alt="' + e(recipe.name) + '"><figcaption>Photo by <a href="' + e(source) + '">' +
    e(author) + '</a> · <a href="' + e(licences[licence]) + '">' + e(licence) + '</a> · resized</figcaption></figure>';
}

function button(href, label, extra = '') {
  return '<a class="entry-button ' + extra + '" href="' + e(href) + '">' + e(label) + '</a>';
}

function nav() {
  return '<a class="skip-entry" href="#content">Skip to content</a><header class="entry-header"><div class="entry-wrap entry-header-inner">' +
    '<a class="entry-brand" href="/">' + martini + '<span>The Pubcrawl</span></a>' +
    '<nav aria-label="Site"><a href="/recipes/">Recipes</a><a href="' + (commerceEnabled ? '/hosting-pack/' : '/hosting-sample/') +
    '">Hosting</a><a href="/#/bar">Shelf</a></nav></div></header>';
}

const footer = '<footer class="entry-footer"><div class="entry-wrap"><a href="/start/">The Pubcrawl</a><nav aria-label="More">' +
  (commerceEnabled ? '<a href="/work-with-us/">Work with us</a><a href="/gurgaon-mocktail-workshop/">Gurgaon workshops</a><a href="/barware/">Bar tools</a>' :
    '<a href="/batch-mocktails-for-10/">Batch mocktails</a>') +
  '<a href="/privacy/">Privacy</a><a href="' + instagram + '">Instagram</a></nav></div></footer>';

function heading(title, description, label = '') {
  return (label ? '<p class="entry-label">' + e(label) + '</p>' : '') + '<h1>' + e(title) + '</h1>' +
    (description ? '<p class="entry-deck">' + e(description) + '</p>' : '');
}

const recipeList = (recipes) => '<ul class="entry-list">' + recipes.map(recipe =>
  '<li><a href="' + siteRecipePath(recipe.id) + '"><span>' + e(recipe.name) + '</span><small>' + e(recipe.type) + ' · ' + recipe.time + ' min</small></a></li>').join('') + '</ul>';

function emailForm() {
  return '<section class="entry-callout" data-section="newsletter" hidden><h2>More menus by email</h2>' +
    '<form data-form="newsletter"><label>Email<input name="email" type="email" maxlength="254" autocomplete="email" required></label>' +
    '<label class="entry-check"><input type="checkbox" name="consent" required> Send me Pubcrawl’s hosting ideas and recipes. I can unsubscribe any time.</label>' +
    '<label class="entry-trap" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>' +
    '<button type="submit" class="entry-button">Send confirmation email</button><p class="form-message" role="status" data-message></p></form></section>';
}

function enquiryFields(kind) {
  const workshop = kind === 'workshop';
  return '<section class="entry-form-panel" id="enquire"><h2>' + (workshop ? 'Enquire about your group' : 'Tell us about your brief') + '</h2>' +
    '<p data-lead-state>Loading enquiry form…</p><form data-form="' + kind + '" hidden><div class="form-grid">' +
    '<label>Name<input name="name" autocomplete="name" required maxlength="100"></label>' +
    '<label>Email<input name="email" type="email" autocomplete="email" required maxlength="254"></label>' +
    '<label>' + (workshop ? 'Company or group' : 'Company') + '<input name="organisation" autocomplete="organization" required maxlength="120"></label>' +
    (workshop ?
      '<label>Group size<input name="headcount" type="number" min="2" max="500" required></label>' +
      '<label>Location<input name="location" required maxlength="100" placeholder="Gurgaon or nearby"></label><label>Preferred date<input name="date" type="date"></label>' :
      '<label>Budget range <small>optional</small><input name="budget" maxlength="80"></label>') +
    '</div><label>' + (workshop ? 'What are you planning?' : 'What do you need?') +
    '<textarea name="details" rows="4" minlength="8" maxlength="1200" required></textarea></label>' +
    '<label class="entry-trap" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>' +
    '<button type="submit" class="entry-button">Send enquiry</button><p class="form-message" role="status" data-message></p>' +
    '<p class="entry-small">We’ll use your details to reply to your enquiry. <a href="/privacy/">Privacy</a></p></form>' +
    '<noscript><p>Open <a href="' + instagram + '">Pubcrawl on Instagram</a> for enquiries.</p></noscript></section>';
}

const gear = [
  { key: 'jigger', name: 'A marked jigger', use: 'Measure small pours accurately. Internal markings matter most when a recipe calls for a dash of syrup or a half measure.', tags: 'measure measuring cocktails mocktails', url: 'https://www.barbox.in/products/stainless-steel-japanese-style-double-side-peg-measurer-drink-measuring-bar-tool-jigger-30-60-20-40-ml-set-of-2' },
  { key: 'shaker', name: 'A two-tin shaker', use: 'Shake citrus drinks with ice. A snug seal and a tin you can release easily matter more than the number of pieces in a set.', tags: 'shake ice sour', url: 'https://www.barbox.in/products/14-pcs-cocktail-shaker-set-steel-bartender-kit-bar-set' },
  { key: 'strainer', name: 'A Hawthorne strainer', use: 'Hold back large pieces of ice after shaking. Add a small kitchen sieve for drinks with torn mint or pulp.', tags: 'strain ice herbs', url: 'https://www.barbox.in/products/14-pcs-cocktail-shaker-set-steel-bartender-kit-bar-set' },
  { key: 'soda', name: 'Plain soda water', use: 'Use a small, chilled bottle for each round and pour it last. Check the label for unflavoured soda.', tags: 'sparkling carbonation mocktail mixer', url: 'https://www.bisleri.com/bisleri-soda-water-bottles' },
];

const pages = new Map();
function add(path, title, description, body, { recipe, image = defaultShare, indexed = true, track = indexed } = {}) {
  if (commerceEnabled || !commercialPages.has(path)) pages.set(path, { path, title, description, body, recipe, image, indexed, track });
}

const featured = siteRecipes.find(recipe => recipe.slug === featuredRecipeSlug);
const shikanji = siteRecipes.find(recipe => recipe.slug === 'shikanji');
add('/start/', 'Start here', 'Open the featured drink, get a free zero-proof hosting menu or explore what you can make from your shelf.',
  '<section class="entry-hero"><div>' + heading('Make drinks with what you already have.', 'A recipe, a shopping list or a plan for friends. Start wherever you are.') +
  '<div class="entry-actions">' + button(siteRecipePath(featured.id), 'Featured recipe · ' + featured.name) +
  button('/hosting-sample/', 'Free hosting menu', 'secondary') + '</div></div>' + photo(featured, { hero: true }) + '</section>' +
  '<section class="entry-strip"><a href="/#/bar"><strong>What can I make?</strong><span>Match drinks to your shelf</span></a>' +
  '<a href="/recipes/"><strong>Browse recipes</strong><span>Open an exact recipe to cook from or share</span></a>' +
  (commerceEnabled ? '<a href="/work-with-us/"><strong>Work with us</strong><span>Commission recipe development and content</span></a>' :
    '<a href="/batch-mocktails-for-10/"><strong>Batch mocktails</strong><span>Make shikanji for ten</span></a>') + '</section>',
  { image: imagePath(featured.id) });

add('/recipes/', 'Drink recipes', 'Pubcrawl recipes with exact measures, methods and direct links to the Shelf and hosting menus.',
  '<section class="entry-narrow">' + heading('Drink recipes', 'Exact measures and simple methods for classics and zero-proof drinks.') +
  recipeList(siteRecipes) + '<div class="entry-actions">' + button('/#/menu', 'Browse the full Drinks library', 'secondary') + '</div></section>',
  { image: imagePath(featured.id) });

for (const recipe of siteRecipes) {
  const zeroProof = recipe.type === 'Zero-proof';
  add(siteRecipePath(recipe.id), recipe.name + ' recipe', recipe.description,
    '<article><section class="entry-hero reader-hero"><div><a class="entry-back" href="/recipes/">← Recipes</a>' +
    heading(recipe.name, recipe.description, recipe.type + ' · ' + recipe.time + ' min · 1 glass') +
    '<section class="entry-measures"><h2>Ingredients</h2><ul>' + recipe.ingredients.map(([name, amount, unit]) =>
      '<li><span>' + e(name) + '</span><strong>' + e(amount + ' ' + unit) + '</strong></li>').join('') + '</ul></section></div>' +
    photo(recipe, { hero: true }) + '</section><div class="entry-narrow reader-method"><h2>Method</h2><ol>' +
    recipe.steps.map(step => '<li>' + e(step) + '</li>').join('') + '</ol><p class="entry-note">' + e(recipe.note) + '</p>' +
    '<div class="entry-actions">' + button('/#/bar', 'Open Shelf') +
    (zeroProof ? button('/hosting-sample/', 'Free hosting menu', 'secondary') : button('/#/menu?recipe=' + recipe.id, 'Open in Drinks', 'secondary')) +
    '<button class="entry-button secondary" data-share-recipe type="button">Share recipe</button></div>' +
    '<p class="form-message" data-share-message role="status"></p><h2>More recipes</h2>' +
    recipeList(siteRecipes.filter(item => item.id !== recipe.id && item.type === recipe.type).slice(0, 3)) + '</div></article>',
    { recipe, image: imagePath(recipe.id) });
}

add('/hosting-pack/', 'The Hosting Pack', 'Three zero-proof party menus with batch quantities for six and twelve, shopping lists, a prep timeline and printable menus.',
  '<section class="entry-hero"><div>' + heading('The Hosting Pack', 'Three zero-proof menus for 6 or 12. Shop once, make the bases ahead and pour when guests arrive.', 'Pubcrawl at home') +
  '<div class="price-line"><strong>' + cash + '</strong><span>One-time · printable download</span></div>' +
  '<div class="entry-actions">' + button('#checkout', 'Get the pack') + button('/hosting-sample/', 'See the free menu', 'secondary') + '</div></div>' +
  '<div class="menu-proof"><p class="entry-label">The Pubcrawl</p><h2>On the menu</h2><ul><li>Nimbu and ginger</li><li>Kokum and cumin</li><li>Jamun and mango</li></ul><p>Batch cards · shopping lists · printed menus</p></div></section>' +
  '<section class="entry-narrow"><h2>Inside the pack</h2><ul class="entry-points"><li>Two drinks in each menu, with measures for six and twelve glasses.</li>' +
  '<li>A combined shopping list for each menu and a prep timeline.</li><li>Three menus you can print for the table.</li></ul></section>' +
  '<section class="entry-form-panel" id="checkout"><h2>Get the Hosting Pack</h2><p data-checkout-state>Checking checkout availability…</p>' +
  '<form data-form="checkout" hidden><label>Delivery email<input name="email" type="email" maxlength="254" autocomplete="email" required></label>' +
  '<button class="entry-button" type="submit">Continue to payment · ' + cash + '</button><p class="form-message" role="status" data-message></p>' +
  '<p class="entry-small">We’ll email your receipt and access link after payment. <a href="#purchase-terms">Delivery and refunds</a></p></form>' +
  '<noscript><p><a href="/hosting-sample/">Open the free sample</a>. Checkout needs JavaScript.</p></noscript></section>' +
  '<section class="entry-narrow" id="purchase-terms"><h2>Delivery and refunds</h2><p data-merchant hidden></p>' +
  '<p>The pack is a printable HTML file you can open offline or save as a PDF from your browser. Download access appears after your payment is confirmed.</p>' +
  '<p>For a duplicate charge or a failed delivery, send your order reference to <span data-contact>Pubcrawl support</span> so we can check the payment and arrange a correction or refund where due.</p></section>',
  { image: imagePath(shikanji.id) });

add('/hosting-sample/', 'Free hosting menu', 'Nimbu Shikanji and Ginger Lime Fizz with measures for six or twelve, a shopping list and a prep timeline.',
  '<div class="entry-narrow">' + heading('A free hosting menu', 'One lime base in the shopping basket. Two different drinks on the table.', 'Measures for 6 or 12') +
  '<div class="entry-actions"><button type="button" data-print class="entry-button secondary">Print or save as PDF</button></div>' +
  emitMenu(freeHostingMenu) + '<section class="entry-section"><h2>Prep timeline</h2>' + hostingTimeline + '</section>' +
  (commerceEnabled ? emailForm() + '<div class="entry-actions">' + button('/hosting-pack/', 'See all three menus') + '</div>' : '') + '</div>',
  { image: imagePath(shikanji.id) });

add('/batch-mocktails-for-10/', 'Batch mocktails for 10', 'A measured shikanji batch for ten with guidance on dilution and keeping a soda finish fizzy.',
  '<article><section class="entry-hero"><div>' + heading('Batch mocktails for 10', 'Mix the base ahead and finish it cold when people arrive.') +
  '<div class="entry-actions">' + button('/hosting-sample/', 'Get the free hosting menu') + '</div></div>' + photo(shikanji, { hero: true }) +
  '</section><div class="entry-narrow"><h2>Shikanji for ten</h2><ul class="entry-points"><li>250 ml freshly squeezed lime juice</li><li>200 ml sugar syrup (1:1)</li>' +
  '<li>1.3 L chilled water</li><li>Black salt and roasted cumin, to taste</li></ul><p>Stir the syrup and lime together and chill. Taste one small diluted glass before seasoning the whole batch. Add cold water and ice just before serving.</p>' +
  '<h2>Hosting with fizz?</h2><p>Keep any soda separate. Chill the bottles and add soda to each glass or refill a small jug as guests need it.</p>' +
  (commerceEnabled ? '<p><a href="/hosting-pack/">See the Hosting Pack</a> for three menus, shopping lists and printable cards.</p>' : '') + '</div></article>',
  { image: imagePath(shikanji.id) });

add('/work-with-us/', 'Recipe development and drinks content', 'Commission original zero-proof recipes, vertical videos and photography for your business from The Pubcrawl in Gurgaon.',
  '<section class="entry-hero"><div>' + heading('Work with us', 'Original zero-proof recipe development and drinks content for brands, cafés and event teams.', 'Based in Gurgaon') +
  '<div class="price-line"><strong>₹12,500</strong><span>Starting price for one pilot</span></div><div class="entry-actions">' + button('#enquire', 'Send a brief') +
  '<a class="entry-link" href="#specimen">See a sample ↓</a></div></div>' + photo(shikanji, { hero: true }) + '</section>' +
  '<section class="entry-narrow"><h2>What comes with a pilot</h2><ul class="entry-points"><li>Three original zero-proof recipes.</li><li>Three vertical videos and six stills.</li>' +
  '<li>One revision and 30 days of organic use on agreed channels.</li></ul><p>We quote paid advertising use, extended usage and exclusivity separately.</p></section>' +
  '<section class="entry-narrow entry-section" id="specimen"><h2>Sample brief · Nimbu Shikanji</h2><p>A home-hosting concept built around fresh lime, roasted cumin and a cold pour.</p>' +
  '<div class="specimen"><div><span>Measure</span><strong>25 ml lime</strong></div><div><span>Mix</span><strong>Cumin and black salt</strong></div><div><span>Finish</span><strong>Chilled water over ice</strong></div></div>' +
  '<p><a href="/recipes/shikanji/">Read the sample recipe and photo credit</a></p></section>' + enquiryFields('content'),
  { image: imagePath(shikanji.id) });

add('/gurgaon-mocktail-workshop/', 'Gurgaon mocktail workshops', 'Enquire about a zero-proof drinks workshop in Gurgaon for a corporate team, society or private group.',
  '<section class="entry-hero"><div>' + heading('Gurgaon mocktail workshops', 'Make two zero-proof drinks with a facilitator and take the recipes home. For teams, societies and private groups.') +
  '<div class="entry-actions">' + button('#enquire', 'Enquire for a group') + '</div></div>' + photo(shikanji, { hero: true }) + '</section>' +
  '<section class="entry-narrow"><h2>How it works</h2><p>Share your location, group size and preferred date. We’ll confirm facilitator and venue options before quoting the session.</p></section>' +
  '<section class="entry-callout" data-workshop-event hidden><h2>Public session</h2><p data-workshop-details></p><p data-workshop-cancellation></p>' +
  '<a data-workshop-book class="entry-button" rel="noopener" target="_blank">Book with the event partner</a></section>' + enquiryFields('workshop'),
  { image: imagePath(shikanji.id) });

add('/barware/', 'Bar tools for making drinks at home', 'A simple guide to jiggers, shakers, strainers and soda for home drinks in India.',
  '<section class="entry-narrow">' + heading('Bar tools for home', 'Find the tool that solves the job, whether you’re measuring a sour or batching for friends.') +
  '<label class="gear-search" hidden>Find a tool<input type="search" data-gear-search placeholder="Try measuring or shaking"></label>' +
  '<p class="entry-small" data-affiliate-copy hidden>Some shop links earn Pubcrawl a commission if you buy through them.</p>' +
  '<div class="gear-list">' + gear.map(item =>
    '<article data-gear="' + item.key + '" data-keywords="' + e(item.name + ' ' + item.tags + ' ' + item.use) + '"><h2>' + e(item.name) + '</h2><p>' +
    e(item.use) + '</p><a class="entry-link" rel="noopener" target="_blank" href="' + e(item.url) + '" data-gear-link="' + item.key + '">See an example ↗</a></article>').join('') +
  '</div><p data-gear-empty hidden>No tools match that search.</p></section>');

const privacyDescription = commerceEnabled ? 'How The Pubcrawl handles data when you browse, enquire, subscribe or buy.' : 'How The Pubcrawl measures use of the website.';
add('/privacy/', 'Privacy', privacyDescription,
  '<div class="entry-narrow">' + heading('Privacy', privacyDescription) +
  '<h2>Site measurement</h2><p>Our first-party tracker counts pages, recipes, Shelf actions and other use of the site. It uses a random tab visit ID, a referrer domain, campaign labels and whether your screen viewport is narrow or wide. The tab visit resets after 30 minutes of inactivity. Aggregate reports retain up to 120 days, and short-lived visit counters expire in 36 hours.</p>' +
  '<p>When the optional Umami integration is active, it receives route names, campaign labels, event names, referrer origins and technical browser metadata. Browser Do Not Track and Global Privacy Control disable both trackers. You can also change your choice here.</p>' +
  '<div class="entry-actions"><button type="button" data-privacy-toggle class="entry-button secondary" hidden>Turn site analytics off</button></div><p role="status" data-privacy-status></p>' +
  (commerceEnabled ? '<h2>Enquiries, email and payments</h2><p>We keep your enquiry details to reply and arrange work. Enquiries expire after 180 days. Subscribing is optional and requires an email confirmation. Unsubscribe from the preference link in an email. We keep order records to deliver downloads, support purchases and reconcile payments. Razorpay handles payment details, and Resend sends transactional email.</p>' : '') +
  '<p>For a privacy request, contact <span data-contact>Pubcrawl through Instagram</span>.</p></div>');

add('/order/', 'Hosting Pack order', 'Check your Pubcrawl order, view your receipt and download the Hosting Pack.',
  '<section class="entry-narrow">' + heading('Your Hosting Pack order', '') +
  '<p data-order-state role="status">Checking your order…</p><dl class="order-facts" data-order-facts hidden><dt>Order reference</dt><dd data-order-reference></dd><dt>Amount received</dt><dd data-order-amount></dd></dl>' +
  '<div class="entry-actions"><button type="button" class="entry-button" data-order-download hidden>Download the pack</button>' +
  '<button type="button" class="entry-button secondary" data-order-refresh hidden>Check payment status</button>' +
  button('/hosting-pack/', 'Back to the Hosting Pack', 'secondary') + '</div><p class="entry-small">Need help? Contact <span data-contact>Pubcrawl support</span>.</p></section>',
  { indexed: false, track: false });

add('/email/', 'Email preferences', 'Confirm your subscription or unsubscribe from Pubcrawl emails.',
  '<section class="entry-narrow">' + heading('Email preferences', '') + '<p role="status" data-email-state>Open the preference link from your email.</p>' +
  '<div class="entry-actions"><button type="button" data-email-action class="entry-button" hidden></button>' +
  button('/hosting-sample/', 'Open the free menu', 'secondary') + '</div></section>',
  { indexed: false, track: false });

add('/ops/', 'Pubcrawl analytics', 'Private traffic, lead and checkout reports.',
  '<section class="entry-narrow">' + heading('Pubcrawl analytics', 'Traffic, leads and confirmed orders · India time') +
  '<form data-ops-login class="entry-form-panel" method="post"><label>Analytics access key<input data-ops-key type="password" required autocomplete="off" disabled></label><button type="submit" class="entry-button" disabled>Open dashboard</button></form>' +
  '<p data-ops-status role="status">Preparing the dashboard…</p></section><div data-ops-content hidden></div>', { indexed: false, track: false });

function schema(recipe, path) {
  if (!recipe) return '';
  const data = {
    '@context': 'https://schema.org', '@type': 'Recipe', name: recipe.name, description: recipe.description,
    image: [siteOrigin + imagePath(recipe.id)], author: { '@type': 'Organization', name: 'The Pubcrawl' },
    totalTime: 'PT' + recipe.time + 'M', recipeYield: '1 glass', recipeCategory: 'Drink',
    recipeIngredient: recipe.ingredients.map(([name, amount, unit]) => amount + ' ' + unit + ' ' + name),
    recipeInstructions: recipe.steps.map((text, index) => ({ '@type': 'HowToStep', position: index + 1, text })),
    mainEntityOfPage: siteOrigin + path,
  };
  return '<script type="application/ld+json">' + JSON.stringify(data).replace(/</g, '\\u003c') + '</script>';
}

function render(template, page) {
  const title = e(page.title + ' · The Pubcrawl');
  const url = siteOrigin + page.path;
  const image = siteOrigin + page.image;
  const head = '<title>' + title + '</title><meta name="description" content="' + e(page.description) + '">' +
    '<link rel="canonical" href="' + url + '"><meta property="og:site_name" content="The Pubcrawl">' +
    '<meta property="og:title" content="' + title + '"><meta property="og:description" content="' + e(page.description) + '">' +
    '<meta property="og:url" content="' + url + '"><meta property="og:image" content="' + image + '"><meta property="og:type" content="' +
    (page.recipe ? 'article' : 'website') + '"><meta name="twitter:card" content="summary_large_image">' +
    (page.indexed ? schema(page.recipe, page.path) : '<meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer">');
  const body = nav() + '<main class="entry-wrap" id="content" data-page="' + page.path + '" data-track="' + page.track + '">' + page.body + '</main>' + footer;
  return template.replace('<!--SITE_HEAD-->', () => head).replace('<!--SITE_BODY-->', () => body);
}

function sitemap() {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    ['/', ...[...pages.values()].filter(page => page.indexed).map(page => page.path)].map(path => '  <url><loc>' + siteOrigin + path + '</loc></url>').join('\n') +
    '\n</urlset>\n';
}
const robots = 'User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ' + siteOrigin + '/sitemap.xml\n';

function redirectSitePath(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.endsWith('/') && pages.has(url.pathname + '/')) {
    res.statusCode = 308;
    res.setHeader('Location', url.pathname + '/' + url.search);
    res.end();
    return;
  }
  if (url.pathname.startsWith('/recipes/') && !pages.has(url.pathname)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Recipe not found.');
    return;
  }
  next();
}

export function sitePagesDev() {
  return {
    name: 'pubcrawl-site-pages',
    configureServer(server) {
      server.middlewares.use(redirectSitePath);
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        const url = new URL(req.url, 'http://localhost');
        const path = url.pathname.endsWith('/') ? url.pathname : url.pathname + '/';
        const page = pages.get(path);
        const photoId = url.pathname.match(/^\/recipe-photos\/([a-z0-9-]+)\.jpg$/i)?.[1];
        try {
          if (page) {
            const template = await readFile(join(root, 'site.html'), 'utf8');
            const html = await server.transformIndexHtml('/site.html', render(template, page), req.url);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(html);
          } else if (photoIds.has(photoId)) {
            res.setHeader('Content-Type', 'image/jpeg');
            res.end(await recipeImage(photoId));
          } else if (url.pathname === '/sitemap.xml' || url.pathname === '/robots.txt') {
            res.setHeader('Content-Type', url.pathname === '/sitemap.xml' ? 'application/xml; charset=utf-8' : 'text/plain; charset=utf-8');
            res.end(url.pathname === '/sitemap.xml' ? sitemap() : robots);
          } else next();
        } catch (error) { next(error); }
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(redirectSitePath);
    },
  };
}

async function buildSitePages(outDir) {
  const templatePath = join(outDir, 'site.html');
  const template = await readFile(templatePath, 'utf8');
  for (const page of pages.values()) {
    const path = join(outDir, page.path, 'index.html');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, render(template, page));
  }
  await mkdir(join(outDir, 'recipe-photos'), { recursive: true });
  await Promise.all([...photoIds].map(async id => writeFile(join(outDir, imagePath(id)), await recipeImage(id))));
  await writeFile(join(outDir, 'robots.txt'), robots);
  await writeFile(join(outDir, 'sitemap.xml'), sitemap());
  await rm(templatePath);
  console.log('Pre-rendered ' + pages.size + ' site pages, robots.txt and sitemap.xml.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildSitePages(resolve(process.argv[2] || 'dist'));
}

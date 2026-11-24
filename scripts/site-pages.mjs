import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { legacyRecipeNames, siteOrigin } from '../shared/business-metrics.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const pages = new Map([
  ['/privacy/', {
    title: 'Privacy',
    description: 'How The Pubcrawl measures use of the website.',
    body: `<section class="entry-narrow">
      <h1>Privacy</h1>
      <h2>Site measurement</h2>
      <p>Our first-party tracker counts pages, recipes, Shelf actions and other use of the site. It uses a random tab visit ID, a referrer domain, campaign labels and whether your viewport is narrow or wide. A tab visit resets after 30 minutes of inactivity. Aggregate reports are kept for up to 120 days, and visit counters expire after 36 hours.</p>
      <p>If the optional Umami integration is active, it receives route names, campaign labels, event names, referrer origins and technical browser metadata. Do Not Track and Global Privacy Control turn off both trackers.</p>
      <div class="entry-actions"><button type="button" class="entry-button secondary" data-privacy-toggle hidden>Turn site analytics off</button></div>
      <p role="status" data-privacy-status></p>
      <p>We keep details from previously submitted enquiries for up to 180 days. For a privacy request, contact <a href="https://www.instagram.com/thepubcrawl.in/">The Pubcrawl on Instagram</a>.</p>
    </section>`,
    indexed: true,
  }],
  ['/ops/', {
    title: 'Pubcrawl analytics',
    description: 'Private website analytics.',
    body: `<section class="entry-narrow">
      <h1>Pubcrawl analytics</h1>
      <p class="entry-deck">Traffic and engagement in India time</p>
      <form data-ops-login class="entry-form-panel" method="post">
        <label>Analytics access key<input data-ops-key type="password" required autocomplete="off" disabled></label>
        <button type="submit" class="entry-button" disabled>Open dashboard</button>
      </form>
      <p data-ops-status role="status">Preparing the dashboard…</p>
    </section><div data-ops-content hidden></div>`,
    indexed: false,
  }],
]);

// Give links shared during the previous release an equivalent Drinks or Tab destination.
const redirects = new Map([
  ['/start/', '/'],
  ['/recipes/', '/#/menu'],
  ['/hosting-sample/', '/#/tab'],
  ['/batch-mocktails-for-10/', '/#/tab'],
  ...Object.entries(legacyRecipeNames).map(([slug, name]) => [
    '/recipes/' + slug + '/',
    '/#/menu?q=' + encodeURIComponent(name),
  ]),
]);

function render(template, path, page) {
  const head = `<title>${page.title} · The Pubcrawl</title>
    <meta name="description" content="${page.description}">
    <link rel="canonical" href="${siteOrigin + path}">
    ${page.indexed ? '' : '<meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer">'}`;
  const body = `<a class="skip-entry" href="#content">Skip to content</a>
    <header class="entry-header"><div class="entry-wrap entry-header-inner"><a class="entry-brand" href="/">The Pubcrawl</a></div></header>
    <main class="entry-wrap" id="content">${page.body}</main>`;
  return template.replace('<!--SITE_HEAD-->', () => head).replace('<!--SITE_BODY-->', () => body);
}

const robots = 'User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ' + siteOrigin + '/sitemap.xml\n';
const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  ['/', ...[...pages].filter(([, page]) => page.indexed).map(([path]) => path)]
    .map(path => '  <url><loc>' + siteOrigin + path + '</loc></url>').join('\n') +
  '\n</urlset>\n';

function siteMiddleware(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.endsWith('/') ? url.pathname : url.pathname + '/';
  const target = redirects.get(path);
  if (target) {
    const destination = new URL(target, url.origin);
    destination.search = url.search;
    res.writeHead(302, { Location: destination.pathname + destination.search + destination.hash }).end();
  } else if (pages.has(path) && path !== url.pathname) {
    res.writeHead(308, { Location: path + url.search }).end();
  } else if (url.pathname === '/robots.txt') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end(robots);
  } else if (url.pathname === '/sitemap.xml') {
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' }).end(sitemap);
  } else {
    next();
  }
}

export function sitePagesDev() {
  return {
    name: 'pubcrawl-site-pages',
    configureServer(server) {
      server.middlewares.use(siteMiddleware);
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        const path = new URL(req.url, 'http://localhost').pathname;
        const page = pages.get(path);
        if (!page) return next();
        try {
          const template = await readFile(join(root, 'site.html'), 'utf8');
          const html = await server.transformIndexHtml('/site.html', render(template, path, page), req.url);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
        } catch (error) {
          next(error);
        }
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(siteMiddleware);
    },
  };
}

async function buildSitePages(outDir) {
  const templatePath = join(outDir, 'site.html');
  const template = await readFile(templatePath, 'utf8');
  for (const [path, page] of pages) {
    const directory = join(outDir, path);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'index.html'), render(template, path, page));
  }
  const redirectRules = [...redirects].flatMap(([path, target]) => [
    path + ' ' + target + ' 302',
    path.slice(0, -1) + ' ' + target + ' 302',
  ]).join('\n') + '\n';
  await writeFile(join(outDir, '_redirects'), redirectRules);
  await writeFile(join(outDir, 'robots.txt'), robots);
  await writeFile(join(outDir, 'sitemap.xml'), sitemap);
  await rm(templatePath);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildSitePages(resolve(process.argv[2] || 'dist'));
}

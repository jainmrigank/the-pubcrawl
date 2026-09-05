import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const previewHost = process.env.PUBCRAWL_PREVIEW_HOST?.trim();
const previewAllowedHosts = previewHost && /^[a-z0-9.-]+$/i.test(previewHost)
  ? [previewHost]
  : [];

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Keep an active Shorts/recipe session intact. A downloaded update waits
      // for the current app page to close and is picked up on next launch.
      registerType: 'prompt',
      // our own worker (src/sw.js) so it can show bar nudges
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'The PubCrawl',
        short_name: 'PubCrawl',
        description: "What's your poison? Every cocktail you can make with what's on your shelf.",
        start_url: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#141310',
        theme_color: '#141310',
        categories: ['food', 'lifestyle', 'entertainment'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
    {
      // Serve the cocktail API inside both local modes — one process, one port.
      name: 'cocktail-api',
      async configureServer(server) {
        const { createApp } = await import('./server/app.mjs');
        server.middlewares.use(await createApp());
      },
      async configurePreviewServer(server) {
        const { createApp } = await import('./server/app.mjs');
        server.middlewares.use(await createApp());
      },
    },
  ],
  server: { port: 5175 },
  // Physical-device previews are exposed through a temporary HTTPS tunnel.
  // Require the caller to opt in to that exact hostname instead of allowing
  // arbitrary Host headers or every ngrok subdomain.
  preview: { allowedHosts: previewAllowedHosts },
});

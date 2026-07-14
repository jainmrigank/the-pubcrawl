import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // future deploys reach installed apps automatically: the new build is
      // fetched in the background and applied on the next launch/restart
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'The PubCrawl',
        short_name: 'PubCrawl',
        description: "What's your poison? Every cocktail you can make with what's on your shelf.",
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ECE9E0',
        theme_color: '#ECE9E0',
        categories: ['food', 'lifestyle', 'entertainment'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // cocktail photos (Wikimedia, TheCocktailDB) — cache once, serve fast
            urlPattern: ({ url }) => /upload\.wikimedia\.org|thecocktaildb\.com/.test(url.href),
            handler: 'CacheFirst',
            options: {
              cacheName: 'drink-images',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
    {
      // Serve the cocktail API inside the Vite dev server — one process, one port.
      name: 'cocktail-api',
      async configureServer(server) {
        const { createApp } = await import('./server/app.mjs');
        server.middlewares.use(await createApp());
      },
    },
  ],
  server: { port: 5175 },
});

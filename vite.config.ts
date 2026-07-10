import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      // Serve the cocktail API inside the Vite dev server — one process, one port.
      name: 'cocktail-api',
      async configureServer(server) {
        const { createApp } = await import('./server/app.mjs');
        server.middlewares.use(createApp());
      },
    },
  ],
  server: { port: 5175 },
});

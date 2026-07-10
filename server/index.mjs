/** Standalone API server (dev normally runs it inside Vite — see vite.config.ts). */
import { createApp } from './app.mjs';

const port = Number(process.env.PORT) || 8790;
createApp().listen(port, () => console.log(`cocktail api on http://localhost:${port}`));

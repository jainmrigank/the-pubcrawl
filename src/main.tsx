import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';

// Installed apps pick up new deploys on their own: the worker fetches the new
// build in the background and it takes effect the next time the app is opened.
// Nobody has to reinstall or update anything — just reopen it.
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

import './site.css';
import { browserAnalyticsBlocked, setAnalyticsPreference, trackingAllowed, trackPageView } from '../analytics';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector);

function status(element: HTMLElement | null, message: string, error = false) {
  if (element) {
    element.textContent = message;
    element.dataset.error = String(error);
  }
}

function bindPrivacy() {
  const button = $<HTMLButtonElement>('[data-privacy-toggle]');
  if (!button) return;
  const message = $('[data-privacy-status]');
  button.hidden = false;
  const update = () => {
    const blocked = browserAnalyticsBlocked();
    button.disabled = blocked;
    button.textContent = trackingAllowed() ? 'Turn site analytics off' : 'Turn site analytics on';
    status(message, blocked ? 'Your browser’s privacy choice keeps analytics off.' : trackingAllowed() ? 'Site analytics are on.' : 'Site analytics are off in this browser.');
  };
  button.addEventListener('click', () => {
    try { setAnalyticsPreference(!trackingAllowed()); update(); }
    catch { status(message, 'Your browser is blocking preference storage.', true); }
  });
  update();
}

if ($('[data-privacy-toggle]')) {
  trackPageView('/privacy');
  bindPrivacy();
}
if ($('[data-ops-login]')) {
  void import('./operator').then(({ mountOperator }) => mountOperator()).catch(() => {
    status($('[data-ops-status]'), 'Could not load the dashboard. Reload the page and try again.');
  });
}

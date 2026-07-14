import { useEffect, useState } from 'react';
import { ArrowDown, X } from '../icons';

/** Chrome/Edge/Brave/Opera fire this so we can trigger a real install prompt. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const installed = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;

/** How this particular browser installs an app. */
function howToInstall(): string {
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const android = /Android/.test(ua);
  const firefox = /Firefox|FxiOS/.test(ua);
  const mac = /Macintosh/.test(ua);
  const chromium = /Chrome|Chromium|Edg|OPR/.test(ua) && !/FxiOS/.test(ua);

  if (iOS) return 'Tap the Share button, scroll down, then choose Add to Home Screen.';
  if (android && firefox) return 'Open the ⋮ menu and choose Install.';
  if (android) return 'Open the ⋮ menu and choose Install app (or Add to Home screen).';
  if (mac && !chromium) return 'In Safari: File menu → Add to Dock.';
  // Firefox on desktop has no way to install web apps at all — say so plainly.
  if (firefox) return "Firefox on desktop can't install web apps. Open this page in Chrome, Edge or Safari — or add it to your phone.";
  if (chromium) return 'Click the install icon at the right of the address bar.';
  return 'Open this page on your phone, or in Chrome, Edge or Safari, to install it.';
}

/**
 * "Get the app" bar. Every browser gets a button: a real install prompt where
 * the browser offers one, and the correct steps where it doesn't (Apple gives
 * pages no install API, and Firefox on desktop can't install web apps at all).
 */
export function InstallBanner() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(
    () => installed() || localStorage.getItem('pubcrawl.installDismissed') === '1'
  );
  const [tip, setTip] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => setHidden(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (hidden) return null;

  const dismiss = () => {
    localStorage.setItem('pubcrawl.installDismissed', '1');
    setHidden(true);
  };

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setHidden(true);
    setPrompt(null);
  }

  return (
    <div className="install-banner">
      <div className="ib-row">
        <span className="k-label ib-lead">GET THE APP — KEEP THE BAR IN YOUR POCKET</span>
        {prompt ? (
          <button className="ib-btn" onClick={install}>
            INSTALL <ArrowDown size={13} />
          </button>
        ) : (
          <button className="ib-btn" onClick={() => setTip((t) => !t)} aria-expanded={tip}>
            HOW TO INSTALL <ArrowDown size={13} />
          </button>
        )}
        <button className="ib-x" onClick={dismiss} aria-label="Dismiss">
          <X size={13} />
        </button>
      </div>
      {tip && <p className="ib-steps">{howToInstall()}</p>}
    </div>
  );
}

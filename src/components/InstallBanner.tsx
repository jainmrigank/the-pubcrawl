import { useEffect, useState } from 'react';
import { ArrowDown, X } from '../icons';

/** Chrome/Edge fire this so we can trigger a real install prompt. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const installed = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;

/**
 * "Get the app" bar. Apple only allows installing from Safari, and no browser
 * lets a page force-open Safari — so on Apple we show the right instruction
 * instead of a button. Everywhere else we can trigger the real install prompt.
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

  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const macSafari = /Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua);
  const iosSafari = iOS && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);

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

  // what the drinker should actually do on their device
  let action: React.ReactNode;
  if (prompt) {
    action = (
      <button className="ib-btn" onClick={install}>
        ADD TO HOME SCREEN <ArrowDown size={13} />
      </button>
    );
  } else if (iosSafari) {
    action = (
      <button className="ib-btn" onClick={() => setTip((t) => !t)}>
        HOW? <ArrowDown size={13} />
      </button>
    );
  } else if (iOS) {
    action = <span className="ib-tip">Open this page in Safari to install it.</span>;
  } else if (macSafari) {
    action = <span className="ib-tip">Safari menu → File → Add to Dock.</span>;
  } else {
    action = <span className="ib-tip">Open on your phone to install it.</span>;
  }

  return (
    <div className="install-banner">
      <div className="ib-row">
        <span className="k-label ib-lead">GET THE APP — KEEP THE BAR IN YOUR POCKET</span>
        {action}
        <button className="ib-x" onClick={dismiss} aria-label="Dismiss">
          <X size={13} />
        </button>
      </div>
      {tip && (
        <p className="ib-steps">
          Tap the <b>Share</b> button in Safari, scroll down, then choose <b>Add to Home Screen</b>.
        </p>
      )}
    </div>
  );
}

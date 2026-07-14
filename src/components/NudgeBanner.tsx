import { useEffect, useState } from 'react';
import { canSubscribeHere, currentSubscription, subscribeToNudges } from '../push';
import { ArrowRight, Check, X } from '../icons';

/**
 * Installing the app doesn't sign anyone up for nudges — they have to say yes.
 * So once the app is installed (and on desktop/Android, wherever push works),
 * ask once, in the header, instead of hiding the switch in the footer.
 */
export function NudgeBanner() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!canSubscribeHere()) return;
    if (localStorage.getItem('pubcrawl.nudgeDismissed') === '1') return;
    if (Notification.permission === 'denied') return;
    currentSubscription()
      .then((sub) => setShow(!sub))
      .catch(() => {});
  }, []);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem('pubcrawl.nudgeDismissed', '1');
    setShow(false);
  };

  async function turnOn() {
    setBusy(true);
    const result = await subscribeToNudges();
    setBusy(false);
    if (result === 'subscribed') {
      setDone(true);
      localStorage.setItem('pubcrawl.nudgeDismissed', '1');
      setTimeout(() => setShow(false), 2600);
    } else if (result === 'denied') {
      setNote('No nudges then. Turn them on any time from the bottom of the page.');
    } else if (result === 'needs-install') {
      setNote('Add the app to your home screen first.');
    } else {
      setNote("That didn't take. Try again in a moment.");
    }
  }

  return (
    <div className="install-banner nudge-banner">
      <div className="ib-row">
        <span className="k-label ib-lead">
          {done ? "YOU'RE IN — WE'LL NUDGE YOU EVERY FEW DAYS" : 'A DRINK IDEA EVERY FEW DAYS?'}
        </span>
        {!done && (
          <button className="ib-btn" onClick={turnOn} disabled={busy}>
            {busy ? 'ONE MOMENT…' : 'TURN ON NUDGES'} <ArrowRight size={13} />
          </button>
        )}
        {done && <Check size={14} />}
        <button className="ib-x" onClick={dismiss} aria-label="Dismiss">
          <X size={13} />
        </button>
      </div>
      {note && <p className="ib-steps">{note}</p>}
    </div>
  );
}

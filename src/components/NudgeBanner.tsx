import { useEffect, useState } from 'react';
import { currentSubscription, isStandalone, pushSupported, subscribeToNudges } from '../push';
import { ArrowRight, Check, X } from '../icons';

/**
 * Asks for notifications — but only inside the installed app, never in a
 * browser tab (an Android browser will happily subscribe you before you've
 * even got the app, which is not what we want).
 *
 * It asks again on every launch until they say yes, so nobody misses it.
 * Dismissing hides it for this session only. Once they're subscribed — or
 * have blocked notifications outright — it never appears again.
 */
export function NudgeBanner() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!pushSupported() || !isStandalone()) return;
    if (Notification.permission === 'denied') return; // blocked; a button can't fix that
    currentSubscription()
      .then((sub) => setShow(!sub))
      .catch(() => {});
  }, []);

  if (!show) return null;

  async function turnOn() {
    setBusy(true);
    const result = await subscribeToNudges();
    setBusy(false);
    if (result === 'subscribed') {
      setDone(true);
      setTimeout(() => setShow(false), 2600);
    } else if (result === 'denied') {
      setNote('No notifications then. You can turn them on any time from the bottom of the page.');
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
          {done ? "YOU'RE IN — A DRINK IDEA EVERY FEW DAYS" : 'A DRINK IDEA EVERY FEW DAYS?'}
        </span>
        {!done && (
          <button className="ib-btn" onClick={turnOn} disabled={busy}>
            {busy ? 'ONE MOMENT…' : 'TURN ON NOTIFICATIONS'} <ArrowRight size={13} />
          </button>
        )}
        {done && <Check size={14} />}
        {/* hides for this session; it'll ask again next time they open the app */}
        <button className="ib-x" onClick={() => setShow(false)} aria-label="Not now">
          <X size={13} />
        </button>
      </div>
      {note && <p className="ib-steps">{note}</p>}
    </div>
  );
}

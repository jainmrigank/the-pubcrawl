import { useEffect, useState } from 'react';
import { currentSubscription, isStandalone, pushSupported, subscribeToNudges } from '../push';
import { ArrowRight, Check, X } from '../icons';

/**
 * Gets notifications switched on as close to "by default" as a browser allows.
 *
 * Permission genuinely cannot be granted for the user: Chrome, Safari and
 * Firefox all demand a user gesture, and asking without one is auto-denied and
 * can get the origin permanently blocked. So on the first launch of the
 * installed app we ask straight away — one tap, part of setup — and only fall
 * back to the banner if that attempt doesn't land.
 *
 * Only ever inside the installed app: an Android browser will happily subscribe
 * someone who hasn't installed anything yet, which isn't what we want. It asks
 * again on every launch until answered; dismissing hides it for that session.
 */
const ASKED_KEY = 'pubcrawl.autoAsked';

export function NudgeBanner() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!pushSupported() || !isStandalone()) return;
    if (Notification.permission === 'denied') return; // blocked; a button can't fix that
    let cancelled = false;
    currentSubscription()
      .then(async (sub) => {
        if (cancelled || sub) return;
        // first launch of the installed app: ask immediately, so notifications
        // are on from the start rather than something to go and find
        if (Notification.permission === 'granted' || !localStorage.getItem(ASKED_KEY)) {
          localStorage.setItem(ASKED_KEY, '1');
          const result = await subscribeToNudges();
          if (cancelled) return;
          if (result === 'subscribed') {
            setDone(true);
            setShow(true);
            setTimeout(() => setShow(false), 2600);
            return;
          }
          if (result === 'denied') return; // they said no; respect it
        }
        setShow(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
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

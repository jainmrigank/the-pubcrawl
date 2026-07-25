import { useEffect, useState } from 'react';
import { currentSubscription, isStandalone, pushSupported, subscribeToNudges } from '../push';
import { ArrowRight, Check, X } from '../icons';

/**
 * Gets notifications switched on as close to "by default" as a browser allows.
 *
 * Permission genuinely cannot be granted for the user: Chrome, Safari and
 * Firefox all demand a user gesture, and asking without one is auto-denied and
 * can get the origin permanently blocked. So on the first launch of the
 * installed app we ask straight away — one tap, part of setup — and after that
 * the bar keeps asking on every launch until they're actually subscribed.
 *
 * Only ever inside the installed app: an Android browser will happily subscribe
 * someone who hasn't installed anything yet, which isn't what we want.
 * Dismissing hides it for that session; it's back next time the app opens.
 */
const ASKED_KEY = 'pubcrawl.autoAsked';

export function NudgeBanner() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [note, setNote] = useState('');
  const [how, setHow] = useState(false);

  useEffect(() => {
    if (!pushSupported() || !isStandalone()) return;
    let cancelled = false;

    currentSubscription()
      .then(async (sub) => {
        if (cancelled || sub) return; // already subscribed: nothing to ask

        // the browser has hard-blocked us — a button can't fix that, so say so
        if (Notification.permission === 'denied') {
          setBlocked(true);
          setShow(true);
          return;
        }

        // first launch of the installed app: ask immediately so notifications
        // are on from the start rather than something to go and find
        if (!localStorage.getItem(ASKED_KEY)) {
          localStorage.setItem(ASKED_KEY, '1');
          const result = await subscribeToNudges();
          if (cancelled) return;
          if (result === 'subscribed') {
            setDone(true);
            setShow(true);
            setTimeout(() => setShow(false), 2600);
            return;
          }
          if (result === 'denied') setBlocked(true);
        }

        // installed but not subscribed: keep offering, every launch
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
    setNote('');
    const result = await subscribeToNudges();
    setBusy(false);
    if (result === 'subscribed') {
      setDone(true);
      setBlocked(false);
      setTimeout(() => setShow(false), 2600);
    } else if (result === 'denied') {
      setBlocked(true);
    } else if (result === 'needs-install') {
      setNote('Add the app to your home screen first.');
    } else {
      setNote("That didn't take. Try again in a moment.");
    }
  }

  const lead = done
    ? "YOU'RE IN — A DRINK IDEA EVERY FEW DAYS"
    : blocked
      ? 'NOTIFICATIONS ARE BLOCKED FOR THE PUBCRAWL'
      : 'A DRINK IDEA EVERY FEW DAYS?';

  return (
    <div className="install-banner nudge-banner">
      <div className="ib-row">
        <span className="k-label ib-lead">{lead}</span>
        {done && <Check size={14} />}
        {!done && blocked && (
          <button className="ib-btn" onClick={() => setHow((h) => !h)} aria-expanded={how}>
            HOW TO FIX <ArrowRight size={13} />
          </button>
        )}
        {!done && !blocked && (
          <button className="ib-btn" onClick={turnOn} disabled={busy}>
            {busy ? 'ONE MOMENT…' : 'TURN ON NOTIFICATIONS'} <ArrowRight size={13} />
          </button>
        )}
        {/* hides for this session; the bar asks again next time it opens */}
        <button className="ib-x" onClick={() => setShow(false)} aria-label="Not now">
          <X size={13} />
        </button>
      </div>
      {how && (
        <p className="ib-steps">
          Your device is refusing them, so this has to be switched back on in settings: open your{' '}
          <b>device settings</b>, find <b>The PubCrawl</b> under notifications (or the site settings
          for this app in your browser), and allow notifications. Then reopen the app.
        </p>
      )}
      {note && <p className="ib-steps">{note}</p>}
    </div>
  );
}

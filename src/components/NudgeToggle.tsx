import { useEffect, useState } from 'react';
import { pushSeen } from '../api';
import {
  canSubscribeHere,
  currentSubscription,
  pushSupported,
  subscribeToNudges,
  unsubscribeFromNudges,
} from '../push';
import { Check, X } from '../icons';

/**
 * The always-available switch, at the foot of every page. The header banner
 * does the asking; this is where you change your mind.
 */
export function NudgeToggle() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!pushSupported()) return;
    currentSubscription()
      .then((sub) => {
        if (!sub) return;
        setOn(true);
        pushSeen(sub.endpoint).catch(() => {}); // "been away" nudges skip the present
      })
      .catch(() => {});
  }, []);

  if (!pushSupported()) return null;

  async function enable() {
    setBusy(true);
    setNote('');
    const result = await subscribeToNudges();
    setBusy(false);
    if (result === 'subscribed') setOn(true);
    else if (result === 'needs-install')
      setNote('Add the app to your home screen first, then turn nudges on from there.');
    else if (result === 'denied') setNote('Notifications are blocked for this site in your browser.');
    else if (result === 'unavailable') setNote('Nudges are not switched on for this bar yet.');
    else setNote("That didn't take. Try again in a moment.");
  }

  async function disable() {
    setBusy(true);
    await unsubscribeFromNudges();
    setOn(false);
    setNote('');
    setBusy(false);
  }

  return (
    <div className="nudge">
      <button className="text-btn" onClick={on ? disable : enable} disabled={busy}>
        {on ? (
          <>NUDGES ON <Check size={11} /></>
        ) : (
          <>NUDGE ME EVERY FEW DAYS <X size={11} style={{ opacity: 0.35 }} /></>
        )}
      </button>
      {!on && !canSubscribeHere() && (
        <span className="nudge-note">Add the app to your home screen to get nudges.</span>
      )}
      {note && <span className="nudge-note">{note}</span>}
    </div>
  );
}

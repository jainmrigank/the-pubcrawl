import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { currentSubscription, isStandalone, pushSupported, subscribeToNudges } from '../push';
import { ArrowRight, Check, X } from '../icons';
import { EASE } from '../motion';

/**
 * Asks for notifications with a card over the app, the bar blurred behind it —
 * the same treatment as the question of the day. One button, one tap.
 *
 * Permission can't be granted on anyone's behalf: every browser demands a user
 * gesture, so this button is the gesture. Shown on each launch of the installed
 * app (phone or desktop) until they're actually subscribed, and never in a
 * plain browser tab.
 */
export function NudgePrompt() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!pushSupported() || !isStandalone()) return;
    let cancelled = false;

    currentSubscription()
      .then((sub) => {
        if (cancelled || sub) return; // already subscribed: nothing to ask
        if (Notification.permission === 'denied') setBlocked(true);
        // let the question of the day have the screen first
        const show = () => {
          if (cancelled) return;
          if (document.querySelector('.daily-backdrop')) {
            setTimeout(show, 700);
            return;
          }
          setOpen(true);
        };
        show();
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  // hold the page still while the card is up
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  async function turnOn() {
    setBusy(true);
    const result = await subscribeToNudges();
    setBusy(false);
    if (result === 'subscribed') {
      setDone(true);
      setTimeout(() => setOpen(false), 1800);
    } else {
      setBlocked(true);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="daily-backdrop"
          onClick={() => setOpen(false)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: EASE }}
        >
          <motion.div
            className="daily nudge-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Turn on notifications"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 22, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.99 }}
            transition={{ duration: 0.36, ease: EASE }}
          >
            <div className="daily-head">
              <span className="k-label">FROM THE BAR</span>
              <button className="chip-x" onClick={() => setOpen(false)} aria-label="Close">
                <X size={12} />
              </button>
            </div>

            {done ? (
              <>
                <p className="nudge-modal-title">You're in.</p>
                <p className="nudge-modal-copy">
                  <Check size={14} /> We'll send a drink worth making every few days.
                </p>
              </>
            ) : (
              <>
                <p className="nudge-modal-title">A drink idea every few days?</p>
                <p className="nudge-modal-copy">
                  {blocked
                    ? 'Your device is blocking notifications for The PubCrawl. Allow them in your settings, then reopen the app.'
                    : 'A cocktail worth trying, a story from behind the bar, and the question of the day. Never more than a couple a week.'}
                </p>
                {!blocked && (
                  <button className="btn btn-solid nudge-modal-btn" onClick={turnOn} disabled={busy}>
                    {busy ? 'ONE MOMENT…' : 'TURN ON NOTIFICATIONS'} <ArrowRight size={13} />
                  </button>
                )}
                <div className="daily-skip">
                  <button className="text-btn" onClick={() => setOpen(false)}>
                    {blocked ? 'CLOSE' : 'NOT NOW'}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

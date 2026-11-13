import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { currentSubscription, isStandalone, pushSupported, subscribeToNudges } from '../push';
import { ArrowRight, Check, X } from '../icons';
import { EASE } from '../motion';
import { OVERLAY_PRIORITY, overlayGate, setBackgroundInert } from '../overlayGate';

const NUDGE_GATE_ID = 'notification-prompt';

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
  const [shouldOffer, setShouldOffer] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const dismissedRef = useRef(false);

  const close = useCallback(() => {
    dismissedRef.current = true;
    setShouldOffer(false);
    setOpen(false);
    overlayGate.release(NUDGE_GATE_ID);
    openerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!pushSupported() || !isStandalone()) return;
    let cancelled = false;

    currentSubscription()
      .then((sub) => {
        if (cancelled || sub) return; // already subscribed: nothing to ask
        if (Notification.permission === 'denied') setBlocked(true);
        dismissedRef.current = false;
        setShouldOffer(true);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!shouldOffer || open) return;
    const tryOpen = () => {
      if (dismissedRef.current) return;
      if (!overlayGate.acquire(NUDGE_GATE_ID, OVERLAY_PRIORITY.prompt)) return;
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setOpen(true);
    };
    tryOpen();
    return overlayGate.subscribe(tryOpen);
  }, [open, shouldOffer]);

  useEffect(() => overlayGate.subscribe(() => {
    if (open && overlayGate.active !== NUDGE_GATE_ID) setOpen(false);
  }), [open]);

  // hold the page still while the card is up
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const restoreInert = setBackgroundInert(true, '.nudge-backdrop');
    return () => {
      document.body.style.overflow = prev;
      restoreInert();
      overlayGate.release(NUDGE_GATE_ID);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button, a, input, [tabindex]:not([tabindex="-1"])') || []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close, open]);

  async function turnOn() {
    setBusy(true);
    const result = await subscribeToNudges();
    setBusy(false);
    if (result === 'subscribed') {
      setDone(true);
      setTimeout(close, 1800);
    } else {
      setBlocked(true);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="daily-backdrop nudge-backdrop"
          onClick={close}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: EASE }}
        >
          <motion.div
            className="daily nudge-modal"
            ref={dialogRef}
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
              <span className="k-label">From the bar</span>
              <button className="chip-x" onClick={close} aria-label="Close">
                <X size={12} />
              </button>
            </div>

            {done ? (
              <>
                <p className="nudge-modal-title">You're in.</p>
                <p className="nudge-modal-copy">
                  <Check size={14} /> Drink ideas, a few times a week.
                </p>
              </>
            ) : (
              <>
                <p className="nudge-modal-title">A drink idea every few days?</p>
                <p className="nudge-modal-copy">
                  {blocked
                    ? 'Notifications blocked. Allow PubCrawl in device settings, then reopen.'
                    : 'Cocktail ideas, stories and the daily quiz. Up to twice a week.'}
                </p>
                {!blocked && (
                  <button className="btn btn-solid nudge-modal-btn" onClick={turnOn} disabled={busy}>
                    {busy ? 'One moment…' : 'Turn on notifications'} <ArrowRight size={13} />
                  </button>
                )}
                <div className="daily-skip">
                  <button className="text-btn" onClick={close}>
                    {blocked ? 'Close' : 'Not now'}
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

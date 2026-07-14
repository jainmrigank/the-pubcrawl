import { useEffect, useState } from 'react';
import { fetchPushKey, pushSeen, pushSubscribe, pushUnsubscribe } from '../api';
import { Check, X } from '../icons';

/** VAPID keys travel as base64url; the browser wants raw bytes. */
function toBytes(base64url: string) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window;

/**
 * Opt-in for bar nudges: a story, an idea or a drink worth making, every few
 * days. On iPhone/iPad this only works once the app is installed to the home
 * screen — Apple doesn't allow push to a plain browser tab.
 */
export function NudgeToggle() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!supported()) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!sub) return;
        setOn(true);
        pushSeen(sub.endpoint).catch(() => {}); // "been away" nudges skip the present
      })
      .catch(() => {});
  }, []);

  if (!supported()) return null;

  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;

  async function enable() {
    setBusy(true);
    setNote('');
    try {
      if (iOS && !standalone) {
        setNote('Add the app to your home screen first, then turn nudges on from there.');
        return;
      }
      const { key } = await fetchPushKey();
      if (!key) {
        setNote('Nudges are not switched on for this bar yet.');
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setNote('No nudges then. You can turn them on any time.');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toBytes(key),
      });
      await pushSubscribe(sub.toJSON() as PushSubscriptionJSON);
      setOn(true);
    } catch {
      setNote("That didn't take. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await pushUnsubscribe(sub.endpoint).catch(() => {});
        await sub.unsubscribe();
      }
      setOn(false);
      setNote('');
    } finally {
      setBusy(false);
    }
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
      {note && <span className="nudge-note">{note}</span>}
    </div>
  );
}

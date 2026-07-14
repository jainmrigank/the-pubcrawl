import { fetchPushKey, pushSubscribe, pushUnsubscribe } from './api';

/** VAPID keys travel as base64url; the browser wants raw bytes. */
function toBytes(base64url: string) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);

/** Apple only delivers push to a home-screen app, never to a browser tab. */
export const canSubscribeHere = () => pushSupported() && (!isIOS() || isStandalone());

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export type SubscribeResult = 'subscribed' | 'denied' | 'needs-install' | 'unavailable' | 'failed';

export async function subscribeToNudges(): Promise<SubscribeResult> {
  if (!pushSupported()) return 'unavailable';
  if (isIOS() && !isStandalone()) return 'needs-install';
  try {
    const { key } = await fetchPushKey();
    if (!key) return 'unavailable';
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toBytes(key),
    });
    await pushSubscribe(sub.toJSON() as PushSubscriptionJSON);
    return 'subscribed';
  } catch {
    return 'failed';
  }
}

export async function unsubscribeFromNudges() {
  const sub = await currentSubscription();
  if (!sub) return;
  await pushUnsubscribe(sub.endpoint).catch(() => {});
  await sub.unsubscribe();
}

// Reminder sign-up. The phone subscribes to its browser's push service and hands that address,
// its three reminder times and its time zone to the sender (worker/, on Cloudflare).
// Pushes carry no content: the service worker writes each reminder from the local lists.

import { SENDER } from './config.js';
export const VAPID_PUBLIC = 'BNAIiw93D3qWenKw0QSlMCMFrOTABWnuREiLBd_tUfX_jp3RNhugLeFpu4PrG54EHyWon0KdeT61FsNcDKSNPSM';

const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

const bytes = b64 => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - b64.length % 4) % 4));
  return Uint8Array.from(s, ch => ch.charCodeAt(0));
};
const SYNCED = 'ritualist.push';
const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const post = (path, body) => fetch(SENDER + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then(r => { if (!r.ok) throw new Error('reminder service said ' + r.status); return r; });
const mark = v => { try { v ? localStorage.setItem(SYNCED, v) : localStorage.removeItem(SYNCED); } catch { /* private mode */ } };
const marked = () => { try { return localStorage.getItem(SYNCED); } catch { return null; } };

// The service worker, or null if none registers within a few seconds (file://, blocked).
const registration = () => Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 3000))]);

// 'install' (iPhone, not yet on the Home Screen), 'unsupported', 'denied', 'off' or 'on'.
export async function status() {
  if (isIOS && !standalone) return { state: 'install' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return { state: 'unsupported' };
  if (Notification.permission === 'denied') return { state: 'denied' };
  try {
    const reg = await registration();
    if (!reg) return { state: 'unsupported' };
    const sub = await reg.pushManager.getSubscription();
    return sub ? { state: 'on', synced: !!marked() } : { state: 'off' };
  } catch { return { state: 'off' }; }
}

// Tells the sender this phone's address, times and zone. Skips the call when nothing changed,
// so opening the app doesn't cost a request; a failure is retried on the next open.
export async function sync(times, force = false) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  const reg = await registration();
  const sub = reg && await reg.pushManager.getSubscription();
  if (!sub) return false;
  const body = { sub: sub.toJSON(), times, tz: zone() };
  const sig = JSON.stringify(body);
  if (!force && marked() === sig) return true;
  mark(null);
  await post('/subscribe', body);
  mark(sig);
  return true;
}

export async function enable(times) {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return status();
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(VAPID_PUBLIC) });
  await sync(times, true);
  return status();
}

export async function disable() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    try { await post('/unsubscribe', { endpoint: sub.endpoint }); } catch { /* it drops dead addresses itself */ }
    await sub.unsubscribe();
  }
  mark(null);
  return status();
}

// Shows a real notification now, written by the service worker exactly as a push would.
export async function showPreview(slot) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  reg.active?.postMessage({ type: 'preview', slot });
  return true;
}

// Asks the sender to push this phone right now: proves the whole path works.
export async function ping() {
  const reg = await registration();
  const sub = reg && await reg.pushManager.getSubscription();
  if (!sub) return false;
  await post('/ping', { endpoint: sub.endpoint });
  return true;
}

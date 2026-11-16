// Offline cache + reminders. A push arrives empty; this worker reads the lists the app
// saved to Cache Storage and writes the reminder itself, so list contents never leave the phone.
importScripts('js/core.js');
const CACHE = 'ritualist-v12';
const DATA = 'ritualist-data';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== DATA).map(k => caches.delete(k)))).then(() => self.clients.claim())
));

// Network first so updates show up right away; the cache is the offline fallback.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone();
    caches.open(CACHE).then(c => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request, { cacheName: CACHE })));
});

async function readState() {
  try {
    const c = await caches.open(DATA);
    const r = await c.match(new Request('state.json'));
    return Core.normalize(r ? await r.json() : null);
  } catch { return Core.emptyState(); }
}

async function showBrief(slot) {
  const now = Date.now();
  const s = await readState();
  const b = Core.brief(s, slot || Core.slotFor(now, s.settings.reminders), now);
  return self.registration.showNotification(b.title, {
    body: b.body,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: 'ritualist-brief', // a new reminder replaces the last one
    data: { url: './' },
  });
}

// iOS requires every push to show a notification, so this always shows one.
self.addEventListener('push', e => {
  let slot = null;
  try { slot = e.data ? e.data.json().slot : null; } catch { /* empty push */ }
  e.waitUntil(showBrief(slot));
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'preview') e.waitUntil(showBrief(e.data.slot));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => 'focus' in x);
    return c ? c.focus() : self.clients.openWindow('./');
  }));
});

// Ritualist reminder sender (Cloudflare Worker + D1).
//
// Phones sign up themselves: the app POSTs its push subscription, its three reminder times
// and its time zone. Once a minute the cron checks who has a reminder due and sends that
// phone an empty push; the phone's service worker writes the reminder from its own lists.
// Nothing about anyone's lists is ever sent here.
//
//   POST /subscribe    { sub, times: {morning, midday, evening}, tz }
//   POST /unsubscribe  { endpoint }
//   POST /ping         { endpoint }   sends one push now (signed-up phones only)
//   POST /backup/put    { id, data }  stores a phone's encrypted backup (replaces the last one)
//   POST /backup/get    { id }        returns it
//   POST /backup/delete { id }        removes it
// Backups are encrypted on the phone with a key that never comes here; `id` is a hash of
// that key, so only someone holding the key can find, replace or delete a backup.

const SUBJECT = 'https://noahwitchell.github.io/ritualist/';
const SLOTS = ['morning', 'midday', 'evening'];
const LATE_OK = 30; // minutes: a reminder missed by an outage is still sent if this recent
const PUSH_HOSTS = /(^|\.)(push\.apple\.com|fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/;

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

// ---------- time ----------

// The local date and minute-of-day in a time zone.
export function localNow(tz, at = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute };
}

const toMin = hhmm => { const m = /^(\d{2}):(\d{2})$/.exec(hhmm || ''); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; };

// The slots this row should get a push for right now (normally none, at most one).
export function dueSlots(row, at = new Date()) {
  const { date, min } = localNow(row.tz, at);
  return SLOTS.filter(k => {
    const t = toMin(row[k]);
    return t !== null && min >= t && min - t < LATE_OK && row['sent_' + k] !== date;
  }).slice(-1).map(k => ({ slot: k, date }));
}

// ---------- push ----------

const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = s => new TextEncoder().encode(s);

let keyCache = null;
async function signingKey(env) {
  if (!keyCache) {
    const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
    keyCache = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  }
  return keyCache;
}

export async function vapidHeader(endpoint, key, publicKey, nowSec = Math.floor(Date.now() / 1000)) {
  const head = b64u(enc(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSec + 12 * 3600, sub: SUBJECT })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${publicKey}`;
}

async function sendPush(env, sub) {
  const key = await signingKey(env);
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: { Authorization: await vapidHeader(sub.endpoint, key, env.VAPID_PUBLIC), TTL: '3600', Urgency: 'high' },
  });
}

// ---------- sign-up ----------

const idFor = async endpoint => b64u(await crypto.subtle.digest('SHA-256', enc(endpoint)));

function validEndpoint(e) {
  try { const u = new URL(e); return u.protocol === 'https:' && PUSH_HOSTS.test(u.hostname); } catch { return false; }
}
function validTz(tz) {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return typeof tz === 'string' && tz.length < 64; } catch { return false; }
}

const BACKUP_MAX = 1_500_000; // characters of encrypted base64; a year of heavy use is far smaller

async function readBody(req, max = 4096) {
  const text = await req.text();
  if (text.length > max) throw new Error('too big');
  return JSON.parse(text);
}

async function subscribe(env, b) {
  const sub = b && b.sub;
  if (!sub || !validEndpoint(sub.endpoint) || !sub.keys) return json({ error: 'not a push subscription' }, 400);
  if (!validTz(b.tz)) return json({ error: 'unknown time zone' }, 400);
  const t = b.times || {};
  if (!SLOTS.every(k => t[k] === '' || toMin(t[k]) !== null)) return json({ error: 'times must be HH:MM' }, 400);
  const id = await idFor(sub.endpoint);
  const now = Date.now();
  // A sign-up straight after a reminder time doesn't fire that reminder late.
  const { date, min } = localNow(b.tz);
  const skip = k => (toMin(t[k]) !== null && toMin(t[k]) <= min ? date : null);
  await env.DB.prepare(`INSERT INTO subs (id, sub, tz, morning, midday, evening, sent_morning, sent_midday, sent_evening, created, updated)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
      ON CONFLICT(id) DO UPDATE SET sub = ?2, tz = ?3, morning = ?4, midday = ?5, evening = ?6, updated = ?10`)
    .bind(id, JSON.stringify(sub), b.tz, t.morning || '', t.midday || '', t.evening || '', skip('morning'), skip('midday'), skip('evening'), now)
    .run();
  return json({ ok: true });
}

async function unsubscribe(env, b) {
  if (!b || typeof b.endpoint !== 'string') return json({ error: 'endpoint needed' }, 400);
  await env.DB.prepare('DELETE FROM subs WHERE id = ?1').bind(await idFor(b.endpoint)).run();
  return json({ ok: true });
}

async function ping(env, b) {
  if (!b || typeof b.endpoint !== 'string') return json({ error: 'endpoint needed' }, 400);
  const row = await env.DB.prepare('SELECT sub FROM subs WHERE id = ?1').bind(await idFor(b.endpoint)).first();
  if (!row) return json({ error: 'not signed up' }, 404);
  const res = await sendPush(env, JSON.parse(row.sub));
  return json({ ok: res.ok, status: res.status }, res.ok ? 200 : 502);
}

// ---------- encrypted backups ----------

const validId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{43}$/.test(id);

async function backupPut(env, b) {
  if (!validId(b.id) || typeof b.data !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(b.data)) return json({ error: 'bad backup' }, 400);
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO backups (id, data, updated) VALUES (?1, ?2, ?3)
      ON CONFLICT(id) DO UPDATE SET data = ?2, updated = ?3`).bind(b.id, b.data, now).run();
  return json({ ok: true, updated: now });
}

async function backupGet(env, b) {
  if (!validId(b.id)) return json({ error: 'bad id' }, 400);
  const row = await env.DB.prepare('SELECT data, updated FROM backups WHERE id = ?1').bind(b.id).first();
  return row ? json({ ok: true, data: row.data, updated: row.updated }) : json({ error: 'no backup for that key' }, 404);
}

async function backupDelete(env, b) {
  if (!validId(b.id)) return json({ error: 'bad id' }, 400);
  await env.DB.prepare('DELETE FROM backups WHERE id = ?1').bind(b.id).run();
  return json({ ok: true });
}

// ---------- the minute tick ----------

export async function tick(env, at = new Date()) {
  const { results } = await env.DB.prepare('SELECT * FROM subs').all();
  let sent = 0, gone = 0;
  for (const row of results) {
    for (const { slot, date } of dueSlots(row, at)) {
      // Mark first, so a slow push service can't cause a double send on the next tick.
      await env.DB.prepare(`UPDATE subs SET sent_${slot} = ?1 WHERE id = ?2`).bind(date, row.id).run();
      try {
        const res = await sendPush(env, JSON.parse(row.sub));
        if (res.ok) sent++;
        else if (res.status === 404 || res.status === 410) { gone++; await env.DB.prepare('DELETE FROM subs WHERE id = ?1').bind(row.id).run(); }
        else console.log('push failed', res.status, await res.text());
      } catch (err) { console.log('push error', String(err)); }
    }
  }
  if (sent || gone) console.log(`sent ${sent}, removed ${gone}`);
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const path = new URL(req.url).pathname;
    if (req.method === 'GET' && path === '/') return new Response('Ritualist reminders are running.', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'not found' }, 404);
    let b;
    try { b = await readBody(req, path === '/backup/put' ? BACKUP_MAX : 4096); } catch { return json({ error: 'bad request' }, 400); }
    if (!b || typeof b !== 'object') return json({ error: 'bad request' }, 400);
    if (path === '/backup/put') return backupPut(env, b);
    if (path === '/backup/get') return backupGet(env, b);
    if (path === '/backup/delete') return backupDelete(env, b);
    if (path === '/subscribe') return subscribe(env, b);
    if (path === '/unsubscribe') return unsubscribe(env, b);
    if (path === '/ping') return ping(env, b);
    return json({ error: 'not found' }, 404);
  },
  async scheduled(_event, env, ctx) { ctx.waitUntil(tick(env)); },
};

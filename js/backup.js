// Automatic encrypted backup. Once a day the lists are compressed, encrypted on this phone
// with a random key, and stored by the sender (worker/), replacing the previous copy.
// The key is shown to the person once as a "recovery key" and never leaves the phone otherwise;
// the sender only ever sees ciphertext and a hash of the key (used to find the backup).
import { SENDER } from './config.js';

const LOCAL = 'ritualist.backup';
const DAILY_MS = 20 * 3600 * 1000; // "once a day", with slack for opening the app a bit earlier
const AAD = new TextEncoder().encode('ritualist-backup-v1');

// ---------- recovery key: 32 random bytes as Crockford base32, grouped for reading ----------

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function keyToText(bytes) {
  let bits = 0, val = 0, out = '';
  for (const b of bytes) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) out += B32[(val << (5 - bits)) & 31];
  return out.match(/.{1,4}/g).join('-');
}

export function textToKey(text) {
  const clean = String(text || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
  if (clean.length !== 52) throw new Error('That doesn\'t look like a recovery key.');
  const out = [];
  let bits = 0, val = 0;
  for (const ch of clean) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new Error('That doesn\'t look like a recovery key.');
    val = (val << 5) | v; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out.slice(0, 32));
}

// ---------- crypto ----------

const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));
const b64url = bytes => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function idFor(key) {
  const tag = new TextEncoder().encode('ritualist-backup-id');
  const buf = new Uint8Array(key.length + tag.length); buf.set(key); buf.set(tag, key.length);
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)));
}

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

export async function encrypt(state, key) {
  const zipped = await pipe(new TextEncoder().encode(JSON.stringify(state)), new CompressionStream('gzip'));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, k, zipped));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return b64(out);
}

export async function decrypt(data, key) {
  const all = unb64(data);
  const k = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['decrypt']);
  let zipped;
  try { zipped = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.subarray(0, 12), additionalData: AAD }, k, all.subarray(12))); }
  catch { throw new Error('That key doesn\'t open this backup.'); }
  return JSON.parse(new TextDecoder().decode(await pipe(zipped, new DecompressionStream('gzip'))));
}

// ---------- talking to the sender ----------

async function call(path, body) {
  const r = await fetch(SENDER + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `backup service said ${r.status}`);
  return j;
}

// ---------- this phone's backup setting ----------

export function info() {
  try { return JSON.parse(localStorage.getItem(LOCAL)) || null; } catch { return null; }
}
const remember = v => { try { v ? localStorage.setItem(LOCAL, JSON.stringify(v)) : localStorage.removeItem(LOCAL); } catch { /* private mode */ } };

// Turns backup on with a fresh key and makes the first copy. Returns the recovery key text.
export async function enable(state) {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const text = keyToText(key);
  remember({ key: text, last: 0 });
  await backupNow(state);
  return text;
}

export async function backupNow(state) {
  const cur = info();
  if (!cur) return null;
  const key = textToKey(cur.key);
  const res = await call('/backup/put', { id: await idFor(key), data: await encrypt(state, key) });
  remember({ ...cur, last: res.updated || Date.now() });
  return res.updated;
}

// Called whenever the app opens or comes back: backs up if the last copy is a day old.
export async function maybeDaily(state) {
  const cur = info();
  if (!cur || Date.now() - (cur.last || 0) < DAILY_MS) return false;
  await backupNow(state);
  return true;
}

// Fetches and opens the backup for a recovery key, and keeps backing up to it from now on.
export async function restore(text) {
  const key = textToKey(text);
  const res = await call('/backup/get', { id: await idFor(key) });
  const state = await decrypt(res.data, key);
  remember({ key: keyToText(key), last: res.updated });
  return { state, updated: res.updated };
}

// Deletes the copy on the server and turns automatic backup off on this phone.
export async function remove() {
  const cur = info();
  if (cur) await call('/backup/delete', { id: await idFor(textToKey(cur.key)) });
  remember(null);
}

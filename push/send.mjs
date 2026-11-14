// Sends one empty reminder push to every saved phone. No dependencies (Node 18+).
// The phone's service worker writes the actual reminder from its own lists, so the push
// carries nothing and needs no payload encryption, only a signed VAPID header.
//
//   VAPID_PRIVATE_JWK='{"kty":"EC",...}' REMINDER_CODES='code1
//   code2' node push/send.mjs [morning|midday|evening]
//
// Locally, the key can come from push/vapid-private.json (git-ignored) instead.
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

const PUBLIC = 'BNAIiw93D3qWenKw0QSlMCMFrOTABWnuREiLBd_tUfX_jp3RNhugLeFpu4PrG54EHyWon0KdeT61FsNcDKSNPSM';
const SUBJECT = 'https://noahwitchell.github.io/cadence/';

const b64u = buf => Buffer.from(buf).toString('base64url');

function privateKey() {
  if (process.env.VAPID_PRIVATE_JWK) return createPrivateKey({ key: JSON.parse(process.env.VAPID_PRIVATE_JWK), format: 'jwk' });
  const local = new URL('./vapid-private.json', import.meta.url);
  if (existsSync(local)) return createPrivateKey({ key: JSON.parse(readFileSync(local, 'utf8')).jwk, format: 'jwk' });
  throw new Error('No VAPID private key: set VAPID_PRIVATE_JWK');
}

export function vapidHeader(endpoint, key, nowSec = Math.floor(Date.now() / 1000)) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud, exp: nowSec + 12 * 3600, sub: SUBJECT }));
  const sig = sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${PUBLIC}`;
}

export const decodeCode = code => JSON.parse(Buffer.from(code.trim(), 'base64url').toString('utf8'));

async function main() {
  const codes = (process.env.REMINDER_CODES || '').split(/\s+/).filter(Boolean);
  if (!codes.length) { console.log('No reminder codes saved yet. Nothing to send.'); return; }
  const key = privateKey();
  let failed = 0;
  for (const code of codes) {
    let sub;
    try { sub = decodeCode(code); } catch { console.error('Unreadable reminder code, skipped.'); failed++; continue; }
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: { Authorization: vapidHeader(sub.endpoint, key), TTL: '3600', Urgency: 'normal', 'Content-Length': '0' },
    });
    const host = new URL(sub.endpoint).host;
    if (res.ok) console.log(`sent → ${host} (${res.status})`);
    else { failed++; console.error(`failed → ${host}: ${res.status} ${await res.text()}`); if (res.status === 404 || res.status === 410) console.error('  That phone turned reminders off or reinstalled: remove its code.'); }
  }
  if (failed === codes.length) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();

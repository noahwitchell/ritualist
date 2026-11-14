// node --test worker/test.mjs : due-time logic and the VAPID signature.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { localNow, dueSlots, vapidHeader } from './index.js';

const row = { tz: 'America/Los_Angeles', morning: '07:30', midday: '12:30', evening: '18:00' };

test('local time follows the phone time zone, DST included', () => {
  assert.deepEqual(localNow('America/Los_Angeles', new Date('2026-11-13T15:30:00Z')), { date: '2026-11-13', min: 7 * 60 + 30 });
  assert.deepEqual(localNow('America/Los_Angeles', new Date('2026-07-13T14:30:00Z')), { date: '2026-07-13', min: 7 * 60 + 30 });
  assert.equal(localNow('Asia/Tokyo', new Date('2026-11-13T15:30:00Z')).date, '2026-11-14');
});

test('a reminder is due from its minute, once a day, for up to 30 minutes', () => {
  const at = iso => new Date(iso);
  assert.deepEqual(dueSlots(row, at('2026-11-13T15:29:00Z')), []);
  assert.deepEqual(dueSlots(row, at('2026-11-13T15:30:00Z')), [{ slot: 'morning', date: '2026-11-13' }]);
  assert.deepEqual(dueSlots({ ...row, sent_morning: '2026-11-13' }, at('2026-11-13T15:31:00Z')), []);
  assert.deepEqual(dueSlots(row, at('2026-11-13T16:00:00Z')), []); // 30 min late: skipped
  assert.deepEqual(dueSlots({ ...row, sent_morning: '2026-11-12' }, at('2026-11-14T02:00:00Z')), [{ slot: 'evening', date: '2026-11-13' }]);
  assert.deepEqual(dueSlots({ ...row, evening: '' }, at('2026-11-14T02:00:00Z')), []);
});

test('VAPID header signs with WebCrypto and verifies against the public key', async () => {
  const jwk = JSON.parse(readFileSync(new URL('../push/vapid-private.json', import.meta.url), 'utf8')).jwk;
  const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const h = await vapidHeader('https://web.push.apple.com/abc', key, 'PUB');
  const [, t] = /t=([^,]+)/.exec(h);
  const [a, b, s] = t.split('.');
  assert.equal(JSON.parse(Buffer.from(b, 'base64url')).aud, 'https://web.push.apple.com');
  const pub = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, format: 'jwk' });
  assert.ok(verify('sha256', Buffer.from(`${a}.${b}`), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
});

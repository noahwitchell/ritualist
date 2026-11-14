// node --test tests/backup.test.mjs : recovery key format and encryption round trip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { keyToText, textToKey, idFor, encrypt, decrypt } from '../js/backup.js';

test('recovery key text round-trips and forgives typing', () => {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const text = keyToText(key);
  assert.match(text, /^([0-9A-HJKMNP-TV-Z]{4}-){12}[0-9A-HJKMNP-TV-Z]{4}$/);
  assert.deepEqual(textToKey(text), key);
  assert.deepEqual(textToKey(' ' + text.toLowerCase().replace(/-/g, ' ') + '\n'), key);
  assert.throws(() => textToKey('not a key'));
});

test('backups decrypt only with their own key', async () => {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const state = { v: 1, tasks: [{ id: 'a', title: 'Dishes ✓', done: {} }], lists: [{ name: 'Gift ideas', items: [] }] };
  const data = await encrypt(state, key);
  assert.doesNotMatch(Buffer.from(data, 'base64').toString('latin1'), /Dishes|Gift/);
  assert.deepEqual(await decrypt(data, key), state);
  await assert.rejects(decrypt(data, crypto.getRandomValues(new Uint8Array(32))), /doesn't open/);
  assert.notEqual(await encrypt(state, key), data, 'fresh IV every time');
});

test('the server id is a hash of the key, not the key', async () => {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const id = await idFor(key);
  assert.match(id, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(id, await idFor(key));
  assert.ok(!keyToText(key).replace(/-/g, '').includes(id.slice(0, 8)));
});

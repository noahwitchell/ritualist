// node --test tests/store.test.mjs : unreadable saved data is set aside, never overwritten.
import test from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
};
const { load, save, rescued, clearRescue } = await import('../js/store.js');
const C = globalThis.Core;

const good = () => { const s = C.emptyState(); C.addTodo(s, 'Fix the gate', 15, new Date()); return s; };

test('a broken save is kept aside and survives the next save', () => {
  mem.clear();
  mem.set('ritualist.v1', '{"tasks": [oops');
  const s = load();
  assert.equal(s.todos.length, 0);
  save(s);
  assert.equal(rescued().length, 1);
  assert.equal(rescued()[0].raw, '{"tasks": [oops');
  load(); // opening again doesn't stack duplicates
  assert.equal(rescued().length, 1);
});

test('once an update can read it again, it comes back by itself', () => {
  mem.clear();
  mem.set('ritualist.v1', JSON.stringify(good()));
  const real = C.normalize;
  C.normalize = () => { throw new Error('bad update'); };
  save(load()); // the bad version starts blank and saves
  C.normalize = real;
  const back = load(); // the fixed version
  assert.equal(back.todos[0].title, 'Fix the gate');
  assert.equal(rescued().length, 0);
});

test('it does not replace new work automatically', () => {
  mem.clear();
  mem.set('ritualist.v1', JSON.stringify(good()));
  const real = C.normalize;
  C.normalize = () => { throw new Error('bad update'); };
  const s = load();
  C.normalize = real;
  C.addTodo(s, 'Something new', 5, new Date());
  save(s);
  const after = load();
  assert.equal(after.todos[0].title, 'Something new');
  assert.equal(rescued().length, 1);
  clearRescue();
});

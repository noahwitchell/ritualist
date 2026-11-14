// node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/core.js';
const C = globalThis.Core;

const at = (s, h = 9, m = 0) => { const [y, mo, d] = s.split('-').map(Number); return new Date(y, mo - 1, d, h, m).getTime(); };
const days = (from, n, h = 9) => Array.from({ length: n }, (_, i) => at(C.ymd(C.addDays(C.parse(from), i)), h));

test('period keys', () => {
  const d = C.today(at('2026-11-13')); // a Friday
  assert.equal(C.keyOf('day', d), 'day:2026-11-13');
  assert.equal(C.keyOf('week', d), 'week:2026-11-09');
  assert.equal(C.keyOf('month', d), 'month:2026-11');
  assert.equal(C.keyOf('quarter', d), 'quarter:2026-Q4');
  assert.equal(C.keyOf('half', d), 'half:2026-H2');
  assert.equal(C.keyOf('year', d), 'year:2026');
  assert.equal(C.keyOf('week', C.parse('2026-11-09')), 'week:2026-11-09');
  assert.equal(C.keyOf('week', C.parse('2026-11-15')), 'week:2026-11-09');
  assert.equal(C.ymd(C.prevStart('quarter', d)), '2026-07-01');
  assert.equal(C.ymd(C.nextStart('half', d)), '2027-01-01');
});

test('the day turns over at 3 AM', () => {
  assert.equal(C.ymd(C.today(at('2026-11-14', 1, 30))), '2026-11-13');
  assert.equal(C.ymd(C.today(at('2026-11-14', 3, 0))), '2026-11-14');
});

test('ticking, streaks and the unfinished current day', () => {
  const s = C.emptyState();
  const t = C.addTask(s, 'Laundry', 'day', at('2026-11-01'));
  for (const ts of days('2026-11-01', 7)) C.toggleTask(s, t.id, ts);
  assert.equal(C.streakOf(t, at('2026-11-07', 20)), 7);
  assert.equal(C.streakOf(t, at('2026-11-08', 9)), 7, 'today not done yet keeps the streak');
  assert.equal(C.streakOf(t, at('2026-11-09', 9)), 0, 'a missed day breaks it');
  assert.equal(C.bestStreakOf(t, at('2026-11-09', 9)), 7);
  const r = C.toggleTask(s, t.id, at('2026-11-09'));
  assert.equal(r.done, true);
  assert.equal(C.toggleTask(s, t.id, at('2026-11-09', 10)).done, false, 'second tap unticks');
});

test('milestone and clean-sweep messages', () => {
  const s = C.emptyState();
  const a = C.addTask(s, 'Laundry', 'day', at('2026-11-01'));
  const b = C.addTask(s, 'Dishes', 'day', at('2026-11-01'));
  C.toggleTask(s, a.id, at('2026-11-01')); C.toggleTask(s, a.id, at('2026-11-02'));
  const r = C.toggleTask(s, a.id, at('2026-11-03'));
  assert.match(r.message, /Laundry: 3 days in a row/);
  const r2 = C.toggleTask(s, b.id, at('2026-11-03'));
  assert.equal(r2.cleared, true);
  assert.match(r2.message, /crushed your daily list/);
});

test('slipping 4 of the last 5 days asks for a rethink', () => {
  const s = C.emptyState();
  const t = C.addTask(s, 'Dishes', 'day', at('2026-11-01'));
  C.toggleTask(s, t.id, at('2026-11-02'));
  assert.equal(C.reflectionFor(t, at('2026-11-05')), null, 'not enough days yet');
  const r = C.reflectionFor(t, at('2026-11-06'));
  assert.ok(r);
  assert.equal(r.misses, 4);
  assert.equal(r.looser, 'week');
  assert.match(r.title, /Dishes slipped 4 of the last 5 days/);
  C.snoozeReflection(s, t.id, at('2026-11-06'));
  assert.equal(C.reflectionFor(t, at('2026-11-07')), null, 'kept: quiet for a while');
  assert.ok(C.reflectionFor(t, at('2026-11-12')), 'and asks again later');
});

test('weekly slip and praise', () => {
  const s = C.emptyState();
  const t = C.addTask(s, 'Vacuum', 'week', at('2026-10-05'));
  assert.ok(C.reflectionFor(t, at('2026-10-27')), '3 weeks missed');
  const u = C.addTask(s, 'Call mom', 'week', at('2026-10-05'));
  for (const d of ['2026-10-06', '2026-10-13', '2026-10-20']) C.toggleTask(s, u.id, at(d));
  const p = C.praiseFor(u, at('2026-10-27'));
  assert.match(p.title, /Call mom: 3 weeks running/);
});

test('moving a task keeps its old history honest', () => {
  const s = C.emptyState();
  const t = C.addTask(s, 'Read', 'day', at('2026-11-01'));
  C.toggleTask(s, t.id, at('2026-11-01'));
  C.toggleTask(s, t.id, at('2026-11-04'));
  C.moveTask(s, t.id, 'week', at('2026-11-04', 12), 'reflection');
  assert.equal(t.cycle, 'week');
  assert.equal(t.spans.length, 2);
  assert.equal(t.spans[0].to, '2026-11-04');
  assert.ok(C.isDone(t, at('2026-11-05')), 'today\'s tick carries to this week');
  assert.equal(C.dayStats(s, '2026-11-01').total, 1);
  assert.equal(C.dayStats(s, '2026-11-05').total, 0, 'no longer on the daily list');
  assert.equal(C.earned(s, at('2026-11-05')).honest, true);
});

test('retire and restore', () => {
  const s = C.emptyState();
  const t = C.addTask(s, 'Run', 'day', at('2026-11-01'));
  C.retireTask(s, t.id, at('2026-11-03'));
  assert.equal(C.tasksIn(s, 'day').length, 0);
  assert.equal(C.dayStats(s, '2026-11-02').total, 1);
  assert.equal(C.dayStats(s, '2026-11-03').total, 0);
  C.restoreTask(s, t.id, at('2026-11-10'));
  assert.equal(C.tasksIn(s, 'day').length, 1);
  assert.equal(C.dayStats(s, '2026-11-05').total, 0, 'the gap stays a gap');
  assert.equal(C.dayStats(s, '2026-11-10').total, 1);
});

test('perfect days and achievements', () => {
  const s = C.emptyState();
  const a = C.addTask(s, 'Bed', 'day', at('2026-11-01'));
  const b = C.addTask(s, 'Walk', 'day', at('2026-11-01'));
  for (const ts of days('2026-11-01', 7, 10)) { C.toggleTask(s, a.id, ts); C.toggleTask(s, b.id, ts); }
  assert.equal(C.perfectRun(s, at('2026-11-07', 20)), 7);
  assert.equal(C.perfectRun(s, at('2026-11-08', 9)), 7);
  const fresh = C.unlock(s, at('2026-11-07', 20)).map(x => x.id);
  for (const id of ['first', 'sweep', 'early', 'hattrick', 'flawless', 'streak7']) assert.ok(fresh.includes(id), id);
  assert.ok(!fresh.includes('streak30'));
  assert.equal(C.unlock(s, at('2026-11-07', 21)).length, 0, 'each one only once');
});

test('weekly sweep and comeback', () => {
  const s = C.emptyState();
  const t = C.addTask(s, 'Floss', 'day', at('2026-11-01'));
  C.toggleTask(s, t.id, at('2026-11-01'));
  const r = C.toggleTask(s, t.id, at('2026-11-05'));
  assert.equal(r.comeback, true);
  assert.equal(C.earned(s, at('2026-11-05')).comeback, true);
  const w = C.addTask(s, 'Plants', 'week', at('2026-11-02'));
  assert.equal(C.everSwept(s, 'week', at('2026-11-03')), false);
  C.toggleTask(s, w.id, at('2026-11-03'));
  assert.equal(C.everSwept(s, 'week', at('2026-11-03')), true);
});

test('free lists and brain dump', () => {
  const s = C.emptyState();
  const it = C.addItem(s, 'inbox', 'Renew passport', at('2026-11-01'));
  C.addItem(s, 'inbox', 'Water plants', at('2026-11-01'));
  const t = C.itemToTask(s, 'inbox', C.findList(s, 'inbox').items[1].id, 'week', at('2026-11-01'));
  assert.equal(t.title, 'Water plants');
  assert.equal(C.findList(s, 'inbox').items.length, 1);
  C.moveItem(s, 'inbox', it.id, 'wishes');
  assert.equal(C.findList(s, 'wishes').items[0].title, 'Renew passport');
  C.toggleItem(s, 'wishes', it.id, at('2026-11-02'));
  assert.equal(s.counters.itemsChecked, 1);
  C.clearDone(s, 'wishes');
  assert.equal(C.findList(s, 'wishes').items.length, 0);
});

test('reminder briefs', () => {
  const s = C.emptyState();
  const a = C.addTask(s, 'Dishes', 'day', at('2026-11-09'));
  const b = C.addTask(s, 'Laundry', 'day', at('2026-11-09'));
  C.addTask(s, 'Vacuum', 'week', at('2026-11-09'));
  b.star = true;
  const m = C.brief(s, 'morning', at('2026-11-09', 7, 30)); // Monday
  assert.equal(m.title, "Good morning · 2 on today's list");
  assert.match(m.body, /^Laundry, Dishes\./, 'priorities first');
  assert.match(m.body, /New week: 1 weekly task/);
  C.toggleTask(s, a.id, at('2026-11-09', 10));
  const mid = C.brief(s, 'midday', at('2026-11-09', 12, 30));
  assert.equal(mid.title, 'Midday check-in · 1 of 2 done');
  assert.equal(mid.body, 'Still to go: Laundry.');
  const eve = C.brief(s, 'evening', at('2026-11-15', 18)); // Sunday
  assert.match(eve.body, /2 left/);
  assert.match(eve.body, /Weekly ends today: Vacuum/);
  C.toggleTask(s, a.id, at('2026-11-15', 18)); C.toggleTask(s, b.id, at('2026-11-15', 18));
  assert.equal(C.brief(s, 'evening', at('2026-11-15', 19)).title, 'All done today');
  assert.equal(C.slotFor(at('2026-11-15', 7)), 'morning');
  assert.equal(C.slotFor(at('2026-11-15', 12)), 'midday');
  assert.equal(C.slotFor(at('2026-11-15', 18)), 'evening');
});

test('normalize keeps data and fills gaps', () => {
  assert.equal(C.normalize(null).lists.length, 3);
  const s = C.normalize({ tasks: [{ id: 'x', title: 'A', cycle: 'day', created: '2026-11-01' }], settings: {} });
  assert.equal(s.tasks[0].spans[0].from, '2026-11-01');
  assert.equal(s.settings.reminders.morning, '07:30');
});

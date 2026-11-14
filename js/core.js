// Ritualist rules. Pure functions over plain data, no DOM.
// A classic script (no import/export) so the page, the service worker (importScripts)
// and node tests can all load it. Everything hangs off globalThis.Core.
(function (root) {
  'use strict';

  // ---------- cycles and periods ----------

  const CYCLES = [
    { id: 'day', name: 'Daily', tab: 'Day', unit: 'day', units: 'days', adj: 'daily' },
    { id: 'week', name: 'Weekly', tab: 'Week', unit: 'week', units: 'weeks', adj: 'weekly' },
    { id: 'month', name: 'Monthly', tab: 'Month', unit: 'month', units: 'months', adj: 'monthly' },
    { id: 'quarter', name: 'Quarterly', tab: 'Quarter', unit: 'quarter', units: 'quarters', adj: 'quarterly' },
    { id: 'half', name: 'Twice a year', tab: 'Half', unit: 'half-year', units: 'half-years', adj: 'twice-a-year' },
    { id: 'year', name: 'Yearly', tab: 'Year', unit: 'year', units: 'years', adj: 'yearly' },
  ];
  const CYCLE = Object.fromEntries(CYCLES.map(c => [c.id, c]));
  const CYCLE_IDS = CYCLES.map(c => c.id);
  const DAY_STARTS_AT = 3; // a 1 AM tick still counts for the evening before

  const pad = n => String(n).padStart(2, '0');
  const noon = (y, m, d) => new Date(y, m, d, 12);
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return noon(y, m - 1, d); };
  const addDays = (d, n) => noon(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);

  // The calendar day a moment belongs to, as a noon Date (noon keeps DST out of the maths).
  function today(now) {
    const d = new Date(now);
    if (d.getHours() < DAY_STARTS_AT) d.setDate(d.getDate() - 1);
    return noon(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function startOf(cycle, d) {
    const y = d.getFullYear(), m = d.getMonth();
    switch (cycle) {
      case 'day': return noon(y, m, d.getDate());
      case 'week': return addDays(noon(y, m, d.getDate()), -((d.getDay() + 6) % 7)); // Monday
      case 'month': return noon(y, m, 1);
      case 'quarter': return noon(y, m - (m % 3), 1);
      case 'half': return noon(y, m < 6 ? 0 : 6, 1);
      case 'year': return noon(y, 0, 1);
    }
    throw new Error('unknown cycle ' + cycle);
  }

  function nextStart(cycle, d) {
    const s = startOf(cycle, d), y = s.getFullYear(), m = s.getMonth();
    switch (cycle) {
      case 'day': return addDays(s, 1);
      case 'week': return addDays(s, 7);
      case 'month': return noon(y, m + 1, 1);
      case 'quarter': return noon(y, m + 3, 1);
      case 'half': return noon(y, m + 6, 1);
      case 'year': return noon(y + 1, 0, 1);
    }
  }

  const prevStart = (cycle, d) => startOf(cycle, addDays(startOf(cycle, d), -1));

  function keyOf(cycle, d) {
    const s = startOf(cycle, d), y = s.getFullYear(), m = s.getMonth();
    switch (cycle) {
      case 'day': case 'week': return `${cycle}:${ymd(s)}`;
      case 'month': return `month:${y}-${pad(m + 1)}`;
      case 'quarter': return `quarter:${y}-Q${m / 3 + 1}`;
      case 'half': return `half:${y}-H${m < 6 ? 1 : 2}`;
      case 'year': return `year:${y}`;
    }
  }

  // Days left in the current period, counting today.
  const daysLeft = (cycle, now) => daysBetween(ymd(today(now)), ymd(nextStart(cycle, today(now))));

  // ---------- state ----------

  function emptyState() {
    return {
      v: 1,
      tasks: [],      // repeating tasks: { id, title, cycle, spans:[{cycle,from,to}], done:{key:ts}, star, retired, snooze, created }
      lists: [],      // free lists, no schedule: { id, name, icon, items }
      events: [],     // how the lists changed: { t, type, id, title, from, to, via }
      unlocked: {},   // achievement id -> ymd first earned
      counters: { itemsChecked: 0 },
      settings: { reminders: { morning: '07:30', midday: '12:30', evening: '18:00' } },
    };
  }

  // Fills in anything an older or hand-edited state is missing. Never drops data.
  function normalize(raw) {
    const base = emptyState();
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tasks)) return base;
    const s = { ...base, ...raw };
    s.lists = Array.isArray(raw.lists) ? raw.lists : base.lists;
    // The three starter lists early versions made are dropped if they were never used.
    const STARTERS = { inbox: 'Brain dump', groceries: 'Groceries', wishes: 'Wish list' };
    s.lists = s.lists.filter(l => !(STARTERS[l.id] === l.name && !(l.items || []).length));
    s.events = Array.isArray(raw.events) ? raw.events : [];
    s.unlocked = raw.unlocked || {};
    s.counters = { ...base.counters, ...raw.counters };
    s.settings = { ...base.settings, ...raw.settings, reminders: { ...base.settings.reminders, ...(raw.settings || {}).reminders } };
    for (const t of s.tasks) { t.done = t.done || {}; t.spans = t.spans || [{ cycle: t.cycle, from: t.created, to: null }]; }
    for (const l of s.lists) l.items = l.items || [];
    return s;
  }

  let seq = 0;
  const newId = now => (now || Date.now()).toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6);

  const live = s => s.tasks.filter(t => !t.retired);
  const tasksIn = (s, cycle) => live(s).filter(t => t.cycle === cycle);
  const isDone = (t, now) => !!t.done[keyOf(t.cycle, today(now))];
  const currentSpan = t => t.spans[t.spans.length - 1];

  // Does task t have a span of `cycle` that overlaps [startYmd, endYmd)?
  function coversPeriod(t, cycle, startYmd, endYmd) {
    return t.spans.some(sp => sp.cycle === cycle && sp.from < endYmd && (sp.to == null || sp.to > startYmd));
  }

  function log(s, now, e) { s.events.push({ t: now, ...e }); }

  function addTask(s, title, cycle, now) {
    title = String(title || '').trim();
    if (!title) return null;
    const d = ymd(today(now));
    const t = { id: newId(now), title, cycle, spans: [{ cycle, from: d, to: null }], done: {}, star: false, retired: null, snooze: null, created: d };
    s.tasks.push(t);
    log(s, now, { type: 'add', id: t.id, title, to: cycle });
    return t;
  }

  function findTask(s, id) { return s.tasks.find(t => t.id === id); }

  // Ticks or unticks a task for the current period. Returns what there is to say about it.
  function toggleTask(s, id, now) {
    const t = findTask(s, id);
    if (!t || t.retired) return null;
    const key = keyOf(t.cycle, today(now));
    if (t.done[key]) { delete t.done[key]; return { done: false }; }
    const wasComeback = missedRunBefore(t, now) >= 3;
    t.done[key] = now;
    const streak = streakOf(t, now);
    const cycleTasks = tasksIn(s, t.cycle);
    const cleared = cycleTasks.length > 0 && cycleTasks.every(x => isDone(x, now));
    return { done: true, streak, cleared, comeback: wasComeback, message: cheer(s, t, streak, cleared, wasComeback, now) };
  }

  const MILESTONES = {
    day: [3, 5, 7, 10, 14, 21, 30, 45, 60, 75, 100, 150, 200, 250, 300, 365, 500, 730, 1000],
    week: [2, 3, 4, 6, 8, 12, 16, 26, 39, 52, 78, 104],
    month: [2, 3, 4, 6, 9, 12, 18, 24, 36],
    quarter: [2, 3, 4, 6, 8, 12],
    half: [2, 3, 4, 6, 10],
    year: [2, 3, 4, 5, 10],
  };

  function cheer(s, t, streak, cleared, comeback, now) {
    const c = CYCLE[t.cycle];
    if (cleared) {
      const n = tasksIn(s, t.cycle).length;
      if (t.cycle === 'day') return n > 1 ? `You crushed your daily list today. All ${n} done.` : 'Daily list done. Nice work.';
      return `${c.name} list all done${n > 1 ? `: ${n} of ${n}` : ''}.`;
    }
    if (comeback) return `${t.title}: done again.`;
    if (MILESTONES[t.cycle].includes(streak)) return `${t.title}: ${streak} ${c.units} in a row.`;
    return null;
  }

  function renameTask(s, id, title, now) {
    const t = findTask(s, id); title = String(title || '').trim();
    if (!t || !title || title === t.title) return;
    log(s, now, { type: 'rename', id, title, from: t.title });
    t.title = title;
  }

  // Changing how often a task repeats closes its old span and opens a new one, so the
  // history under the old cycle stays true. A tick for the current period carries over.
  function moveTask(s, id, cycle, now, via) {
    const t = findTask(s, id);
    if (!t || t.cycle === cycle) return;
    const d = ymd(today(now));
    const wasDone = isDone(t, now);
    const span = currentSpan(t);
    if (span.from === d) t.spans.pop(); else span.to = d;
    t.spans.push({ cycle, from: d, to: null });
    log(s, now, { type: 'move', id, title: t.title, from: t.cycle, to: cycle, via });
    t.cycle = cycle;
    t.snooze = null;
    if (wasDone) t.done[keyOf(cycle, today(now))] = now;
  }

  function retireTask(s, id, now, via) {
    const t = findTask(s, id);
    if (!t || t.retired) return;
    const d = ymd(today(now));
    t.retired = d;
    currentSpan(t).to = d;
    t.star = false;
    log(s, now, { type: 'retire', id, title: t.title, from: t.cycle, via });
  }

  function restoreTask(s, id, now) {
    const t = findTask(s, id);
    if (!t || !t.retired) return;
    const d = ymd(today(now));
    t.retired = null;
    const span = currentSpan(t);
    if (span.to === d) span.to = null; else t.spans.push({ cycle: t.cycle, from: d, to: null });
    log(s, now, { type: 'restore', id, title: t.title, to: t.cycle });
  }

  function deleteTask(s, id) { s.tasks = s.tasks.filter(t => t.id !== id); }

  // "Keep it as is": no more nudges about this task for a while.
  function snoozeReflection(s, id, now) {
    const t = findTask(s, id); if (!t) return;
    const rule = RULES[t.cycle];
    let d = today(now);
    for (let i = 0; i < rule.n; i++) d = nextStart(t.cycle, d);
    t.snooze = ymd(d);
    log(s, now, { type: 'keep', id, title: t.title, to: t.cycle, via: 'reflection' });
  }

  // ---------- history ----------

  // The periods of the task's current cycle, newest first, not counting the current one.
  function pastPeriods(t, now, n) {
    const out = [];
    const from = currentSpan(t).from;
    const first = ymd(startOf(t.cycle, parse(from)));
    let d = prevStart(t.cycle, today(now));
    while (out.length < n && ymd(d) >= first) {
      out.push({ start: ymd(d), key: keyOf(t.cycle, d), done: !!t.done[keyOf(t.cycle, d)] });
      d = prevStart(t.cycle, d);
    }
    return out;
  }

  // Run of done periods ending now. An unfinished current period doesn't break it.
  function streakOf(t, now) {
    let n = isDone(t, now) ? 1 : 0;
    for (const p of pastPeriods(t, now, 100000)) { if (!p.done) break; n++; }
    return n;
  }

  function bestStreakOf(t, now) {
    let best = 0, run = 0;
    const ps = pastPeriods(t, now, 100000).reverse();
    ps.push({ done: isDone(t, now) });
    for (const p of ps) { run = p.done ? run + 1 : 0; if (run > best) best = run; }
    return best;
  }

  // Missed periods in a row immediately before the current one.
  function missedRunBefore(t, now) {
    let n = 0;
    for (const p of pastPeriods(t, now, 100000)) { if (p.done) break; n++; }
    return n;
  }

  function rateOf(t, now, n) {
    const ps = pastPeriods(t, now, n);
    if (!ps.length) return null;
    return { done: ps.filter(p => p.done).length, of: ps.length };
  }

  const total = t => Object.keys(t.done).length;

  // ---------- insight: what to say about each task ----------

  // How many recent periods to look at, and how many misses earn a gentle question.
  const RULES = {
    day: { n: 5, miss: 4 },
    week: { n: 3, miss: 2 },
    month: { n: 3, miss: 2 },
    quarter: { n: 2, miss: 2 },
    half: { n: 2, miss: 2 },
    year: { n: 1, miss: 1 },
  };

  const looser = cycle => CYCLE_IDS[CYCLE_IDS.indexOf(cycle) + 1] || null;

  function reflectionFor(t, now) {
    if (t.retired) return null;
    if (t.snooze && t.snooze > ymd(today(now))) return null;
    const rule = RULES[t.cycle];
    const ps = pastPeriods(t, now, rule.n);
    if (ps.length < rule.n) return null;
    const misses = ps.filter(p => !p.done).length;
    if (misses < rule.miss) return null;
    // Just the facts, no verdict or advice: what happened, and the longer view.
    const c = CYCLE[t.cycle];
    const done = rule.n - misses;
    const all = pastPeriods(t, now, 100000);
    const allDone = all.filter(p => p.done).length;
    const recent = rule.n === 1 ? `Not done last ${c.unit}.` : `Done ${done} of the last ${rule.n} ${c.units}.`;
    const longer = all.length > rule.n ? ` ${allDone} of ${all.length} since you added it.` : '';
    return { kind: 'reflect', id: t.id, cycle: t.cycle, misses, of: rule.n, title: t.title, text: recent + longer };
  }

  const PRAISE_MIN = { day: 3, week: 3, month: 3, quarter: 2, half: 2, year: 2 };

  function praiseFor(t, now) {
    if (t.retired) return null;
    const c = CYCLE[t.cycle];
    const streak = streakOf(t, now);
    if (streak >= PRAISE_MIN[t.cycle]) {
      const best = bestStreakOf(t, now);
      const text = best > streak ? `Longest run: ${best}.` : streak > 3 ? 'Longest run so far.' : '';
      return { kind: 'praise', id: t.id, cycle: t.cycle, score: streak, title: `${t.title}: ${streak} ${c.units} in a row`, text };
    }
    if (t.cycle === 'day') {
      const last = rateOf(t, now, 7), prev = pastPeriods(t, now, 14).slice(7);
      if (last && last.of === 7 && prev.length === 7) {
        const before = prev.filter(p => p.done).length;
        if (last.done - before >= 3) {
          return { kind: 'praise', id: t.id, cycle: 'day', score: last.done, title: `${t.title}: ${last.done} of the last 7 days`, text: `Up from ${before} the week before.` };
        }
      }
    }
    return null;
  }

  // Everything worth mentioning, questions first, at most one note per task.
  function insights(s, now, cycle) {
    const ts = cycle ? tasksIn(s, cycle) : live(s);
    const reflect = ts.map(t => reflectionFor(t, now)).filter(Boolean).sort((a, b) => b.misses / b.of - a.misses / a.of);
    const seen = new Set(reflect.map(r => r.id));
    const praise = ts.filter(t => !seen.has(t.id)).map(t => praiseFor(t, now)).filter(Boolean).sort((a, b) => b.score - a.score);
    return { reflect, praise };
  }

  // ---------- the daily picture ----------

  // Daily tasks that existed on a given day, and how many got done.
  function dayStats(s, d) {
    const end = ymd(addDays(parse(d), 1));
    const ts = s.tasks.filter(t => coversPeriod(t, 'day', d, end));
    const key = 'day:' + d;
    const doneTs = ts.map(t => t.done[key]).filter(Boolean);
    return { day: d, total: ts.length, done: doneTs.length, lastAt: doneTs.length ? Math.max(...doneTs) : null };
  }

  function firstDay(s) {
    let first = null;
    for (const t of s.tasks) for (const sp of t.spans) if (!first || sp.from < first) first = sp.from;
    return first;
  }

  // One entry per day from the first task to today.
  function dayHistory(s, now) {
    const first = firstDay(s), end = ymd(today(now));
    if (!first) return [];
    const out = [];
    for (let d = parse(first); ymd(d) <= end; d = addDays(d, 1)) out.push(dayStats(s, ymd(d)));
    return out;
  }

  const perfect = st => st.total > 0 && st.done === st.total;

  // Perfect days in a row ending today (if today is perfect) or yesterday.
  function perfectRun(s, now) {
    const h = dayHistory(s, now);
    let i = h.length - 1;
    if (i >= 0 && !perfect(h[i])) i--;
    let n = 0;
    while (i >= 0 && perfect(h[i])) { n++; i--; }
    return n;
  }

  function longestRun(arr, pred) {
    let best = 0, run = 0;
    for (const x of arr) { run = pred(x) ? run + 1 : 0; if (run > best) best = run; }
    return best;
  }

  // Share of a cycle's tasks done in the current period.
  function cycleProgress(s, cycle, now) {
    const ts = tasksIn(s, cycle);
    return { total: ts.length, done: ts.filter(t => isDone(t, now)).length };
  }

  // Completion per calendar month (daily list), plus every tick across all cycles.
  function months(s, now, count) {
    const h = dayHistory(s, now);
    const t0 = today(now);
    const out = [];
    for (let i = count - 1; i >= 0; i--) {
      const m = noon(t0.getFullYear(), t0.getMonth() - i, 1);
      const pre = `${m.getFullYear()}-${pad(m.getMonth() + 1)}`;
      const days = h.filter(x => x.day.startsWith(pre) && x.total > 0);
      const tot = days.reduce((a, x) => a + x.total, 0), dn = days.reduce((a, x) => a + x.done, 0);
      let ticks = 0;
      for (const t of s.tasks) for (const ts of Object.values(t.done)) { const dd = today(ts); if (ymd(dd).startsWith(pre)) ticks++; }
      out.push({ month: pre, label: m.toLocaleString('en-US', { month: 'short' }), rate: tot ? dn / tot : null, perfect: days.filter(perfect).length, ticks });
    }
    return out;
  }

  // Was every task in `cycle` done in some single period? (min one task)
  function everSwept(s, cycle, now) {
    const first = firstDay(s);
    if (!first) return false;
    const end = ymd(today(now));
    for (let d = startOf(cycle, parse(first)); ymd(d) <= end; d = nextStart(cycle, d)) {
      const a = ymd(d), b = ymd(nextStart(cycle, d)), k = keyOf(cycle, d);
      const ts = s.tasks.filter(t => coversPeriod(t, cycle, a, b));
      if (ts.length && ts.every(t => t.done[k])) return true;
    }
    return false;
  }

  // ---------- achievements ----------

  const ACHIEVEMENTS = [
    { id: 'first', icon: '✓', name: 'First tick', text: 'Checked off your first task.' },
    { id: 'sweep', icon: '☀︎', name: 'Clean sweep', text: 'Finished the whole daily list.' },
    { id: 'early', icon: '◐', name: 'Early bird', text: 'Daily list done before noon.' },
    { id: 'hattrick', icon: '⁂', name: 'Hat trick', text: '3 perfect days in a row.' },
    { id: 'flawless', icon: '❖', name: 'Flawless week', text: '7 perfect days in a row.' },
    { id: 'perfectmonth', icon: '✺', name: 'Perfect month', text: '30 perfect days in a row.' },
    { id: 'streak7', icon: '7', name: 'One week strong', text: 'A daily task 7 days running.' },
    { id: 'streak30', icon: '30', name: 'Habit formed', text: 'A daily task 30 days running.' },
    { id: 'streak100', icon: '100', name: 'Centurion', text: 'A daily task 100 days running.' },
    { id: 'week', icon: 'W', name: 'Week wrapped', text: 'Every weekly task done in one week.' },
    { id: 'month', icon: 'M', name: 'Month in order', text: 'Every monthly task done in one month.' },
    { id: 'quarter', icon: 'Q', name: 'Quarter squared', text: 'Every quarterly task done in one quarter.' },
    { id: 'year', icon: 'Y', name: 'Year in the books', text: 'Every yearly task done in one year.' },
    { id: 'comeback', icon: '↺', name: 'Comeback', text: 'Picked a task back up after missing it 3 times.' },
    { id: 'honest', icon: '◇', name: 'Honest look', text: 'Changed a task from a check-in.' },
    { id: 'ticks100', icon: '♦', name: '100 ticks', text: '100 tasks checked off.' },
    { id: 'ticks1000', icon: '♛', name: '1,000 ticks', text: '1,000 tasks checked off.' },
    { id: 'errands', icon: '🛒', name: 'Errand runner', text: '25 things crossed off your lists.' },
  ];

  function hadComeback(t, now) {
    for (const sp of t.spans) {
      let d = startOf(sp.cycle, parse(sp.from)), missed = 0;
      const end = sp.to || '9999';
      while (ymd(d) < end && ymd(d) <= ymd(today(now))) {
        if (t.done[keyOf(sp.cycle, d)]) { if (missed >= 3) return true; missed = 0; } else missed++;
        d = nextStart(sp.cycle, d);
        if (missed > 100000) break;
      }
    }
    return false;
  }

  function earned(s, now) {
    const h = dayHistory(s, now);
    const ticks = s.tasks.reduce((a, t) => a + total(t), 0);
    const dailyBest = Math.max(0, ...s.tasks.filter(t => t.spans.some(sp => sp.cycle === 'day')).map(t => {
      // best run of consecutive ticked days across the task's daily spans
      let best = 0;
      for (const sp of t.spans.filter(sp => sp.cycle === 'day')) {
        let run = 0;
        const end = sp.to || ymd(addDays(today(now), 1));
        for (let d = parse(sp.from); ymd(d) < end; d = addDays(d, 1)) { run = t.done['day:' + ymd(d)] ? run + 1 : 0; if (run > best) best = run; }
      }
      return best;
    }));
    const perfectBest = longestRun(h, perfect);
    return {
      first: ticks > 0,
      sweep: perfectBest >= 1,
      early: h.some(x => perfect(x) && new Date(x.lastAt).getHours() < 12 && new Date(x.lastAt).getHours() >= DAY_STARTS_AT),
      hattrick: perfectBest >= 3,
      flawless: perfectBest >= 7,
      perfectmonth: perfectBest >= 30,
      streak7: dailyBest >= 7,
      streak30: dailyBest >= 30,
      streak100: dailyBest >= 100,
      week: everSwept(s, 'week', now),
      month: everSwept(s, 'month', now),
      quarter: everSwept(s, 'quarter', now),
      year: everSwept(s, 'year', now),
      comeback: s.tasks.some(t => hadComeback(t, now)),
      honest: s.events.some(e => e.via === 'reflection' && e.type !== 'keep'),
      ticks100: ticks >= 100,
      ticks1000: ticks >= 1000,
      errands: s.counters.itemsChecked >= 25,
    };
  }

  // Records newly earned achievements; returns them so the app can celebrate.
  function unlock(s, now) {
    const got = earned(s, now), fresh = [];
    for (const a of ACHIEVEMENTS) if (got[a.id] && !s.unlocked[a.id]) { s.unlocked[a.id] = ymd(today(now)); fresh.push(a); }
    return fresh;
  }

  // ---------- free lists ----------

  const findList = (s, id) => s.lists.find(l => l.id === id);

  function addList(s, name, icon, now) {
    name = String(name || '').trim();
    if (!name) return null;
    const l = { id: newId(now), name, icon: icon || '📝', items: [] };
    s.lists.push(l);
    return l;
  }

  function addItem(s, listId, title, now) {
    const l = findList(s, listId); title = String(title || '').trim();
    if (!l || !title) return null;
    const it = { id: newId(now), title, note: '', done: false, doneAt: null, created: now };
    l.items.push(it);
    return it;
  }

  function toggleItem(s, listId, itemId, now) {
    const l = findList(s, listId); const it = l && l.items.find(i => i.id === itemId);
    if (!it) return;
    it.done = !it.done; it.doneAt = it.done ? now : null;
    if (it.done) s.counters.itemsChecked++;
  }

  function clearDone(s, listId) { const l = findList(s, listId); if (l) l.items = l.items.filter(i => !i.done); }

  // Brain dump -> a repeating task. The item leaves the list.
  function itemToTask(s, listId, itemId, cycle, now) {
    const l = findList(s, listId); const it = l && l.items.find(i => i.id === itemId);
    if (!it) return null;
    l.items = l.items.filter(i => i !== it);
    return addTask(s, it.title, cycle, now);
  }

  function moveItem(s, fromId, itemId, toId) {
    const a = findList(s, fromId), b = findList(s, toId);
    const it = a && a.items.find(i => i.id === itemId);
    if (!it || !b || a === b) return;
    a.items = a.items.filter(i => i !== it);
    b.items.push(it);
  }

  // ---------- the three daily reminders ----------

  // Which reminder a push is: with the phone's own times, the one that came due most recently
  // (pushes carry nothing, so the time they arrive is all there is to go on).
  function slotFor(now, times) {
    const d = new Date(now), m = d.getHours() * 60 + d.getMinutes();
    if (times) {
      const mins = k => { const [h, mm] = String(times[k] || '').split(':').map(Number); return h * 60 + (mm || 0); };
      const due = ['morning', 'midday', 'evening'].filter(k => Number.isFinite(mins(k)) && mins(k) <= m + 5);
      if (due.length) return due.reduce((a, b) => (mins(b) > mins(a) ? b : a));
      return 'evening'; // after midnight, before the morning one
    }
    const h = d.getHours();
    return h >= DAY_STARTS_AT && h < 11 ? 'morning' : h >= 11 && h < 15 ? 'midday' : 'evening';
  }

  function names(ts, max) {
    const ordered = [...ts.filter(t => t.star), ...ts.filter(t => !t.star)];
    const shown = ordered.slice(0, max).map(t => t.title);
    const more = ordered.length - shown.length;
    return shown.join(', ') + (more > 0 ? ` +${more} more` : '');
  }

  // What a reminder says, written from the lists themselves.
  function brief(s, slot, now) {
    const day = tasksIn(s, 'day');
    const left = day.filter(t => !isDone(t, now));
    const done = day.length - left.length;
    const stars = live(s).filter(t => t.star && !isDone(t, now));
    const t0 = today(now);
    const lines = [];

    const others = ['week', 'month', 'quarter', 'half', 'year'].map(c => {
      const ts = tasksIn(s, c), l = ts.filter(t => !isDone(t, now));
      return { c, ts, left: l, daysLeft: daysLeft(c, now), fresh: ymd(startOf(c, t0)) === ymd(t0) };
    }).filter(o => o.ts.length);

    if (slot === 'morning') {
      const title = day.length ? `Good morning · ${left.length || 'nothing'} on today's list` : 'Good morning';
      if (left.length) lines.push(names(left, 4) + '.');
      else if (day.length) lines.push('Today\'s list is already done.');
      const extraStars = stars.filter(t => t.cycle !== 'day');
      if (extraStars.length) lines.push(`Priority: ${names(extraStars, 2)}.`);
      for (const o of others) {
        if (o.fresh && o.left.length) lines.push(`New ${CYCLE[o.c].unit}: ${o.left.length} ${CYCLE[o.c].adj} task${o.left.length > 1 ? 's' : ''}.`);
        else if (o.daysLeft === 1 && o.left.length) lines.push(`Last day of the ${CYCLE[o.c].unit}: ${names(o.left, 2)}.`);
      }
      if (!lines.length) lines.push('Nothing scheduled. A clear day.');
      return { title, body: lines.join(' '), slot };
    }

    if (slot === 'midday') {
      if (!day.length) return { title: 'Midday check-in', body: summaryOfOthers(others) || 'Nothing on the lists right now.', slot };
      if (!left.length) return { title: 'Midday check-in · all done', body: `All ${day.length} done already.`, slot };
      return { title: `Midday check-in · ${done} of ${day.length} done`, body: `Still to go: ${names(left, 4)}.`, slot };
    }

    // evening
    if (day.length && !left.length) {
      const o = others.find(o => o.left.length && o.daysLeft <= 2);
      return { title: 'All done today', body: 'Everything on the daily list is done. Rest easy.' + (o ? ` (${o.left.length} ${CYCLE[o.c].adj} left, ${o.daysLeft === 1 ? 'ends today' : 'ends tomorrow'}.)` : ''), slot };
    }
    if (day.length) lines.push(`${left.length} left: ${names(left, 3)}. Anything you can knock out before you call it a day?`);
    const ending = others.filter(o => o.left.length && o.daysLeft <= 2);
    for (const o of ending) lines.push(`${CYCLE[o.c].name} ${o.daysLeft === 1 ? 'ends today' : 'ends tomorrow'}: ${names(o.left, 2)}.`);
    if (!lines.length) lines.push(summaryOfOthers(others) || 'Nothing left. Have a good evening.');
    return { title: 'Winding down', body: lines.join(' '), slot };
  }

  function summaryOfOthers(others) {
    const o = others.filter(o => o.left.length);
    return o.map(o => `${o.left.length} ${CYCLE[o.c].adj}`).join(', ') + (o.length ? ' still open.' : '');
  }

  root.Core = {
    CYCLES, CYCLE, CYCLE_IDS, RULES, MILESTONES, ACHIEVEMENTS, DAY_STARTS_AT,
    ymd, parse, addDays, today, startOf, nextStart, prevStart, keyOf, daysLeft, daysBetween,
    emptyState, normalize, newId, live, tasksIn, isDone, findTask, looser,
    addTask, toggleTask, renameTask, moveTask, retireTask, restoreTask, deleteTask, snoozeReflection,
    pastPeriods, streakOf, bestStreakOf, rateOf, total, missedRunBefore,
    reflectionFor, praiseFor, insights,
    dayStats, dayHistory, perfectRun, cycleProgress, months, everSwept,
    earned, unlock,
    findList, addList, addItem, toggleItem, clearDone, itemToTask, moveItem,
    slotFor, brief,
  };
})(typeof self !== 'undefined' ? self : globalThis);

import './core.js';
import { load, save, mirror, loadUI, saveUI, requestPersistence, deliverFile } from './store.js';
import * as Push from './push.js';
import * as Backup from './backup.js';

const C = globalThis.Core;
let S = load();
const ui = { tab: 'cycles', listId: null, ...loadUI() };
if (!C.CYCLE[ui.cycle]) ui.cycle = 'day';
const app = document.getElementById('app');
const sheet = document.getElementById('sheet');
const sheetBody = sheet.querySelector('.sheet-body');
const now = () => Date.now();

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const cvar = cy => `--c: var(--${cy})`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function commit() { save(S); }

// ---------- shell ----------

const ICONS = {
  cycles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  lists: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 6.5h10M9 12h10M9 17.5h10"/><circle cx="5" cy="6.5" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="17.5" r="1"/></svg>',
  progress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 19V13M10 19V8M15 19v-4M20 19V5"/></svg>',
  gearTab: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  gear: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  dots: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
};

function shell() {
  app.innerHTML = `
    <section class="view" data-view="cycles">
      <header class="head"><h1 id="cycle-title">Daily</h1></header>
      <nav class="strip">${C.CYCLES.map(c => `<button data-act="goto" data-cy="${c.id}" style="${cvar(c.id)}">${c.tab}<span class="dot hidden"></span></button>`).join('')}</nav>
      <div class="pager">${C.CYCLES.map(c => `<section class="page" data-cy="${c.id}" style="${cvar(c.id)}"></section>`).join('')}</div>
    </section>
    <section class="view hidden" data-view="lists"></section>
    <section class="view hidden" data-view="progress"></section>
    <section class="view hidden" data-view="settings"></section>
    <nav class="tabs"><div class="inner">
      <button data-act="tab" data-tab="cycles">${ICONS.cycles}Recurring</button>
      <button data-act="tab" data-tab="lists">${ICONS.lists}Lists</button>
      <button data-act="tab" data-tab="progress">${ICONS.progress}Progress</button>
      <button data-act="tab" data-tab="settings">${ICONS.gearTab}Settings</button>
    </div></nav>`;
  const pager = app.querySelector('.pager');
  let raf = 0;
  pager.addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const i = Math.round(pager.scrollLeft / pager.clientWidth);
      const cy = C.CYCLE_IDS[Math.max(0, Math.min(5, i))];
      if (cy !== ui.cycle) { ui.cycle = cy; saveUI(ui); paintStrip(); }
    });
  }, { passive: true });
}

function paintStrip() {
  const n = now();
  app.querySelector('#cycle-title').textContent = C.CYCLE[ui.cycle].name;
  app.querySelector('[data-view="cycles"]').style.setProperty('--c', `var(--${ui.cycle})`);
  for (const b of app.querySelectorAll('.strip button')) {
    b.classList.toggle('on', b.dataset.cy === ui.cycle);
    const p = C.cycleProgress(S, b.dataset.cy, n);
    b.querySelector('.dot').classList.toggle('hidden', !(p.total && p.done < p.total && b.dataset.cy !== 'day' && C.daysLeft(b.dataset.cy, n) <= 2));
  }
  const on = app.querySelector('.strip button.on');
  on?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function goto(cy, smooth = true) {
  ui.cycle = cy; saveUI(ui);
  const pager = app.querySelector('.pager');
  pager.scrollTo({ left: C.CYCLE_IDS.indexOf(cy) * pager.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
  paintStrip();
}

function setTab(tab) {
  ui.tab = tab;
  for (const v of app.querySelectorAll('.view')) v.classList.toggle('hidden', v.dataset.view !== tab);
  for (const b of app.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === tab);
  render();
  if (tab === 'cycles') goto(ui.cycle, false);
}

function render() {
  if (ui.tab === 'cycles') { for (const c of C.CYCLE_IDS) renderPage(c); paintStrip(); }
  if (ui.tab === 'lists') renderLists();
  if (ui.tab === 'progress') renderProgress();
  if (ui.tab === 'settings') renderSettings();
}

// ---------- repeating lists ----------

const SUGGEST = {
  day: ['Make the bed', 'Dishes', 'Laundry', 'Walk 20 minutes', 'Read 10 pages', 'Tidy up'],
  week: ['Vacuum', 'Groceries', 'Meal prep', 'Water plants', 'Take out trash', 'Plan the week'],
  month: ['Pay bills', 'Change the sheets', 'Clean the fridge', 'Check the budget', 'Deep clean bathroom'],
  quarter: ['Change HVAC filter', 'Review subscriptions', 'Haircut', 'Declutter a closet'],
  half: ['Dentist', 'Rotate tires', 'Smoke alarm batteries', 'Clean gutters'],
  year: ['Physical', 'Taxes', 'Renew car registration', 'Back up photos', 'Flu shot'],
};
const EMPTY = {
  day: 'What do you want to do every day?',
  week: 'What needs to happen once a week?',
  month: 'What only needs doing once a month?',
  quarter: 'Every three months or so.',
  half: 'Twice a year: spring and fall jobs.',
  year: 'Once a year, so it never sneaks up on you.',
};

function periodLine(cy, n) {
  const d = C.today(n), left = C.daysLeft(cy, n);
  const fmt = (x, o) => x.toLocaleDateString('en-US', o);
  const tail = left === 1 ? 'ends today' : `${left} days left`;
  switch (cy) {
    case 'day': return `<b>${fmt(d, { weekday: 'long' })}</b> ${fmt(d, { month: 'long', day: 'numeric' })}`;
    case 'week': return `<b>Week of ${fmt(C.startOf('week', d), { month: 'short', day: 'numeric' })}</b> ${tail}`;
    case 'month': return `<b>${fmt(d, { month: 'long' })}</b> ${tail}`;
    case 'quarter': { const s = C.startOf('quarter', d); const e = C.addDays(C.nextStart('quarter', d), -1); return `<b>${fmt(s, { month: 'short' })}–${fmt(e, { month: 'short' })}</b> ${tail}`; }
    case 'half': return `<b>${d.getMonth() < 6 ? 'Jan–Jun' : 'Jul–Dec'} ${d.getFullYear()}</b> ${tail}`;
    case 'year': return `<b>${d.getFullYear()}</b> ${tail}`;
  }
}

function taskRow(t, n) {
  const done = C.isDone(t, n), st = C.streakOf(t, n);
  const meta = st >= 2 ? `<span class="meta${st >= 7 || (t.cycle !== 'day' && st >= 3) ? ' hot' : ''}" >${st} in a row</span>` : '';
  return `<li class="row${done ? ' is-done' : ''}" data-id="${t.id}">
    <button class="check" data-act="tick" aria-label="${done ? 'Mark not done' : 'Mark done'}"></button>
    <button class="label" data-act="edit-task"><span class="t">${esc(t.title)}</span>${t.star ? '<span class="star">★</span>' : ''}</button>${meta}</li>`;
}

function noteCard(x) {
  if (x.kind === 'reflect') {
    return `<div class="note" style="${cvar(x.cycle)}" data-id="${x.id}">
      <h3>${esc(x.title)}</h3><p>${esc(x.text)}</p>
      <div class="recent">${dotsFor(C.findTask(S, x.id), now(), Math.min(x.of + 1, 14))}</div>
      <div class="acts">
        <button data-act="r-keep">Noted</button>
        <button data-act="r-adjust">Adjust</button>
      </div></div>`;
  }
  return `<div class="note praise" data-id="${x.id}" data-key="${esc(x.title)}"><button class="x" data-act="dismiss" aria-label="Dismiss">×</button><h3>${esc(x.title)}</h3>${x.text ? `<p>${esc(x.text)}</p>` : ''}</div>`;
}

const dismissKey = x => `${x.kind}:${x.id}:${x.title}`;
function visibleNotes(list) { return list.filter(x => !ui.dismissed[dismissKey(x)]); }

function renderPage(cy) {
  const page = app.querySelector(`.page[data-cy="${cy}"]`);
  const n = now(), c = C.CYCLE[cy];
  const ts = C.tasksIn(S, cy);
  const active = ts.filter(t => !C.isDone(t, n)).sort((a, b) => b.star - a.star);
  const done = ts.filter(t => C.isDone(t, n)).sort((a, b) => a.done[C.keyOf(cy, C.today(n))] - b.done[C.keyOf(cy, C.today(n))]);
  const pct = ts.length ? Math.round(done.length / ts.length * 100) : 0;
  const ins = C.insights(S, n, cy);
  const note = visibleNotes(ins.reflect)[0] || visibleNotes(ins.praise)[0];
  const keepFocus = document.activeElement?.closest?.(`.page[data-cy="${cy}"] .add input`);
  const draft = keepFocus ? document.activeElement.value : '';

  let html = `<div class="period">${periodLine(cy, n)}${ts.length ? `<span class="count">${done.length} of ${ts.length}</span>` : ''}</div>`;
  html += `<div class="bar"><i style="width:${pct}%"></i></div>`;
  if (ts.length && !active.length) {
    html += `<div class="banner"><span class="big">${cy === 'day' ? '☀︎' : '✓'}</span><div><b>${cy === 'day' ? 'You crushed your daily list today.' : `${c.name} list: all done.`}</b><p>${cy === 'day' ? 'Everything\'s done. Nice work, enjoy the rest of the day.' : 'Nothing left until it resets.'}</p></div></div>`;
  }
  if (note) html += noteCard(note);
  const ideas = SUGGEST[cy].filter(x => !ts.some(t => t.title.toLowerCase() === x.toLowerCase()));
  const chips = `<div class="chips">${ideas.map(s => `<button class="chip" data-act="suggest" data-title="${esc(s)}">${esc(s)}</button>`).join('')}</div>`;
  if (!ts.length) html += `<div class="empty"><b>${esc(EMPTY[cy])}</b>Type below, or start with one of these.</div>${chips}<div style="height:14px"></div>`;
  html += `<ul class="items card">${active.map(t => taskRow(t, n)).join('')}
    <li><form class="add${active.length ? '' : ' first'}" data-cy="${cy}"><span class="plus">+</span><input name="t" placeholder="Add a ${esc(c.adj)} task" autocomplete="off" enterkeyhint="done"></form></li></ul>`;
  if (ts.length && ts.length < 3 && ideas.length) html += `<div class="section-label">Ideas</div>${chips.replace('class="chips"', 'class="chips" style="justify-content:flex-start;padding-top:0"')}`;
  if (done.length) {
    html += `<div class="section-label">Done · ${done.length}</div><ul class="items card done-list">${done.map(t => taskRow(t, n)).join('')}</ul>`;
  }
  page.innerHTML = html;
  if (keepFocus) { const i = page.querySelector('.add input'); i.value = draft; i.focus(); }
}

// ---------- ticking ----------

function tick(row, kind) {
  const id = row.dataset.id;
  if (row.classList.contains('ticking')) return;
  if (kind === 'task') {
    const r = C.toggleTask(S, id, now());
    if (!r) return;
    commit();
    afterTick(r);
    const cy = C.findTask(S, id).cycle;
    if (r.done) { animateOut(row, () => renderPage(cy)); } else renderPage(cy);
    paintStrip();
  } else {
    const it = C.findList(S, ui.listId).items.find(i => i.id === id);
    C.toggleItem(S, ui.listId, id, now());
    commit();
    const fresh = C.unlock(S, now()); if (fresh.length) { commit(); toast(`Achievement unlocked: ${fresh.map(a => a.name).join(', ')}`); }
    if (it.done) animateOut(row, renderLists); else renderLists();
  }
}

function animateOut(row, then) {
  row.classList.add('ticking');
  setTimeout(() => { row.classList.add('leaving'); setTimeout(then, 300); }, 380);
}

function afterTick(r) {
  if (r.done && r.message) toast(r.message);
  if (r.done && r.cleared) confetti();
  const fresh = C.unlock(S, now());
  if (fresh.length) { commit(); toast(`Achievement${fresh.length > 1 ? 's' : ''} unlocked: ${fresh.map(a => a.name).join(', ')}`); }
}

// ---------- toast + confetti ----------

const toastQ = [];
let toastBusy = false;
function toast(msg) {
  toastQ.push(msg);
  while (toastQ.length > 2) toastQ.shift();
  if (!toastBusy) nextToast();
}
function nextToast() {
  const msg = toastQ.shift();
  if (!msg) { toastBusy = false; return; }
  toastBusy = true;
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(nextToast, 250); }, 2300);
}
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div');
  box.className = 'confetti';
  const cols = ['--day', '--week', '--month', '--quarter', '--half', '--year'];
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + '%';
    p.style.background = `var(${cols[i % 6]})`;
    p.style.animationDelay = Math.random() * .4 + 's';
    p.style.animationDuration = 1.2 + Math.random() * .9 + 's';
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 2600);
}

// ---------- sheets ----------

function openSheet(html, onClose) {
  sheetBody.innerHTML = `<div class="grab"></div>${html}`;
  sheet.classList.remove('hidden');
  sheet._onClose = onClose;
}
function closeSheet() {
  if (sheet.classList.contains('hidden')) return;
  const f = sheet._onClose; sheet._onClose = null;
  f?.();
  sheet.classList.add('hidden');
  sheetBody.innerHTML = '';
  render();
}
sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });

function dotsFor(t, n, count) {
  const ps = C.pastPeriods(t, n, count - 1).reverse();
  return `<span class="dots">${ps.map(p => `<i class="${p.done ? 'y' : ''}"></i>`).join('')}<i class="${C.isDone(t, n) ? 'y' : ''}" style="outline:1px solid var(--c);outline-offset:1px"></i></span>`;
}

function taskSheet(id, mode) {
  const t = C.findTask(S, id), n = now();
  if (!t) return;
  const c = C.CYCLE[t.cycle];
  const rate = C.rateOf(t, n, t.cycle === 'day' ? 30 : 12);
  // Opened from a check-in: whatever gets changed here counts as the answer to it.
  const fromCheckIn = mode === 'check-in';
  const opened = S.events.length;
  openSheet(`<div style="${cvar(t.cycle)}" data-id="${t.id}">
    <input class="field" id="f-title" value="${esc(t.title)}" autocomplete="off" enterkeyhint="done">
    <div class="btns" style="margin-top:10px"><button class="toggle-row" data-act="star"><span>Priority</span><span class="star" style="font-size:18px">${t.star ? '★' : '☆'}</span></button></div>
    <div class="lbl">Repeats</div>
    <div class="seg">${C.CYCLES.map(x => `<button data-act="set-cycle" data-cy="${x.id}" class="${x.id === t.cycle ? 'on' : ''}" style="${cvar(x.id)}">${x.name}</button>`).join('')}</div>
    <div class="lbl">How it's going</div>
    <div class="card" style="padding:12px 14px">
      <div class="kv"><span>Recent ${c.units}</span>${dotsFor(t, n, 14)}</div>
      <div class="kv"><span>Current run</span><b>${plural(C.streakOf(t, n), c.unit)}</b></div>
      <div class="kv"><span>Best run</span><b>${plural(C.bestStreakOf(t, n), c.unit)}</b></div>
      <div class="kv"><span>Hit rate</span><b>${rate ? `${rate.done} of last ${rate.of}` : 'too soon to tell'}</b></div>
      <div class="kv"><span>Done all-time</span><b>${C.total(t)}</b></div>
    </div>
    <div class="btns">
      <button class="btn pri" data-act="close">Done</button>
      <button class="btn" data-act="retire">Let it go</button>
      <button class="btn danger hold" data-hold="delete-task">Hold to delete forever</button>
    </div></div>`, () => {
    const v = sheetBody.querySelector('#f-title')?.value;
    C.renameTask(S, id, v, now());
    if (fromCheckIn && S.events.length > opened) {
      for (const e of S.events.slice(opened)) e.via = 'reflection';
      C.snoozeReflection(S, id, now()); C.unlock(S, now());
    }
    commit();
  });
}

function itemSheet(itemId) {
  const l = C.findList(S, ui.listId), it = l.items.find(i => i.id === itemId);
  if (!it) return;
  const others = S.lists.filter(x => x.id !== l.id);
  openSheet(`<div data-item="${it.id}">
    <input class="field" id="f-title" value="${esc(it.title)}" autocomplete="off">
    <div class="lbl">Note</div>
    <textarea class="field" id="f-note" placeholder="Size, link, who it's for…">${esc(it.note)}</textarea>
    <div class="lbl">Make it repeat</div>
    <div class="seg">${C.CYCLES.map(x => `<button data-act="item-repeat" data-cy="${x.id}" style="${cvar(x.id)}">${x.name}</button>`).join('')}</div>
    ${others.length ? `<div class="lbl">Move to</div><div class="chips" style="justify-content:flex-start;padding:0">${others.map(o => `<button class="chip" data-act="item-move" data-to="${o.id}">${o.icon ? listIcon(o) + ' ' : ''}${esc(o.name)}</button>`).join('')}</div>` : ''}
    <div class="btns">
      <button class="btn pri" data-act="close">Done</button>
      <button class="btn danger" data-act="item-delete">Delete</button>
    </div></div>`, () => {
    const t = sheetBody.querySelector('#f-title'), no = sheetBody.querySelector('#f-note');
    const cur = C.findList(S, ui.listId)?.items.find(i => i.id === itemId);
    if (cur && t) { cur.title = t.value.trim() || cur.title; cur.note = no.value.trim(); commit(); }
  });
}

// A list's icon is an emoji, a colour dot ('dot:<colour>') or nothing ('').
const DOTS = { orange: 'day', green: 'week', blue: 'month', purple: 'quarter', pink: 'half', gold: 'year' };
function listIcon(l) {
  if (!l.icon) return '';
  if (l.icon.startsWith('dot:')) return `<i class="ldot" style="background:var(--${DOTS[l.icon.slice(4)] || 'muted'})"></i>`;
  return esc(l.icon);
}
const EMOJI = ['📝', '💭', '🛒', '🎁', '🎄', '🎂', '🏠', '🔧', '📚', '🎬', '✈️', '🍳', '💊', '💼', '🌱', '🐾', '💡', '⭐️'];
function listSheet(id) {
  const l = id ? C.findList(S, id) : null;
  let icon = l ? l.icon : '📝';
  openSheet(`<h2>${l ? 'List' : 'New list'}</h2>
    <input class="field" id="f-name" value="${esc(l ? l.name : '')}" placeholder="Name it: Christmas, Hardware store…" autocomplete="off">
    <div class="lbl">Icon</div>
    <div class="emojis">
      <button data-act="pick-emoji" data-e="" class="none${icon ? '' : ' on'}" aria-label="No icon"></button>
      ${Object.entries(DOTS).map(([k, v]) => `<button data-act="pick-emoji" data-e="dot:${k}" class="${icon === 'dot:' + k ? 'on' : ''}" aria-label="${k}"><i class="ldot" style="background:var(--${v})"></i></button>`).join('')}
    </div>
    <div class="emojis" style="margin-top:6px">${EMOJI.map(e => `<button data-act="pick-emoji" data-e="${e}" class="${e === icon ? 'on' : ''}">${e}</button>`).join('')}</div>
    <div class="btns">
      <button class="btn pri" data-act="list-save">${l ? 'Done' : 'Create list'}</button>
      ${l ? '<button class="btn danger hold" data-hold="list-delete">Hold to delete this list</button>' : ''}
    </div>`);
  sheet._emoji = icon;
  sheet._listId = id;
  if (!l) setTimeout(() => sheetBody.querySelector('#f-name').focus(), 50);
}

// ---------- free lists ----------

function renderLists() {
  const v = app.querySelector('[data-view="lists"]');
  if (ui.listId && !C.findList(S, ui.listId)) ui.listId = null;
  if (!ui.listId) {
    v.style.removeProperty('--c');
    v.innerHTML = `<header class="head"><h1>Lists</h1></header>
      <div class="scroll"><p class="muted" style="margin:4px 4px 14px">Lists with no schedule: brain dumps, groceries, wish lists.</p>
      ${S.lists.length ? `<div class="card lists">${S.lists.map(l => {
        const open = l.items.filter(i => !i.done).length;
        return `<button class="list-row" data-act="open-list" data-id="${l.id}">${l.icon ? `<span class="ic">${listIcon(l)}</span>` : ''}<span class="nm">${esc(l.name)}</span><span class="ct">${open || ''}</span><span class="chev">›</span></button>`;
      }).join('')}</div>` : '<div class="empty"><b>Nothing here yet.</b>Start a list for whatever is on your mind.</div>'}
      <button class="btn pri new-list" data-act="new-list">+ New list</button></div>`;
    return;
  }
  const l = C.findList(S, ui.listId);
  const tint = l.icon?.startsWith('dot:') ? DOTS[l.icon.slice(4)] || 'month' : 'month';
  v.style.setProperty('--c', `var(--${tint})`);
  const active = l.items.filter(i => !i.done), done = l.items.filter(i => i.done).sort((a, b) => a.doneAt - b.doneAt);
  const keepFocus = document.activeElement?.closest?.('[data-view="lists"] .add input');
  const row = it => `<li class="row${it.done ? ' is-done' : ''}" data-id="${it.id}"><button class="check" data-act="tick-item" aria-label="Done"></button>
    <button class="label" data-act="edit-item"><span><span class="t">${esc(it.title)}</span>${it.note ? `<span class="note-line">${esc(it.note)}</span>` : ''}</span></button></li>`;
  v.innerHTML = `<header class="head" style="flex-direction:column;align-items:stretch;gap:4px">
      <div style="display:flex;justify-content:space-between;align-items:center"><button class="back" data-act="lists-home">‹ Lists</button><button class="icon-btn" data-act="edit-list" aria-label="List options">${ICONS.dots}</button></div>
      <h1>${l.icon ? listIcon(l) + ' ' : ''}${esc(l.name)}</h1></header>
    <div class="scroll" style="${cvar(tint)}">
      ${!l.items.length ? '<div class="empty"><b>Nothing on it yet.</b>Tap an item later to make it recurring or move it to another list.</div><div style="height:12px"></div>' : ''}
      <ul class="items card">${active.map(row).join('')}<li><form class="add${active.length ? '' : ' first'}" data-list="${l.id}"><span class="plus">+</span><input name="t" placeholder="Add an item" autocomplete="off" enterkeyhint="done"></form></li></ul>
      ${done.length ? `<div class="section-label">Done · ${done.length}<button data-act="clear-done">Clear</button></div><ul class="items card done-list">${done.map(row).join('')}</ul>` : ''}
    </div>`;
  if (keepFocus) v.querySelector('.add input').focus();
}

// ---------- progress ----------

function ringSVG(frac, cy) {
  const r = 40, c = 2 * Math.PI * r;
  return `<svg viewBox="0 0 92 92"><circle cx="46" cy="46" r="${r}" fill="none" stroke="var(--soft)" stroke-width="8"/>
    <circle cx="46" cy="46" r="${r}" fill="none" stroke="var(--${cy})" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - frac)}" style="transition:stroke-dashoffset .6s"/></svg>`;
}

function heatmap(n) {
  const weeks = 26;
  const start = C.addDays(C.startOf('week', C.today(n)), -7 * (weeks - 1));
  const todayY = C.ymd(C.today(n));
  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = C.ymd(C.addDays(start, i));
    if (d > todayY) { cells.push('<i class="f"></i>'); continue; }
    const st = C.dayStats(S, d);
    if (!st.total) { cells.push(`<i title="${d}"></i>`); continue; }
    const f = st.done / st.total;
    cells.push(`<i title="${d}: ${st.done}/${st.total}" style="background:color-mix(in srgb, var(--day) ${Math.round(15 + f * 85)}%, var(--soft))${f === 1 ? ';box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--day) 60%,#000)' : ''}"></i>`);
  }
  return `<div class="heat">${cells.join('')}</div>`;
}

function evolution() {
  const evs = S.events.filter(e => e.type !== 'keep').slice(-40).reverse();
  if (!evs.length) return '<p class="muted" style="padding:6px 0">Changes to your lists show up here over time.</p>';
  let out = '', month = '';
  for (const e of evs) {
    const m = new Date(e.t).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (m !== month) { out += `<div class="tl-month">${m}</div>`; month = m; }
    const t = `<b>${esc(e.title)}</b>`;
    const line = {
      add: `Added ${t} as ${C.CYCLE[e.to]?.adj}`,
      move: `${t} went from ${C.CYCLE[e.from]?.adj} to ${C.CYCLE[e.to]?.adj}`,
      retire: `Let go of ${t}`,
      restore: `Brought back ${t}`,
      rename: `${esc(e.from)} became ${t}`,
    }[e.type];
    if (line) out += `<div class="tl" style="${cvar(e.to || e.from || 'day')}">${line}</div>`;
  }
  return out;
}

function renderProgress() {
  const v = app.querySelector('[data-view="progress"]');
  const n = now();
  const day = C.cycleProgress(S, 'day', n);
  const run = C.perfectRun(S, n);
  const hist = C.dayHistory(S, n);
  const perfectDays = hist.filter(x => x.total && x.done === x.total).length;
  const ticks = S.tasks.reduce((a, t) => a + C.total(t), 0);
  const ins = C.insights(S, n);
  const notes = [...visibleNotes(ins.reflect), ...visibleNotes(ins.praise).slice(0, 3)];
  const months = C.months(S, n, 12);
  const live = C.live(S), retired = S.tasks.filter(t => t.retired);

  const others = ['week', 'month', 'quarter', 'half', 'year'].map(cy => ({ cy, ...C.cycleProgress(S, cy, n) })).filter(x => x.total);

  v.innerHTML = `<header class="head"><h1>Progress</h1></header>
  <div class="scroll">
    <div class="card hero">
      <div class="ring">${ringSVG(day.total ? day.done / day.total : 0, 'day')}<div class="lbl"><div>${day.done}/${day.total}<small>today</small></div></div></div>
      <div class="hero-text"><h2>${!day.total ? 'Add a daily task to start' : day.done === day.total ? 'Today: all done' : `${day.total - day.done} left today`}</h2>
        <div class="mini">${others.map(o => `<span>${C.CYCLE[o.cy].tab}</span><span class="b" style="${cvar(o.cy)}"><i style="width:${o.done / o.total * 100}%"></i></span><span>${o.done}/${o.total}</span>`).join('') || '<span class="muted" style="grid-column:1/-1">Weekly, monthly and longer lists show here.</span>'}</div>
      </div>
    </div>
    <div class="stats3">
      <div class="card stat"><b>${run}</b><span>perfect days in a row</span></div>
      <div class="card stat"><b>${perfectDays}</b><span>perfect days total</span></div>
      <div class="card stat"><b>${ticks}</b><span>things done</span></div>
    </div>

    ${notes.length ? `<div class="section-label">What I'm noticing</div>${notes.map(noteCard).join('')}` : ''}

    <div class="section-label">Your daily list, last 6 months</div>
    <div class="card heat-wrap">${heatmap(n)}<div class="heat-legend"><span>${C.addDays(C.today(n), -7 * 25).toLocaleDateString('en-US', { month: 'short' })}</span><span>Each square is a day · darker = more done</span><span>Now</span></div></div>

    <div class="section-label">Month by month</div>
    <div class="card"><div class="months">${months.map(m => `<div class="m" title="${m.rate == null ? 'no daily tasks' : Math.round(m.rate * 100) + '% of daily tasks · ' + m.ticks + ' done'}"><i class="${m.rate == null ? 'none' : ''}" style="height:${m.rate == null ? 2 : Math.max(4, m.rate * 80)}px"></i><span>${m.label}</span></div>`).join('')}</div></div>

    ${live.length ? `<div class="section-label">Every task</div><div class="card">${C.CYCLE_IDS.flatMap(cy => C.tasksIn(S, cy)).map(t => {
      const c = C.CYCLE[t.cycle], r = C.rateOf(t, n, t.cycle === 'day' ? 30 : 12), st = C.streakOf(t, n), best = C.bestStreakOf(t, n);
      return `<div class="habit" style="${cvar(t.cycle)}" data-id="${t.id}"><div class="hn"><div>${esc(t.title)}</div><small>${c.adj} · ${st} in a row · best ${best}</small></div>${dotsFor(t, n, 10)}<span class="pct">${r ? Math.round(r.done / r.of * 100) + '%' : '–'}</span></div>`;
    }).join('')}</div>` : ''}

    <div class="section-label">Achievements · ${Object.keys(S.unlocked).length} of ${C.ACHIEVEMENTS.length}</div>
    <div class="ach">${C.ACHIEVEMENTS.map(a => {
      const got = S.unlocked[a.id];
      return `<div class="card badge${got ? '' : ' locked'}"><div class="med">${a.icon}</div><b>${esc(a.name)}</b><small>${got ? new Date(C.parse(got)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : esc(a.text)}</small></div>`;
    }).join('')}</div>

    <div class="section-label">How your lists have changed</div>
    <div class="card timeline">${evolution()}</div>

    ${retired.length ? `<div class="section-label">Let go</div><div class="card">${retired.map(t => `<div class="habit" style="${cvar(t.cycle)}" data-id="${t.id}"><div class="hn"><div>${esc(t.title)}</div><small>was ${C.CYCLE[t.cycle].adj} · done ${C.total(t)} times</small></div><button class="chip" data-act="restore">Bring back</button></div>`).join('')}</div>` : ''}
  </div>`;
}

// ---------- settings ----------

async function renderSettings() {
  const v = app.querySelector('[data-view="settings"]');
  const st = await Push.status();
  const r = S.settings.reminders;
  const n = now();
  const pv = slot => { const b = C.brief(S, slot, n); return `<div class="preview"><b>${esc(b.title)}</b><span>${esc(b.body)}</span></div>`; };
  const pushBlock = {
    install: '<p class="muted">Reminders work from the installed app. In Safari tap <b>Share</b> → <b>Add to Home Screen</b>, then open Ritualist from your Home Screen and come back here.</p>',
    unsupported: '<p class="muted">This browser can\'t receive reminders. On iPhone, add Ritualist to your Home Screen (iOS 16.4 or newer).</p>',
    denied: '<p class="muted">Notifications are blocked for Ritualist. Turn them on in Settings → Notifications → Ritualist.</p>',
    off: '<button class="btn pri" data-act="push-on">Turn on reminders</button>',
    on: `<div class="toggle-row"><span>Reminders are on for this phone</span><span style="color:var(--good)">●</span></div>
      ${st.synced ? '' : '<p class="muted" style="margin:10px 2px 0">Couldn\'t reach the reminder service yet. Ritualist will try again next time it opens.</p>'}
      <div class="btns" style="margin-top:10px"><button class="btn" data-act="push-ping">Send a test from the server</button><button class="btn danger" data-act="push-off">Turn reminders off</button></div>`,
  }[st.state];
  if (ui.tab !== 'settings') return;
  v.innerHTML = `<header class="head"><h1>Settings</h1></header><div class="scroll settings">
    <div class="lbl" style="margin-top:0">Reminders</div>
    ${pushBlock}
    <div class="lbl">Reminder times</div>
    <div class="times">${['morning', 'midday', 'evening'].map(k => `<label>${k[0].toUpperCase() + k.slice(1)}<input type="time" data-time="${k}" value="${esc(r[k])}"></label>`).join('')}</div>
    <div class="lbl">What they'll say right now</div>
    ${pv('morning')}${pv('midday')}${pv('evening')}
    ${st.state === 'on' ? '<div class="seg" style="margin-top:10px"><button data-act="preview" data-slot="morning">Test morning</button><button data-act="preview" data-slot="midday">Test midday</button><button data-act="preview" data-slot="evening">Test evening</button></div>' : ''}
    <div class="lbl">Daily backup</div>
    ${backupBlock()}
    <div class="lbl">Backup file</div>
    <div class="btns" style="margin-top:0">
      <button class="btn" data-act="backup">Save a copy to Files</button>
      <label class="btn" style="cursor:pointer">Restore from a file<input type="file" accept="application/json,.json" id="restore" hidden></label>
      <button class="btn danger hold" data-hold="wipe">Hold to erase everything</button>
    </div>
    <p class="muted" style="text-align:center;margin-top:18px">Ritualist · a day starts at 3 AM, weeks start Monday</p></div>`;
}

function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

let revealKey = false; // show the recovery key in Settings (right after turning backup on, or on request)

function backupBlock() {
  const b = Backup.info();
  const restore = `<p class="muted" style="margin:14px 2px 8px">Restore with a recovery key</p>
    <div class="rk-row"><input class="field" id="rk" placeholder="XXXX-XXXX-XXXX-…" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="btn" data-act="restore-key">Restore</button></div>`;
  if (!b) {
    return `<p class="muted" style="margin:0 2px 10px">Once a day, an encrypted copy of your lists is saved online, replacing the last one. Only your recovery key can open it.</p>
      <button class="btn pri" style="width:100%" data-act="backup-on">Turn on daily backup</button>${restore}`;
  }
  const key = revealKey ? `<div class="rkey">${esc(b.key)}</div>
    <p class="muted" style="margin:8px 2px 0">Save this key in Notes or a password manager. It's the only way to open the backup; without it, nobody can.</p>
    <div class="btns" style="margin-top:10px"><button class="btn" data-act="copy-key">Copy recovery key</button></div>` : '';
  return `<div class="toggle-row"><span>${b.last ? `Backed up ${ago(b.last)}` : 'Not backed up yet'}</span><span style="color:var(--good)">●</span></div>
    ${key}
    <div class="btns" style="margin-top:10px">
      <button class="btn" data-act="backup-now">Back up now</button>
      ${revealKey ? '' : '<button class="btn" data-act="show-key">Show recovery key</button>'}
      <button class="btn danger hold" data-hold="backup-delete">Hold to delete my backup</button>
    </div>`;
}

// Once a day when the app opens or comes back. Quiet on failure; it tries again next time.
function dailyBackup() {
  Backup.maybeDaily(S).then(did => { if (did && ui.tab === 'settings') renderSettings(); }).catch(() => {});
}

// ---------- events ----------

function reflectTarget(el) { return el.closest('[data-id]')?.dataset.id; }

app.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  const row = b.closest('.row');
  switch (act) {
    case 'tab': setTab(b.dataset.tab); break;
    case 'goto': goto(b.dataset.cy); break;
    case 'tick': tick(row, 'task'); break;
    case 'tick-item': tick(row, 'item'); break;
    case 'edit-task': taskSheet(row.dataset.id); break;
    case 'edit-item': itemSheet(row.dataset.id); break;
    case 'suggest': {
      const cy = b.closest('.page').dataset.cy;
      C.addTask(S, b.dataset.title, cy, now()); commit(); renderPage(cy); paintStrip();
      break;
    }
    case 'r-keep': C.snoozeReflection(S, reflectTarget(b), now()); commit(); render(); break;
    case 'r-adjust': taskSheet(reflectTarget(b), 'check-in'); break;
    case 'dismiss': { const card = b.closest('.note'); ui.dismissed[`praise:${card.dataset.id}:${card.dataset.key}`] = C.ymd(C.today(now())); saveUI(ui); render(); break; }
    case 'open-list': ui.listId = b.dataset.id; renderLists(); break;
    case 'lists-home': ui.listId = null; renderLists(); break;
    case 'new-list': listSheet(null); break;
    case 'edit-list': listSheet(ui.listId); break;
    case 'clear-done': C.clearDone(S, ui.listId); commit(); renderLists(); break;
    case 'restore': C.restoreTask(S, b.closest('[data-id]').dataset.id, now()); commit(); toast('Back on the list.'); render(); break;
  }
});

// Sheet controls also work in the Settings tab.
function onBoth(type, fn) {
  sheetBody.addEventListener(type, fn);
  app.addEventListener(type, e => { if (e.target.closest?.('[data-view="settings"]')) fn(e); });
}

onBoth('click', async e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  const holder = b.closest('[data-id]'), id = holder?.dataset.id;
  switch (act) {
    case 'close': closeSheet(); break;
    case 'star': { const t = C.findTask(S, id); t.star = !t.star; commit(); b.querySelector('.star').textContent = t.star ? '★' : '☆'; break; }
    case 'set-cycle': {
      C.moveTask(S, id, b.dataset.cy, now()); commit();
      for (const x of sheetBody.querySelectorAll('[data-act="set-cycle"]')) x.classList.toggle('on', x === b);
      holder.setAttribute('style', cvar(b.dataset.cy));
      break;
    }
    case 'retire': C.retireTask(S, id, now()); commit(); sheet._onClose = null; closeSheet(); toast('Let go. You can bring it back from Progress.'); break;
    case 'item-repeat': {
      const itemId = b.closest('[data-item]').dataset.item;
      const t = C.itemToTask(S, ui.listId, itemId, b.dataset.cy, now()); commit();
      sheet._onClose = null; closeSheet();
      if (t) toast(`${t.title} now repeats ${C.CYCLE[t.cycle].name.toLowerCase()}.`);
      break;
    }
    case 'item-move': {
      const itemId = b.closest('[data-item]').dataset.item, to = C.findList(S, b.dataset.to);
      sheet._onClose?.(); sheet._onClose = null;
      C.moveItem(S, ui.listId, itemId, to.id); commit(); closeSheet(); toast(`Moved to ${to.name}.`);
      break;
    }
    case 'item-delete': {
      const itemId = b.closest('[data-item]').dataset.item, l = C.findList(S, ui.listId);
      l.items = l.items.filter(i => i.id !== itemId); commit(); sheet._onClose = null; closeSheet();
      break;
    }
    case 'pick-emoji': sheet._emoji = b.dataset.e; for (const x of sheetBody.querySelectorAll('.emojis button')) x.classList.toggle('on', x === b); break;
    case 'list-save': {
      const name = sheetBody.querySelector('#f-name').value.trim();
      if (!name) { sheetBody.querySelector('#f-name').focus(); break; }
      if (sheet._listId) { const l = C.findList(S, sheet._listId); l.name = name; l.icon = sheet._emoji; }
      else { const l = C.addList(S, name, sheet._emoji, now()); ui.listId = l.id; }
      commit(); closeSheet(); break;
    }
    case 'push-on': {
      try { await Push.enable(S.settings.reminders); } catch (err) { toast('Couldn\'t turn on reminders: ' + err.message); }
      renderSettings(); break;
    }
    case 'push-off': await Push.disable(); renderSettings(); break;
    case 'push-ping': {
      try { await Push.ping(); toast('Sent from the server. It should arrive in a few seconds.'); }
      catch (err) { toast('Couldn\'t reach the reminder service: ' + err.message); }
      break;
    }
    case 'preview': await mirror(S); await Push.showPreview(b.dataset.slot); toast('Sent. Check your notifications.'); break;
    case 'backup-on': {
      try { await Backup.enable(S); revealKey = true; toast('Daily backup is on.'); }
      catch (err) { Backup.remove().catch(() => {}); toast('Couldn\'t reach the backup service: ' + err.message); }
      renderSettings(); break;
    }
    case 'backup-now': {
      try { await Backup.backupNow(S); toast('Backed up.'); } catch (err) { toast('Couldn\'t back up: ' + err.message); }
      renderSettings(); break;
    }
    case 'show-key': revealKey = true; renderSettings(); break;
    case 'copy-key': {
      try { await navigator.clipboard.writeText(Backup.info().key); toast('Recovery key copied.'); } catch { toast('Select the key and copy it.'); }
      break;
    }
    case 'restore-key': {
      const text = app.querySelector('#rk')?.value || '';
      try {
        if ((S.tasks.length || S.lists.length) && !confirm('Replace everything on this phone with the backup?')) break;
        const r = await Backup.restore(text);
        S = C.normalize(r.state); commit(); revealKey = false; render();
        toast(`Restored the backup from ${ago(r.updated)}.`);
      } catch (err) { toast(err.message); }
      break;
    }
    case 'backup': {
      const d = C.ymd(C.today(now()));
      await deliverFile(`ritualist-backup-${d}.json`, JSON.stringify(S, null, 1), 'application/json');
      break;
    }
  }
});

onBoth('change', async e => {
  if (e.target.dataset.time) { S.settings.reminders[e.target.dataset.time] = e.target.value; commit(); Push.sync(S.settings.reminders).catch(() => {}); }
  if (e.target.id === 'restore' && e.target.files[0]) {
    try {
      const data = JSON.parse(await e.target.files[0].text());
      if (!Array.isArray(data.tasks)) throw new Error('not a Ritualist backup');
      S = C.normalize(data); commit(); closeSheet(); render(); toast('Backup restored.');
    } catch (err) { toast('That file isn\'t a Ritualist backup.'); }
  }
});

sheetBody.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'f-title') { e.preventDefault(); closeSheet(); }
  if (e.key === 'Enter' && e.target.id === 'f-name') { e.preventDefault(); sheetBody.querySelector('[data-act="list-save"]').click(); }
});

// Hold to confirm anything that removes data.
let holdTimer = null;
onBoth('pointerdown', e => {
  const b = e.target.closest('[data-hold]');
  if (!b) return;
  b.classList.add('holding');
  holdTimer = setTimeout(() => {
    b.classList.remove('holding');
    const what = b.dataset.hold, id = b.closest('[data-id]')?.dataset.id;
    if (what === 'delete-task') { C.deleteTask(S, id); commit(); sheet._onClose = null; closeSheet(); toast('Deleted.'); }
    if (what === 'list-delete') { S.lists = S.lists.filter(l => l.id !== sheet._listId); ui.listId = null; commit(); sheet._onClose = null; closeSheet(); }
    if (what === 'backup-delete') {
      Backup.remove().then(() => { revealKey = false; renderSettings(); toast('Backup deleted. Daily backup is off.'); })
        .catch(err => toast('Couldn\'t delete it: ' + err.message));
    }
    if (what === 'wipe') { S = C.emptyState(); commit(); sheet._onClose = null; closeSheet(); render(); toast('Erased. Fresh start.'); }
  }, 800);
});
const cancelHold = () => { clearTimeout(holdTimer); for (const x of document.querySelectorAll('.holding')) x.classList.remove('holding'); };
onBoth('pointerup', cancelHold);
onBoth('pointercancel', cancelHold);
sheetBody.addEventListener('pointerleave', cancelHold);
app.addEventListener('pointerout', e => { if (e.target.closest?.('[data-hold]')) cancelHold(); });

app.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target, input = f.querySelector('input');
  const title = input.value.trim();
  if (!title) { input.blur(); return; }
  if (f.dataset.cy) { C.addTask(S, title, f.dataset.cy, now()); commit(); input.value = ''; renderPage(f.dataset.cy); paintStrip(); }
  else { C.addItem(S, f.dataset.list, title, now()); commit(); input.value = ''; renderLists(); }
  const again = (f.dataset.cy ? app.querySelector(`.page[data-cy="${f.dataset.cy}"] .add input`) : app.querySelector('[data-view="lists"] .add input'));
  again?.focus();
  again?.closest('li')?.previousElementSibling?.classList.add('arrive');
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

// The day can turn over while the app sits open.
let lastDay = C.ymd(C.today(now()));
function maybeRollover() {
  const d = C.ymd(C.today(now()));
  if (d !== lastDay) { lastDay = d; if (sheet.classList.contains('hidden')) render(); }
}
setInterval(maybeRollover, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { maybeRollover(); render(); dailyBackup(); } });
window.addEventListener('resize', () => { if (ui.tab === 'cycles') goto(ui.cycle, false); });

// ---------- start ----------

shell();
setTab('cycles');
mirror(S);
requestPersistence();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  Push.sync(S.settings.reminders).catch(() => {}); // re-sends only if the address, times or zone changed
  dailyBackup();
}
if (location.hash === '#progress') setTab('progress');

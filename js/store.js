// Everything lives on the phone. localStorage is the truth; a copy goes to Cache Storage
// so the service worker can read the lists when a reminder push wakes it.
import './core.js';
const C = globalThis.Core;
const KEY = 'ritualist.v1';
const UI_KEY = 'ritualist.ui';

const RESCUE = 'ritualist.rescue';

// Loads the saved lists. If they can't be opened (a bad update), the raw text is set aside in
// RESCUE before starting blank, so the next save can't overwrite it. Once a later update can
// read it again, it comes back by itself as long as nothing new has been added since.
export function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { return C.emptyState(); }
  let state;
  try { state = C.normalize(JSON.parse(raw)); }
  catch {
    const kept = rescued();
    if (!kept.some(r => r.raw === raw)) {
      try { localStorage.setItem(RESCUE, JSON.stringify([...kept, { at: Date.now(), raw }].slice(-3))); } catch { /* full */ }
    }
    state = C.emptyState();
  }
  const kept = rescued();
  if (kept.length && isBlank(state)) {
    const back = openRescue(kept[kept.length - 1]);
    if (back) { clearRescue(); return back; }
  }
  return state;
}

const isBlank = s => !s.tasks.length && !s.lists.length && !(s.todos || []).length;

export function rescued() {
  try { const r = JSON.parse(localStorage.getItem(RESCUE)); return Array.isArray(r) ? r : []; } catch { return []; }
}
export function openRescue(r) {
  try { return C.normalize(JSON.parse(r.raw)); } catch { return null; }
}
export function clearRescue() {
  try { localStorage.removeItem(RESCUE); } catch { /* ignore */ }
}

let timer = null;
export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ }
  clearTimeout(timer);
  timer = setTimeout(() => mirror(state), 300);
}

export async function mirror(state) {
  try {
    const c = await caches.open('ritualist-data');
    await c.put(new Request('state.json'), new Response(JSON.stringify(state), { headers: { 'content-type': 'application/json' } }));
  } catch { /* no Cache Storage (file:// or private mode) */ }
}

export function loadUI() {
  try { return { cycle: 'day', dismissed: {}, ...JSON.parse(localStorage.getItem(UI_KEY)) }; } catch { return { cycle: 'day', dismissed: {} }; }
}
export function saveUI(ui) {
  try { localStorage.setItem(UI_KEY, JSON.stringify({ cycle: ui.cycle, dismissed: ui.dismissed })); } catch { /* ignore */ }
}

export function requestPersistence() { navigator.storage?.persist?.().catch(() => {}); }

// Hands a file to the share sheet where there is one, otherwise downloads it.
export async function deliverFile(name, text, type) {
  const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return true; }
    catch (e) { if (e.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

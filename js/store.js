// Everything lives on the phone. localStorage is the truth; a copy goes to Cache Storage
// so the service worker can read the lists when a reminder push wakes it.
import './core.js';
const C = globalThis.Core;
const KEY = 'cadence.v1';
const UI_KEY = 'cadence.ui';

export function load() {
  try { return C.normalize(JSON.parse(localStorage.getItem(KEY))); } catch { return C.emptyState(); }
}

let timer = null;
export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ }
  clearTimeout(timer);
  timer = setTimeout(() => mirror(state), 300);
}

export async function mirror(state) {
  try {
    const c = await caches.open('cadence-data');
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

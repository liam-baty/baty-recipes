// Small helpers shared by every part of the app.

/** Escape text before putting it into HTML, so recipe text can never break the page. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/** Lower-case text and remove accents (purée → puree) so searches match loosely. */
export function norm(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Escape a string so it can be used inside a regular expression. */
export function reEscape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** A short unique id for list items. */
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function slugify(s) {
  return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'recipe';
}

// ---------- Dates (always local time, stored as "YYYY-MM-DD") ----------

export function isoDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromIso(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Monday of the week containing d. */
export function weekStart(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (x.getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(x, -offset);
}

export function fmtDate(d, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return d.toLocaleDateString('en-AU', opts);
}

// ---------- Toast messages (with optional Undo) ----------

let toastTimer;
export function toast(message, { actionLabel, onAction, ms = 3500 } = {}) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.innerHTML = `<span>${esc(message)}</span>` +
    (actionLabel ? `<button type="button" class="toast-btn">${esc(actionLabel)}</button>` : '');
  el.hidden = false;
  const btn = el.querySelector('.toast-btn');
  if (btn) btn.onclick = () => { el.hidden = true; onAction?.(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, actionLabel ? Math.max(ms, 6000) : ms);
}

/** True when running from the Home Screen rather than in Safari. */
export function isStandalone() {
  return window.navigator.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches;
}

/** Open a native <dialog> built from HTML. Resolves with the value of the button pressed. */
export async function dialog(html, opts) {
  return (await dialogForm(html, opts)).value;
}

/**
 * Like dialog(), but also returns the form's fields:
 * { value: 'ok', fields: { name: 'value', ... } }
 */
export function dialogForm(html, { className = '' } = {}) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'sheet ' + className;
    d.innerHTML = `<form method="dialog">${html}</form>`;
    document.body.appendChild(d);
    const form = d.querySelector('form');
    d.addEventListener('close', () => {
      resolve({ value: d.returnValue, fields: Object.fromEntries(new FormData(form)) });
      d.remove();
    });
    // Tap on the dimmed background to close
    d.addEventListener('click', (e) => { if (e.target === d) d.close(''); });
    d.showModal();
    d.querySelector('[autofocus]')?.focus();
  });
}

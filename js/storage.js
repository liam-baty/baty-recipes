// Everything personal is saved on this device only, in localStorage.
// Every read and write is wrapped in try/catch: if storage is blocked or full
// (e.g. Private Browsing), the app keeps working from memory for this visit
// and shows a warning.

const PREFIX = 'baty.';

/** Default values for each saved item. These keys are what Export/Import copy. */
export const DEFAULTS = {
  favs: {},              // { recipeId: true }
  ratings: {},           // { recipeId: 1-5 }
  notes: {},             // { recipeId: "my note" }
  made: {},              // { recipeId: ["2026-11-16", ...] }
  scales: {},            // { recipeId: 2 } last serving scale used
  shopping: [],          // [{ uid, line, scale, recipeId, recipeTitle, checked, custom }]
  sectionOverrides: {},  // { "ingredient name": "produce" }
  pantry: ['salt', 'pepper', 'black pepper', 'white pepper', 'salt and pepper', 'water',
    'boiling water', 'oil', 'olive oil', 'vegetable oil', 'canola oil', 'soy sauce',
    'flour', 'plain flour', 'self-raising flour', 'sugar', 'caster sugar', 'brown sugar'],
  plan: {},              // { "2026-11-16": [{ uid, recipeId, label, scale }] }
  settings: {
    theme: 'auto',        // auto | light | dark
    textSize: 'normal',   // small | normal | large | xl
    defaultScale: 1,
    staples: 'grey',      // grey | hide  (how pantry staples show on the shopping list)
    mainsOnly: true,      // "What's for dinner?" limited to Savoury Mains
    reminders: false,     // show "Send to Reminders" buttons (after setting up the Shortcut)
    remindersShortcut: 'Baty Reminders' // name of that Shortcut on the phone
  },
  edits: {},             // { recipeId: { ...changed fields } }  your edits to book recipes
  custom: {},            // { recipeId: { ...full recipe } }      recipes you added
  recent: [],            // recently viewed recipe ids
  ui: {}                 // small conveniences: open sections, dismissed tips
};

/** Keys included in the backup file. */
export const EXPORT_KEYS = Object.keys(DEFAULTS).filter((k) => k !== 'ui');

const memory = {};
let healthy = true;
const listeners = new Set();

function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }

// Check once at start-up that storage actually works.
try {
  localStorage.setItem(PREFIX + '_test', '1');
  localStorage.removeItem(PREFIX + '_test');
} catch {
  healthy = false;
}

export function storageOk() { return healthy; }

export function get(key) {
  const fallback = DEFAULTS[key];
  if (key in memory) return clone(memory[key]);
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return clone(fallback);
    const value = JSON.parse(raw);
    // Fill in any new settings added in later versions
    if (key === 'settings') return { ...DEFAULTS.settings, ...value };
    return value;
  } catch {
    healthy = false;
    return clone(fallback);
  }
}

export function set(key, value) {
  memory[key] = clone(value);
  let ok = true;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    delete memory[key]; // saved for real, so no need to hold it in memory
  } catch {
    healthy = false;
    ok = false;
  }
  listeners.forEach((fn) => fn(key));
  return ok;
}

/** Change a saved value with a function: update('favs', f => { f[id] = true; }) */
export function update(key, fn) {
  const value = get(key);
  const result = fn(value);
  return set(key, result === undefined ? value : result);
}

export function onChange(fn) { listeners.add(fn); }

// ---------- Backup ----------

export function exportAll(appVersion) {
  const data = {};
  for (const k of EXPORT_KEYS) data[k] = get(k);
  return {
    app: 'baty-recipes',
    format: 1,
    exportedAt: new Date().toISOString(),
    appVersion,
    data
  };
}

/** Replace saved data with a backup. Returns the number of sections restored. */
export function importAll(backup) {
  if (!backup || backup.app !== 'baty-recipes' || typeof backup.data !== 'object') {
    throw new Error('This file is not a Baty Recipes backup.');
  }
  let n = 0;
  for (const k of EXPORT_KEYS) {
    if (k in backup.data) { set(k, backup.data[k]); n++; }
  }
  return n;
}

/** Remove every saved item (used by "Clear all my data"). */
export function clearAll() {
  for (const k of Object.keys(DEFAULTS)) {
    delete memory[k];
    try { localStorage.removeItem(PREFIX + k); } catch { /* ignore */ }
  }
  try { localStorage.removeItem(PREFIX + 'timers'); } catch { /* ignore */ }
  listeners.forEach((fn) => fn('*'));
}

// ---------- Raw access for small things not in DEFAULTS (e.g. running timers) ----------

export function getRaw(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}

export function setRaw(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* ignore */ }
}

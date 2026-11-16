// Start-up and page routing.
// Pages use the part of the address after "#", e.g. #/recipe/hedgehog-slice,
// so every recipe has its own link and GitHub Pages needs no special setup.

import * as data from './data.js';
import * as store from './storage.js';
import * as timers from './timers.js';
import * as shop from './shoplist.js';
import * as book from './book.js';
import { esc, toast } from './util.js';

import * as home from './views/home.js';
import * as recipe from './views/recipe.js';
import * as cook from './views/cook.js';
import * as shopping from './views/shopping.js';
import * as planner from './views/planner.js';
import * as settings from './views/settings.js';
import * as edit from './views/edit.js';

const ROUTES = [
  [/^#?\/?$/, home, 'home'],
  [/^#\/recipe\/([^/]+)$/, recipe, 'home'],
  [/^#\/cook\/([^/]+)$/, cook, 'home'],
  [/^#\/make$/, home, 'home', { make: true }],
  [/^#\/shopping$/, shopping, 'shopping'],
  [/^#\/plan(?:\/(\d{4}-\d{2}-\d{2}))?$/, planner, 'plan'],
  [/^#\/settings$/, settings, 'settings'],
  [/^#\/edit\/([^/]+)$/, edit, 'home'],
  [/^#\/new$/, edit, 'home', { isNew: true }]
];

const main = document.getElementById('view');
const scrollMemory = {};
let currentHash = null;

function route() {
  const hash = location.hash || '#/';
  if (currentHash) scrollMemory[currentHash] = window.scrollY;
  currentHash = hash;

  let match = null;
  for (const [re, view, tab, extra] of ROUTES) {
    const m = hash.match(re);
    if (m) { match = { view, tab, params: { id: m[1] ? decodeURIComponent(m[1]) : undefined, ...extra } }; break; }
  }
  if (!match) { location.replace('#/'); return; }

  document.querySelectorAll('.tabbar a').forEach((a) => {
    a.toggleAttribute('aria-current', a.dataset.tab === match.tab);
    if (a.dataset.tab === match.tab) a.setAttribute('aria-current', 'page');
  });
  document.body.dataset.view = match.view.name || '';

  // A fresh container each time means old page listeners are dropped.
  const el = document.createElement('div');
  el.className = 'page';
  main.replaceChildren(el);
  try {
    match.view.render(el, match.params);
  } catch (err) {
    console.error(err);
    el.innerHTML = `<div class="pad"><h1>Something went wrong</h1><p>${esc(err.message)}</p><p><a href="#/">Back to recipes</a></p></div>`;
  }
  const y = hash === '#/' || hash === '' ? scrollMemory[hash] : 0;
  window.scrollTo(0, y || 0);
}

/** Apply theme + text size from settings. */
export function applySettings() {
  const s = store.get('settings');
  const root = document.documentElement;
  if (s.theme === 'light' || s.theme === 'dark') root.dataset.theme = s.theme; else delete root.dataset.theme;
  root.dataset.text = s.textSize || 'normal';
  const dark = s.theme === 'dark' || (s.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#17131d' : '#2f6b4f');
}

/** Number on the Shopping tab. */
export function updateShopBadge() {
  // Count list rows (after merging), not raw lines; pantry staples don't count
  const n = shop.build().sections.reduce((sum, s) => sum + s.rows.filter((r) => !r.checked).length, 0);
  const b = document.getElementById('shop-count');
  b.hidden = !n;
  b.textContent = n > 99 ? '99+' : n;
}

// ---------------------------------------------------------------------------
// Service worker (offline support + updates)
// ---------------------------------------------------------------------------

export let swVersion = null;

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const askVersion = () => navigator.serviceWorker.controller?.postMessage({ type: 'version' });
    askVersion();

    // A new version was downloaded: offer to switch to it
    const offer = (worker) => {
      toast('A new version of the app is ready.', {
        actionLabel: 'Update now',
        onAction: () => worker.postMessage({ type: 'skipWaiting' }),
        ms: 15000
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
      });
    });
    // Check for updates whenever the app comes back to the front
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch((e) => console.warn('Service worker not registered', e));

  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'version') {
      swVersion = e.data.version;
      document.querySelectorAll('[data-app-version]').forEach((el) => { el.textContent = swVersion; });
    }
  });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function start() {
  applySettings();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applySettings);
  timers.init();
  store.onChange((key) => {
    if (key === 'shopping' || key === '*') updateShopBadge();
    if (key === 'edits' || key === 'custom' || key === '*') data.invalidate();
  });

  try {
    await data.load();
  } catch (err) {
    main.innerHTML = `<div class="pad"><h1>Couldn't load the recipes</h1>
      <p>${esc(err.message)}</p>
      <p>If you're offline, open the app once while online so it can save a copy.</p>
      <button class="btn primary" onclick="location.reload()">Try again</button></div>`;
    return;
  }

  // If the book now includes your phone edits, tidy them away
  try { book.tidy(); data.invalidate(); } catch (e) { console.warn(e); }

  if (!store.storageOk()) {
    toast("Your phone isn't letting the app save data (Private Browsing?). Changes will be lost when you close it.", { ms: 8000 });
  }

  updateShopBadge();
  window.addEventListener('hashchange', route);
  route();
  registerServiceWorker();
}

start();

// Service worker: makes the app work offline.
//
// HOW UPDATES WORK
// The phone keeps a saved copy (cache) of every file listed below. When you
// publish changes, bump VERSION (e.g. 1.0.0 → 1.0.1). The phone notices this
// file changed, downloads a fresh copy of everything, and the app shows
// "A new version of the app is ready — Update now".
//
// recipes.json is fetched fresh whenever you're online (and saved for offline),
// so recipe-only changes show up on the next online visit even without a bump —
// but bumping VERSION is still the reliable way to push any change.

const VERSION = '1.2.0';
const CACHE = `baty-recipes-${VERSION}`;

// Every file the app needs. If you add a file, add it here too.
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'recipes.json',
  'css/app.css',
  'css/print.css',
  'js/app.js',
  'js/util.js',
  'js/storage.js',
  'js/data.js',
  'js/ingredients.js',
  'js/shoplist.js',
  'js/timers.js',
  'js/share.js',
  'js/reminders.js',
  'js/views/common.js',
  'js/views/home.js',
  'js/views/recipe.js',
  'js/views/cook.js',
  'js/views/shopping.js',
  'js/views/planner.js',
  'js/views/settings.js',
  'js/views/edit.js',
  'icons/icon.svg',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // cache: 'reload' skips the browser's normal cache so we get the newest files
      cache.addAll(FILES.map((url) => new Request(url, { cache: 'reload' })))
    )
  );
  // Don't take over straight away: the app asks you first ("Update now"),
  // unless this is the very first install.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('baty-recipes-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'skipWaiting') self.skipWaiting();
  if (event.data?.type === 'version') event.source?.postMessage({ type: 'version', version: VERSION });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // recipes.json: try the network first (3 s), fall back to the saved copy
  if (url.pathname.endsWith('/recipes.json')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Everything else: saved copy first (fast and works offline)
  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      return await fetch(req);
    } catch {
      // Offline and not saved: for page loads, show the app shell
      if (req.mode === 'navigate') return (await caches.match('index.html')) || Response.error();
      return Response.error();
    }
  })());
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([
      fetch(req, { cache: 'no-cache' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
    ]);
    if (res.ok) cache.put('recipes.json', res.clone());
    return res;
  } catch {
    return (await cache.match('recipes.json')) || Response.error();
  }
}

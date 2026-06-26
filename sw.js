/* Fairy Tale Walk — service worker.
 *
 * Update strategy (so a published deploy shows up on the next visit/refresh with
 * NO manual cache-clearing or app reinstall):
 *  - install:  precache the shell, then skipWaiting() so the new SW activates at once.
 *  - activate: delete old caches, then clients.claim() so it controls open pages.
 *  - the page reloads itself on `controllerchange` (see index.html).
 *
 * Fetch strategy:
 *  - App shell (navigations + html/js/css/manifest/story.json): NETWORK-FIRST —
 *    always fresh when online, cached copy as the offline fallback. This means
 *    freshness no longer depends on remembering to bump CACHE_VERSION.
 *  - Everything else (icons, audio, images): CACHE-FIRST + runtime cache — fast,
 *    offline, and versioned/immutable enough not to need revalidation.
 *
 * Still bump CACHE_VERSION when you want to force-purge old caches on activate.
 */
var CACHE_VERSION = 'ftw-cache-v8';

var PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './data/story.json?v=3',   // version-locked URL app.js actually requests (keep in sync)
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

// Core app-shell paths that should be network-first (kept fresh online).
var SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/manifest.webmanifest', '/data/story.json'];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function (cache) { return cache.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          if (k !== CACHE_VERSION) return caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

// allow the page to trigger an immediate takeover if it ever asks
self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function putInCache(req, res) {
  if (res && res.status === 200 && res.type === 'basic') {
    var copy = res.clone();
    caches.open(CACHE_VERSION).then(function (cache) { cache.put(req, copy); });
  }
  return res;
}

function networkFirst(req) {
  return fetch(req)
    .then(function (res) { return putInCache(req, res); })
    .catch(function () {
      return caches.match(req).then(function (cached) {
        return cached || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error());
      });
    });
}

function cacheFirst(req) {
  return caches.match(req).then(function (cached) {
    if (cached) return cached;
    return fetch(req)
      .then(function (res) { return putInCache(req, res); })
      .catch(function () { return Response.error(); });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let cross-origin pass through

  var isShell = req.mode === 'navigate' || SHELL.indexOf(url.pathname) !== -1;
  event.respondWith(isShell ? networkFirst(req) : cacheFirst(req));
});

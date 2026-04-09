// Rotor service worker — caches the app shell so Rotor runs with network
// fully disabled after the first load. This is the ONLY file besides
// index.html that the browser needs at runtime. It exists because browsers
// do not permit registering a service worker from a blob: or data: URL,
// and a service worker is the only mechanism that guarantees offline
// operation. It contains no network code of its own and never phones home.

const CACHE = 'rotor-v3';
const ASSETS = ['./', './index.html', './sw.js', './favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache-first for everything under our scope. On miss, try network, then
// fall back to whatever's in the cache. Any non-GET request bypasses the
// worker entirely. There is no telemetry, no analytics, no background sync.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        if (!resp || !resp.ok || resp.type === 'opaque') return resp;
        const copy = resp.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
        return resp;
      }).catch(() => cached);
    })
  );
});

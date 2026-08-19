// CallbackCV — service worker
//
// Strategy:
//   • Static assets (Next.js _next/static, icons): cache-first, long-lived.
//   • Navigation requests (HTML): network-first with offline fallback so
//     users always get fresh app shell when online but still see something
//     on a flaky mobile connection.
//   • API calls under /api or to the backend: bypass cache (network-only).
//
// Bump CACHE_VERSION whenever cached file shape changes so old workers
// release their grip on stale assets.

// v2: renamed from 'pocket-resume-v1'. The rename is deliberate — the
// activate handler below deletes every cache not matching CACHE_VERSION, so
// bumping this is how a bad cache gets evicted from clients already in the
// wild. It also drops the stale product name.
const CACHE_VERSION = 'callbackcv-v2';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => null),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

function isApiRequest(url) {
  if (url.pathname.startsWith('/api/')) return true;
  // Cross-origin API calls (configured backend) — don't cache.
  if (url.origin !== self.location.origin) return true;
  return false;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (isApiRequest(url)) return; // network-only, let the page handle errors

  // Navigations: network-first.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy)).catch(() => null);
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL))),
    );
    return;
  }

  // Static assets: cache-first.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          if (!res || res.status !== 200 || res.type !== 'basic') return res;
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy)).catch(() => null);
          return res;
        })
        .catch(() => {
          // NEVER fall back to offline.html here. This branch also serves
          // script and style requests, so handing back an HTML document for a
          // .js request makes the browser parse HTML as JavaScript. Webpack's
          // module registry then ends up undefined and the app dies with
          // "Cannot read properties of undefined (reading 'call')" — that is
          // __webpack_require__ calling modules[id].call() on a missing
          // factory. It turned a transient chunk fetch failure into a hard
          // white-screen error page on /auth/register and anywhere else.
          //
          // Return an honest error instead, so the browser reports a network
          // failure and Next.js can retry the chunk.
          return new Response('', {
            status: 503,
            statusText: 'Offline',
            headers: { 'Cache-Control': 'no-store' },
          });
        });
    }),
  );
});

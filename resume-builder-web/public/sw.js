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

const CACHE_VERSION = 'pocket-resume-v1';
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
        .catch(() => caches.match(OFFLINE_URL));
    }),
  );
});

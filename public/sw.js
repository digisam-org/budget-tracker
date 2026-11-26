const CACHE_NAME = 'budget-tracker-pwa-v3';
const RELATIVE_PRECACHE_PATHS = [
  '',
  'dropzone/',
  'review/',
  'budget/',
  'transactions/',
  'rules/',
  'manifest.json',
  'offline.html',
  'icons/icon-192.svg',
  'icons/icon-512.svg',
];

function scopeUrl(relativePath) {
  return new URL(relativePath, self.registration.scope).href;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        RELATIVE_PRECACHE_PATHS.map((p) => cache.add(scopeUrl(p)))
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // 1. Page navigations: Network-first, fall back to cached route, scope root, or offline.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const exact = await caches.match(request);
          if (exact) return exact;
          const withSlash = await caches.match(
            url.pathname.endsWith('/') ? url.href : `${url.origin}${url.pathname}/`
          );
          if (withSlash) return withSlash;
          return (
            (await caches.match(scopeUrl(''))) ||
            (await caches.match(scopeUrl('offline.html')))
          );
        })
    );
    return;
  }

  // 2. Static assets: Stale-while-revalidate for instant offline boot
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});

const VERSION = 'v2024-10-21-1';
const STATIC_CACHE = `static-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/apps/web/public/icons/icon-192.png',
  '/apps/web/public/icons/icon-512.png'
];

const getAppShellFromCache = async () =>
  (await caches.match('/index.html')) || (await caches.match('/'));

const isRedirectResponse = (response) =>
  response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => ![STATIC_CACHE, RUNTIME_CACHE].includes(key))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: 'SW_ACTIVATED', version: VERSION });
      }
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request, { cache: 'reload' });
          const cache = await caches.open(RUNTIME_CACHE);
          if (!isRedirectResponse(fresh)) {
            cache.put(request, fresh.clone());
            return fresh;
          }

          const appShell = await getAppShellFromCache();
          if (appShell) {
            return appShell;
          }

          return fetch(request);
        } catch {
          const cache = await caches.open(RUNTIME_CACHE);
          const cached = await cache.match(request);
          if (cached && !isRedirectResponse(cached)) {
            return cached;
          }
          const appShell = await getAppShellFromCache();
          if (appShell) {
            return appShell;
          }
          throw new Error('App shell cache is unavailable');
        }
      })(),
    );
    return;
  }

  if (PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);
        if (cached) {
          return cached;
        }

        try {
          const response = await fetch(request);
          if (response && response.ok && !isRedirectResponse(response)) {
            cache.put(request, response.clone());
          }
          return response;
        } catch (error) {
          if (cached) {
            return cached;
          }
          throw error;
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(request);
      const updatePromise = fetch(request)
        .then((response) => {
          if (response && response.ok && !isRedirectResponse(response)) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => cached);
      return cached || updatePromise;
    })(),
  );
});

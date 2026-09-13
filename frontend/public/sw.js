const SHELL_CACHE_NAME = 'wamercio-spa-pwa-shell-v47-dual-pin-recovery';
const ASSET_CACHE_NAME = 'wamercio-spa-pwa-assets-v1';
const CACHE_PREFIX = 'wamercio-spa-pwa-';
const STATIC_ASSETS = [
  '/offline.html',
  '/runtime-recovery.js',
  '/chunk-recovery.js',
  '/icon.png',
  '/favicon-32.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX)
            && key !== SHELL_CACHE_NAME
            && key !== ASSET_CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

const cacheFirstAsset = async (request) => {
  const cache = await caches.open(ASSET_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone());
  }
  return response;
};

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(() => new Response(JSON.stringify({ error: 'Sin conexión con el backend' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      })),
    );
    return;
  }

  if (
    url.pathname === '/sw.js'
    || url.pathname === '/runtime-recovery.js'
    || url.pathname === '/chunk-recovery.js'
    || url.pathname.endsWith('/manifest.json')
  ) {
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => caches.match(request)));
    return;
  }

  // Never cache the application HTML. A cached document can reference chunk
  // hashes removed by a later deployment and leave the browser on a blank page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .catch(() => caches.match('/offline.html')),
    );
    return;
  }

  // Next.js assets are content-hashed. Keeping them in a stable asset cache
  // allows tabs opened before a deployment to finish loading their own version.
  if (
    url.pathname.startsWith('/_next/static/')
    || url.pathname === '/icon.png'
    || url.pathname === '/favicon-32.png'
    || url.pathname.startsWith('/icons/')
  ) {
    event.respondWith(cacheFirstAsset(request));
  }
});

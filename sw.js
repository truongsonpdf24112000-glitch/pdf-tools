// sw.js — Service Worker: Cache-first with network update
// Provides offline support for PDF Tools PWA
const CACHE_NAME = 'pdf-tools-v5.1.0';
const APP_SHELL = [
  '/pdf-tools/',
  '/pdf-tools/index.html',
  '/pdf-tools/css/base.css',
  '/pdf-tools/css/layout.css',
  '/pdf-tools/css/components.css',
  '/pdf-tools/js/app.js',
  '/pdf-tools/js/tools/edit.js',
  '/pdf-tools/js/tools/convert.js',
  '/pdf-tools/js/tools/advanced.js',
  '/pdf-tools/js/tools/special.js',
  '/pdf-tools/js/utils/pdf-engine.js',
  '/pdf-tools/js/utils/ui-helpers.js',
  '/pdf-tools/js/utils/config.js',
  '/pdf-tools/js/utils/thumbnail-worker.js',
  '/pdf-tools/manifest.json',
];

const CDN_SCRIPTS = [
  'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js',
  'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js',
  'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
  'https://unpkg.com/sortablejs@1.15.2/Sortable.min.js',
];

// Install: Pre-cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching app shell');
      return cache.addAll([...APP_SHELL, ...CDN_SCRIPTS]);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Cache-first for app shell, Network-first for CDN, Cache-only for offline
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // CDN scripts: Network first, cache fallback
  if (CDN_SCRIPTS.some(cdn => url.href === cdn)) {
    event.respondWith(networkFirst(event.request, CACHE_NAME));
    return;
  }

  // App shell: Cache first, network update
  if (APP_SHELL.some(shell => url.pathname.endsWith(shell.replace('/pdf-tools/', ''))) || 
      url.pathname === '/pdf-tools/' || url.pathname === '/pdf-tools/index.html') {
    event.respondWith(cacheFirst(event.request, CACHE_NAME));
    return;
  }

  // Backend API: Network only (don't cache)
  if (url.href.includes('localhost:5001') || url.href.includes('onrender.com')) {
    return;
  }

  // Everything else: Network first, cache fallback
  event.respondWith(networkFirst(event.request, CACHE_NAME));
});

// Cache-first strategy
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) {
    // Background update
    fetch(request).then(res => {
      if (res.ok) caches.open(cacheName).then(c => c.put(request, res));
    }).catch(() => {});
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline fallback
    if (request.destination === 'document') {
      return caches.match('/pdf-tools/index.html');
    }
    return new Response('Offline', { status: 503 });
  }
}

// Network-first strategy
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return caches.match(request);
  }
}

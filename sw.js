// sw.js — Service Worker for Chỉnh Sửa PDF (PWA)
const CACHE_NAME = 'pdf-tools-v5.1.0';
const ASSETS = [
  '/pdf-tools/',
  '/pdf-tools/index.html',
  '/pdf-tools/css/base.css',
  '/pdf-tools/css/layout.css',
  '/pdf-tools/css/components.css',
  '/pdf-tools/js/app.js',
  '/pdf-tools/js/utils/pdf-engine.js',
  '/pdf-tools/js/utils/ui-helpers.js',
  '/pdf-tools/js/utils/config.js',
  '/pdf-tools/js/tools/edit.js',
  '/pdf-tools/js/tools/convert.js',
  '/pdf-tools/js/tools/advanced.js',
  '/pdf-tools/js/tools/special.js',
  '/pdf-tools/manifest.json',
];

// Install: cache all shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for assets, network-first for API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip backend API calls
  if (url.pathname.startsWith('/health') ||
      url.pathname.startsWith('/convert') ||
      url.pathname.startsWith('/compress') ||
      url.pathname.includes('backend')) {
    return; // Let browser handle normally
  }

  // Skip CDN scripts
  if (url.hostname === 'unpkg.com' || url.hostname === 'www.googletagmanager.com') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        // Cache new requests for offline
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

const CACHE_NAME = 'safeher-ai-v1.0';
const STATIC_ASSETS = [
  '/',
  '/login',
  '/register',
  '/manifest.json',
  '/static/css/style.css',
  '/static/js/app.js',
  '/static/js/sos.js',
  '/static/js/sensors.js',
  '/static/js/map.js',
  '/static/js/assistant.js',
  '/static/js/checkin.js',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Outfit:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Install Event - Pre-cache Static Assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SafeHer SW] Caching core static assets');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SafeHer SW] Non-fatal caching warning:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate Event - Clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SafeHer SW] Removing outdated cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - Stale-while-revalidate for static, Network-first for APIs
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip caching POST requests or non-GET methods
  if (event.request.method !== 'GET') {
    return;
  }

  // Network-first for /api/ routes
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request);
      })
    );
    return;
  }

  // Cache-first / Stale-while-revalidate for UI assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If offline and request is an HTML page navigation, return cached home
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/');
          }
        });

      return cachedResponse || fetchPromise;
    })
  );
});

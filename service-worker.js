const CACHE_NAME = 'journey-tracker-v13';
const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-72.svg',
  './icons/icon-96.svg',
  './icons/icon-128.svg',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS).catch(err => {
        console.warn('Precache failed for some URLs:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin === 'https://unpkg.com' || url.hostname === 'tile.openstreetmap.org') {
    event.respondWith(
      caches.match(request).then(cached => {
        return cached || fetch(request).then(response => {
          const cloned = response.clone();
          if (response.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put(request, cloned));
          }
          return response;
        }).catch(() => cached || new Response('', { status: 408 }));
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      return cached || fetch(request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, cloned));
        }
        return response;
      }).catch(() => {
        if (request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

// Import the configuration file
importScripts('sw-config.js');

const CACHE_NAME = `hometab-cache-${CACHE_VERSION}`;

// 1. Installation: Caching the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching app shell');
        return cache.addAll(FILES_TO_CACHE);
      })
  );
});

// 2. Activation: Cleaning up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName.startsWith('hometab-cache-') && cacheName !== CACHE_NAME) {
            console.log(`[SW] Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Take control of all open clients
  );
});

// 3. Fetch: Serving content from cache or network
self.addEventListener('fetch', (event) => {
    // For Firebase/Google APIs, always go to the network.
    if (event.request.url.includes('firebase') || event.request.url.includes('googleapis.com')) {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // If the request is in the cache, return it.
                if (response) {
                    return response;
                }
                // Otherwise, fetch from the network.
                return fetch(event.request);
            })
    );
});

// 4. Message: Listen for a message from the client to skip waiting
self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
});

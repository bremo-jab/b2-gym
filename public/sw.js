const CACHE_NAME = 'b2gym-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/logo.svg',
  // Vite build output files will be cached dynamically by the browser or we can use cache-first strategy for requests
];

// Install Service Worker and cache resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache and storing assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate service worker and clear old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch handler: Network-first falling back to cache
self.addEventListener('fetch', event => {
  // Skip non-GET requests and API requests
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Check if response is valid
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Clone the response
        const responseToCache = response.clone();
        caches.open(CACHE_NAME)
          .then(cache => {
            cache.put(event.request, responseToCache);
          });

        return response;
      })
      .catch(() => {
        // If network fails, return cached response
        return caches.match(event.request);
      })
  );
});

// Push notification listener
self.addEventListener('push', event => {
  let data = { title: 'B2 Gym', body: 'تنبيه جديد من صالة الألعاب الرياضية' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'B2 Gym', body: event.data.text() };
    }
  }

  const options = {
    body: data.body,
    icon: '/icons/logo.svg',
    badge: '/icons/logo.svg',
    dir: 'rtl',
    lang: 'ar',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '2'
    },
    actions: [
      { action: 'explore', title: 'عرض التفاصيل', icon: '/icons/logo.svg' },
      { action: 'close', title: 'إغلاق', icon: '' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

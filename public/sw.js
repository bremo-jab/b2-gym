const CACHE_NAME = 'b2gym-cache-v3';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/logo.svg',
];

// Install Service Worker: immediately skip waiting
self.addEventListener('install', event => {
  self.skipWaiting();
});

// Activate service worker: clear old caches and immediately claim clients
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('Clearing old cache:', key);
            return caches.delete(key);
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

  // Also skip chrome-extension:// or other protocols
  if (!event.request.url.startsWith('http')) {
    return;
  }

  // For navigation requests: always Network-First, fallback to cached index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(event.request) || await caches.match('/index.html');
          if (cachedResponse) return cachedResponse;
          return new Response('الاتصال بالشبكة غير متاح حالياً', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        })
    );
    return;
  }

  // For static assets / other requests: Network-First, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });

        return response;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) return cachedResponse;
        return new Response('غير متوفر في الكاش أوفلاين', {
          status: 404,
          statusText: 'Not Found'
        });
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

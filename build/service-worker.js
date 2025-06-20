// public/service-worker.js

// Service worker version - increment when updating
const VERSION = 'v2';

// Cache name
const CACHE_NAME = `mot-app-cache-${VERSION}`;

// Assets to cache
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico'
];

// Install event - cache assets
self.addEventListener('install', event => {
  // Perform install steps
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  
  // Activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  // Take control of clients immediately
  self.clients.claim();
});

// Fetch event - serve from cache if possible, but don't cache API requests
self.addEventListener('fetch', event => {
  // Skip caching for API requests completely
  if (event.request.url.includes('/api/')) {
    return;
  }
  
  // For non-API requests, try to serve from cache first
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        
        // Clone the request because it's a one-time use stream
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest).then(response => {
          // Don't cache non-successful responses or non-GET requests
          if (!response || response.status !== 200 || event.request.method !== 'GET') {
            return response;
          }
          
          // Skip caching for certain paths
          if (event.request.url.includes('/push/') || event.request.url.includes('/socket/')) {
            return response;
          }
          
          // Clone the response because it's a one-time use stream
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
            
          return response;
        });
      })
  );
});

// Push event - handle push notifications
self.addEventListener('push', event => {
  console.log('Push received:', event);
  
  let notificationData = {};
  
  try {
    if (event.data) {
      notificationData = event.data.json();
    }
  } catch (e) {
    console.error('Failed to parse push data:', e);
  }
  
  const title = notificationData.title || 'MOT Update';
  const options = {
    body: notificationData.body || 'There is an update for your vehicle MOT.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: notificationData.data || {},
    requireInteraction: true,
    vibrate: [200, 100, 200]
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', event => {
  console.log('Notification click:', event);
  
  event.notification.close();
  
  // This looks to see if the current is already open and focuses if it is
  event.waitUntil(
    self.clients.matchAll({ type: 'window' })
      .then(clientList => {
        // Get notification data
        const notificationData = event.notification.data;
        const registration = notificationData.registration || '';
        
        // Construct the URL with the registration if available
        const url = registration ? `/?registration=${registration}` : '/';
        
        // If we have an open window, focus it
        for (const client of clientList) {
          if ('focus' in client) {
            return client.focus();
          }
        }
        
        // Otherwise open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});

// Background sync event - DISABLED to prevent conflicts with client-side polling
// The client-side UpdatePoller now handles all real-time notifications
self.addEventListener('sync', event => {
  console.log('Background sync event received but disabled to prevent notification conflicts');
  // Service worker sync is now disabled - all notification polling handled client-side
});
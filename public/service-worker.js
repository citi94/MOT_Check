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


// Push event - handle incoming push notifications from server
self.addEventListener('push', event => {
  console.log('Push notification received:', event);
  
  let notificationData = {
    title: 'MOT Update',
    body: 'There is an update for your vehicle MOT.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200],
    data: {}
  };
  
  // Parse push data if available
  if (event.data) {
    try {
      const pushData = event.data.json();
      console.log('Push data:', pushData);
      
      // Validate push data structure
      if (!pushData || !pushData.registration || !pushData.testResult) {
        console.error('Invalid push data structure:', pushData);
        // Still show a default notification if data is malformed
        notificationData.title = 'MOT Update';
        notificationData.body = 'New MOT test recorded for your vehicle';
      } else {
        // Extract notification details
        const { registration, testResult, vehicle, previousDate, newDate } = pushData;
        
        // Create notification title and body
        const passed = testResult === 'PASSED';
        const title = `MOT ${passed ? 'Passed ✅' : 'Failed ❌'} - ${registration}`;
        
        let body = `New MOT test recorded for your vehicle`;
        if (vehicle?.make && vehicle?.model) {
          body = `New MOT test recorded for your ${vehicle.make} ${vehicle.model}`;
        }
        
        if (passed) {
          body += ' - Test passed!';
        } else if (testResult === 'FAILED') {
          body += ' - Test failed!';
        }
        
        notificationData = {
          title,
          body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          requireInteraction: true,
          vibrate: [200, 100, 200, 100, 200],
          data: {
            registration,
            testResult,
            vehicle,
            url: `/?registration=${registration}`
          }
        };
      }
    } catch (error) {
      console.error('Error parsing push data:', error);
    }
  }
  
  // Show the notification
  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      requireInteraction: notificationData.requireInteraction,
      vibrate: notificationData.vibrate,
      data: notificationData.data,
      actions: [
        {
          action: 'view',
          title: 'View Details',
          icon: '/favicon.ico'
        },
        {
          action: 'dismiss',
          title: 'Dismiss'
        }
      ]
    })
  );
});

// Notification click event - handle user interaction with notifications
self.addEventListener('notificationclick', event => {
  console.log('Notification clicked:', event);
  
  const { action, notification } = event;
  const notificationData = notification.data || {};
  const registration = notificationData.registration || '';
  
  // Close the notification
  notification.close();
  
  if (action === 'dismiss') {
    // User dismissed the notification, do nothing
    return;
  }
  
  // Default action or 'view' action - open/focus the app
  event.waitUntil(
    self.clients.matchAll({ 
      type: 'window',
      includeUncontrolled: true 
    }).then(clientList => {
      // Construct the URL with the registration if available
      const url = registration ? `/?registration=${registration}` : '/';
      
      // Look for an existing window to focus
      for (const client of clientList) {
        if (client.url.includes(self.location.origin)) {
          return client.focus().then(() => {
            // Send message to client to load the specific registration
            if (registration) {
              return client.postMessage({
                type: 'LOAD_REGISTRATION',
                registration: registration
              });
            }
          }).catch(error => {
            console.error('Failed to focus window or send message:', error);
          });
        }
      }
      
      // No existing window found, open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    }).catch(error => {
      console.error('Failed to handle notification click:', error);
    })
  );
});

// Message event - handle messages from the main thread
self.addEventListener('message', event => {
  console.log('Service worker received message:', event.data);
  
  const { type, data } = event.data || {};
  
  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Notification close event
self.addEventListener('notificationclose', event => {
  console.log('Notification closed:', event.notification.data);
  
  // Could track notification dismissals here if needed
});
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

// Background sync event for checking MOT updates
self.addEventListener('sync', event => {
  if (event.tag === 'check-mot-updates') {
    event.waitUntil(checkForMotUpdates());
  }
});

// Function to check for MOT updates - now uses the server API
async function checkForMotUpdates() {
  try {
    // Get registrations to check from IndexedDB
    const registrations = await getRegistrationsToCheck();
    
    // If none, return early
    if (!registrations || registrations.length === 0) {
      return;
    }
    
    // Check each registration
    for (const reg of registrations) {
      await checkRegistration(reg);
    }
  } catch (error) {
    console.error('Error checking MOT updates:', error);
  }
}

// Function to get registrations from IndexedDB
async function getRegistrationsToCheck() {
  return new Promise((resolve, reject) => {
    // Open database
    const dbRequest = indexedDB.open('motApp', 1);
    
    dbRequest.onerror = event => {
      reject(new Error('Failed to open database'));
    };
    
    dbRequest.onsuccess = event => {
      const db = event.target.result;
      
      // Open transaction and get object store
      if (!db.objectStoreNames.contains('notifications')) {
        resolve([]);
        return;
      }
      
      const transaction = db.transaction(['notifications'], 'readonly');
      const store = transaction.objectStore('notifications');
      
      // Get all registrations
      const request = store.getAllKeys();
      
      request.onsuccess = event => {
        resolve(event.target.result);
      };
      
      request.onerror = event => {
        reject(new Error('Failed to get registrations'));
      };
    };
    
    dbRequest.onupgradeneeded = event => {
      const db = event.target.result;
      
      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains('notifications')) {
        db.createObjectStore('notifications', { keyPath: 'registration' });
      }
    };
  });
}

// Function to check a single registration
async function checkRegistration(registration) {
  try {
    // Call the API to check for updates
    const response = await fetch(`/api/getPendingNotifications?registration=${registration}`, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // If there's an update, show notification
    if (data.hasUpdate) {
      await showMotUpdateNotification(registration, data);
    }
  } catch (error) {
    console.error(`Error checking ${registration}:`, error);
  }
}

// Function to show MOT update notification
async function showMotUpdateNotification(registration, data) {
  // Extract details about the MOT update
  const details = data.details || {};
  const testResult = details.testResult || 'UNKNOWN';
  const make = details.vehicle?.make || '';
  const model = details.vehicle?.model || '';
  
  const title = `MOT ${testResult === 'PASSED' ? 'Passed ✅' : 'Failed ❌'} - ${registration}`;
  
  let body = `New MOT test recorded for your vehicle`;
  if (make && model) {
    body = `New MOT test recorded for your ${make} ${model}`;
  }
  
  if (testResult === 'PASSED') {
    body += ' - Test passed!';
  } else if (testResult === 'FAILED') {
    body += ' - Test failed!';
  }
  
  const options = {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: { registration },
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200]
  };
  
  return self.registration.showNotification(title, options);
}
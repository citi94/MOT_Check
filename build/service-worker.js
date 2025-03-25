// public/service-worker.js

// Service worker version - increment when updating
const VERSION = 'v1';

// Cache name
const CACHE_NAME = `mot-app-cache-${VERSION}`;

// Assets to cache
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/static/js/bundle.js'
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

// Fetch event - serve from cache if possible
self.addEventListener('fetch', event => {
  // Skip for API calls
  if (event.request.url.includes('/.netlify/functions/')) {
    return;
  }
  
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
          // Check if we received a valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
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
    requireInteraction: true
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
        const url = notificationData.url || '/';
        
        // If we have an open window, focus it
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
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

// Periodic background sync for checking MOT updates
self.addEventListener('periodicsync', event => {
  if (event.tag === 'check-mot-updates') {
    event.waitUntil(checkForMotUpdates());
  }
});

// Function to check for MOT updates
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
    const response = await fetch(`/.netlify/functions/checkMotUpdates?registration=${registration}`);
    
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
  const title = 'MOT Update Available';
  
  let body = `New MOT test for ${registration}`;
  if (data.vehicleData && data.vehicleData.make && data.vehicleData.model) {
    body = `New MOT test for your ${data.vehicleData.make} ${data.vehicleData.model} (${registration})`;
  }
  
  const options = {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: {
      registration,
      url: `/?registration=${registration}`
    },
    requireInteraction: true
  };
  
  return self.registration.showNotification(title, options);
}
// sw.js - Peeble PWA Service Worker

const CACHE_NAME = 'peeble-v1.0.0';
const STATIC_CACHE_NAME = 'peeble-static-v1.0.0';

// Resources to cache for offline functionality
const CACHE_URLS = [
  '/',
  '/index.html',
  '/style.css',
  '/main.js',
  '/services/audio.js',
  '/services/encryption.js',
  '/services/storage.js',
  '/services/nfc.js',
  '/services/utils.js',
  '/services/pubsub.js',
  '/services/state-manager.js',
  '/services/audio-service-adapter.js',
  '/components/debug-console.js',
  '/components/voice-recorder.js',
  '/components/message-player.js',
  '/components/nfc-handler.js',
  '/components/peeble-app.js',
  '/manifest.json'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('🔧 PWA: Service Worker installing...');
  
  event.waitUntil(
    Promise.all([
      // Cache static resources
      caches.open(STATIC_CACHE_NAME).then((cache) => {
        console.log('🔧 PWA: Caching static resources...');
        return cache.addAll(CACHE_URLS.map(url => {
          return new Request(url, { cache: 'reload' });
        }));
      }),
      
      // Skip waiting to activate immediately
      self.skipWaiting()
    ]).then(() => {
      console.log('✅ PWA: Service Worker installed successfully');
    }).catch((error) => {
      console.error('❌ PWA: Service Worker install failed:', error);
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('🔧 PWA: Service Worker activating...');
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && cacheName !== STATIC_CACHE_NAME) {
              console.log('🧹 PWA: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      
      // Take control of all clients immediately
      self.clients.claim()
    ]).then(() => {
      console.log('✅ PWA: Service Worker activated successfully');
    })
  );
});

// Fetch event - serve from cache with network fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Handle same-origin requests
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Serve from cache
          return cachedResponse;
        }
        
        // Fetch from network and cache if successful
        return fetch(request).then((response) => {
          // Only cache successful responses
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        }).catch(() => {
          // If network fails and it's an HTML request, serve the main app
          if (request.headers.get('accept').includes('text/html')) {
            return caches.match('/index.html');
          }
          throw new Error('Network request failed and no cache available');
        });
      })
    );
  }
});

// Handle navigation requests - CRITICAL for NFC URL handling
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Handle navigation requests (when NFC tag opens the app)
  if (request.mode === 'navigate') {
    event.respondWith(
      handleNavigationRequest(request)
    );
  }
});

async function handleNavigationRequest(request) {
  const url = new URL(request.url);
  
  console.log('🔧 PWA: Navigation request:', url.href);
  
  try {
    // Check if there's already a client (window) open
    const clients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });
    
    console.log(`🔧 PWA: Found ${clients.length} existing clients`);
    
    if (clients.length > 0) {
      // Focus existing window instead of opening new one
      const client = clients[0];
      
      console.log('🔧 PWA: Focusing existing client and navigating to:', url.href);
      
      // Focus the existing window
      if (client.focus) {
        await client.focus();
      }
      
      // Send the new URL to the existing window
      client.postMessage({
        type: 'NAVIGATE_TO_URL',
        url: url.href,
        hash: url.hash,
        searchParams: Object.fromEntries(new URLSearchParams(url.hash.substring(1)))
      });
      
      // Return empty response to prevent new window
      return new Response('', {
        status: 204,
        statusText: 'No Content - Handled by existing window'
      });
    }
  } catch (error) {
    console.error('🔧 PWA: Error handling navigation:', error);
  }
  
  // No existing clients, proceed with normal cache-first strategy
  try {
    const cachedResponse = await caches.match('/index.html');
    if (cachedResponse) {
      console.log('🔧 PWA: Serving cached index.html for navigation');
      return cachedResponse;
    }
  } catch (error) {
    console.error('🔧 PWA: Cache lookup failed:', error);
  }
  
  // Fallback to network
  console.log('🔧 PWA: Fetching from network for navigation');
  return fetch(request);
}

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  const { data } = event;
  
  console.log('🔧 PWA: Service Worker received message:', data);
  
  switch (data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'GET_VERSION':
      event.ports[0].postMessage({
        type: 'VERSION',
        version: CACHE_NAME
      });
      break;
      
    case 'CLEAR_CACHE':
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      }).then(() => {
        event.ports[0].postMessage({
          type: 'CACHE_CLEARED'
        });
      });
      break;
      
    default:
      console.log('🔧 PWA: Unknown message type:', data.type);
  }
});

// Handle background sync (for offline message uploads)
self.addEventListener('sync', (event) => {
  console.log('🔧 PWA: Background sync triggered:', event.tag);
  
  if (event.tag === 'upload-pending-messages') {
    event.waitUntil(uploadPendingMessages());
  }
});

async function uploadPendingMessages() {
  // This would handle uploading messages that were created while offline
  console.log('🔧 PWA: Checking for pending message uploads...');
  
  try {
    const clients = await self.clients.matchAll();
    if (clients.length > 0) {
      clients[0].postMessage({
        type: 'UPLOAD_PENDING_MESSAGES'
      });
    }
  } catch (error) {
    console.error('🔧 PWA: Error handling pending uploads:', error);
  }
}

// Handle push notifications (future feature)
self.addEventListener('push', (event) => {
  console.log('🔧 PWA: Push notification received:', event);
  
  // This could be used for notifying about new messages
  const options = {
    body: 'You have a new secure Peeble message',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: 'peeble-message',
    requireInteraction: true,
    actions: [
      {
        action: 'open',
        title: 'Open Peeble',
        icon: '/icons/open-icon.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
        icon: '/icons/dismiss-icon.png'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('New Peeble Message', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('🔧 PWA: Notification clicked:', event);
  
  event.notification.close();
  
  if (event.action === 'open') {
    event.waitUntil(
      self.clients.openWindow('/')
    );
  }
});

console.log('🔧 PWA: Service Worker loaded and ready');
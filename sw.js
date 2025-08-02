// sw.js - Service Worker for Peeble PWA
const CACHE_NAME = 'peeble-v1';
const STATIC_CACHE = 'peeble-static-v1';

// Files to cache for offline functionality
const STATIC_FILES = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './services/utils.js',
  './services/encryption.js',
  './services/nfc.js',
  './services/audio.js',
  './services/storage.js',
  './services/state-manager.js',
  './services/pubsub.js',
  './components/debug-console.js',
  './components/peeble-app.js',
  './components/nfc-handler.js'
];

// Install event - cache static files
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static files');
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        console.log('[SW] Static files cached successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Failed to cache static files:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Service worker activated');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache when offline, network when online
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Handle different types of requests
  if (url.pathname.includes('/api/') || url.hostname.includes('pinata') || url.hostname.includes('ipfs')) {
    // API and IPFS requests - network first, no cache for dynamic content
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          console.log('[SW] Network failed for:', event.request.url);
          return new Response('{"error": "Network unavailable"}', {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
  } else if (STATIC_FILES.includes(url.pathname) || url.pathname === '/') {
    // Static files - cache first
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          if (response) {
            console.log('[SW] Serving from cache:', event.request.url);
            return response;
          }
          return fetch(event.request)
            .then((response) => {
              // Cache the response for future use
              const responseClone = response.clone();
              caches.open(STATIC_CACHE)
                .then((cache) => {
                  cache.put(event.request, responseClone);
                });
              return response;
            });
        })
    );
  } else {
    // Other requests - network first
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // If it's a navigation request and network fails, serve the main app
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          throw error;
        })
    );
  }
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'NFC_SCAN') {
    // Handle NFC scan data
    console.log('[SW] NFC scan received:', event.data.payload);
    
    // Broadcast to all clients
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => {
        client.postMessage({
          type: 'NFC_SCAN_FORWARD',
          payload: event.data.payload
        });
      });
    });
  }
});

// Handle push notifications (future feature)
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');
  // Could be used for message notifications
});

// Handle background sync (future feature)
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  // Could be used for offline message synchronization
});

// Handle URL protocol (web+peeble://)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Check if this is a peeble protocol URL
  if (url.protocol === 'web+peeble:' || url.searchParams.has('messageId')) {
    console.log('[SW] Peeble URL detected:', event.request.url);
    
    // Redirect to the main app with the parameters
    const messageId = url.searchParams.get('messageId') || extractMessageIdFromPath(url.pathname);
    const ipfsHash = url.searchParams.get('ipfsHash') || extractIpfsHashFromPath(url.pathname);
    
    if (messageId && ipfsHash) {
      const appUrl = `/${url.origin}#messageId=${messageId}&ipfsHash=${ipfsHash}`;
      event.respondWith(Response.redirect(appUrl, 302));
    }
  }
});

// Utility functions
function extractMessageIdFromPath(pathname) {
  const match = pathname.match(/messageId=([^&]+)/);
  return match ? match[1] : null;
}

function extractIpfsHashFromPath(pathname) {
  const match = pathname.match(/ipfsHash=([^&]+)/);
  return match ? match[1] : null;
}

console.log('[SW] Service worker script loaded');
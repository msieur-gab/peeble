const CACHE_NAME = 'peeble-v1';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './manifest.json'
];

// Install
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Activate
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// ✅ CRITICAL: Simple fetch handler that prevents new windows
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Check if this is a Peeble URL
  const params = new URLSearchParams(url.hash.substring(1));
  const isPeebleUrl = params.has('messageId') && params.has('ipfsHash');
  
  if (isPeebleUrl && event.request.mode === 'navigate') {
    console.log('🔒 PWA: Intercepting Peeble URL navigation');
    
    event.respondWith(
      // First, try to find existing client
      clients.matchAll({ type: 'window' }).then(clients => {
        // If we have an existing client, focus it and send the data
        if (clients.length > 0) {
          const client = clients[0];
          client.focus();
          client.postMessage({
            type: 'NAVIGATE_TO_MESSAGE',
            messageId: params.get('messageId'),
            ipfsHash: params.get('ipfsHash'),
            url: url.href
          });
          
          // Return empty response to prevent new window
          return new Response('', { status: 204 });
        }
        
        // No existing client, serve the app
        return caches.match('./index.html');
      })
    );
    return;
  }
  
  // Regular caching for other requests
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
// sw.js - Fixed for GitHub Pages hosting

const CACHE_NAME = 'peeble-v1.0.0';
const STATIC_CACHE_NAME = 'peeble-static-v1.0.0';

// Get the base path for the app (works for both root and subpath hosting)
function getBasePath() {
    const location = self.location;
    const pathSegments = location.pathname.split('/').filter(segment => segment && segment !== 'sw.js');
    
    // If hosted at root (e.g., example.com), return './'
    if (pathSegments.length === 0) {
        return './';
    }
    
    // If hosted at subpath (e.g., username.github.io/repo-name/), return proper relative path
    return './' + (pathSegments.length > 0 ? '' : '');
}

// Updated cache assets with relative paths that work with GitHub Pages
const BASE_PATH = getBasePath();
const CACHE_ASSETS = [
    './',
    './index.html',
    './style.css', 
    './main.js',
    './services/audio.js',
    './services/encryption.js',
    './services/storage.js',
    './services/utils.js',
    './services/nfc.js',
    './services/pubsub.js',
    './services/state-manager.js',
    './services/audio-service-adapter.js',
    './components/debug-console.js',
    './components/voice-recorder.js',
    './components/message-player.js',
    './components/nfc-handler.js',
    './components/peeble-app.js',
    './manifest.json'
];

// Debug logging for service worker
function swLog(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const emoji = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '🔧';
    console.log(`[SW ${timestamp}] ${emoji} ${message}`);
}

// Install event - cache assets
self.addEventListener('install', (event) => {
    swLog('Service Worker installing...');
    swLog(`Base path detected: ${self.location.pathname}`);
    
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME)
            .then((cache) => {
                swLog('Caching app assets...');
                swLog(`Assets to cache: ${CACHE_ASSETS.join(', ')}`);
                return cache.addAll(CACHE_ASSETS);
            })
            .then(() => {
                swLog('App assets cached successfully', 'success');
                return self.skipWaiting(); // Activate immediately
            })
            .catch((error) => {
                swLog(`Failed to cache assets: ${error.message}`, 'error');
                // Continue anyway, don't block installation
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    swLog('Service Worker activating...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== STATIC_CACHE_NAME && cacheName !== CACHE_NAME) {
                            swLog(`Deleting old cache: ${cacheName}`);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                swLog('Service Worker activated', 'success');
                return self.clients.claim(); // Take control immediately
            })
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Handle Peeble URLs specifically
    if (isPeebleUrl(url)) {
        swLog(`🔒 Peeble URL detected: ${url.pathname}${url.hash}`);
        event.respondWith(handlePeebleRequest(event.request));
        return;
    }
    
    // Regular caching strategy for other requests
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                return fetch(event.request)
                    .then((response) => {
                        // Cache successful responses
                        if (response.status === 200) {
                            const responseClone = response.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    cache.put(event.request, responseClone);
                                });
                        }
                        return response;
                    });
            })
            .catch(() => {
                // Fallback for offline scenarios
                if (event.request.destination === 'document') {
                    return caches.match('./index.html') || caches.match('./');
                }
            })
    );
});

// Handle Peeble-specific URL requests
async function handlePeebleRequest(request) {
    const url = new URL(request.url);
    swLog(`🔍 Processing Peeble request: ${url.href}`);
    
    try {
        // Extract message parameters from URL
        const params = new URLSearchParams(url.hash.substring(1));
        const messageId = params.get('messageId');
        const ipfsHash = params.get('ipfsHash');
        
        if (messageId && ipfsHash) {
            swLog(`🔒 Valid Peeble message detected: ${messageId}`, 'success');
            
            // Check if we have an existing client (app window)
            const clients = await self.clients.matchAll({
                type: 'window',
                includeUncontrolled: true
            });
            
            const peebleClients = clients.filter(client => {
                const clientUrl = new URL(client.url);
                return clientUrl.origin === url.origin && 
                       clientUrl.pathname.includes('peeble') || 
                       clientUrl.pathname === url.pathname.split('/').slice(0, -1).join('/') + '/';
            });
            
            if (peebleClients.length > 0) {
                // Existing app window found - send message to it instead of opening new window
                swLog(`🔄 Routing to existing Peeble app window`, 'success');
                
                const existingClient = peebleClients[0];
                
                // Focus the existing window
                await existingClient.focus();
                
                // Send the new URL parameters to the existing app
                existingClient.postMessage({
                    type: 'PEEBLE_URL_NAVIGATION',
                    messageId: messageId,
                    ipfsHash: ipfsHash,
                    fullUrl: url.href,
                    timestamp: Date.now()
                });
                
                // Return a response that doesn't create a new window
                return new Response('', {
                    status: 204, // No Content
                    headers: {
                        'Content-Type': 'text/plain',
                        'X-Peeble-Routed': 'true'
                    }
                });
            } else {
                swLog(`🆕 No existing app window, serving fresh app`);
            }
        }
        
        // No existing window or invalid parameters - serve the main app
        const cachedApp = await caches.match('./index.html') || await caches.match('./');
        if (cachedApp) {
            swLog(`📱 Serving cached app for Peeble URL`);
            return cachedApp;
        } else {
            swLog(`🌐 Fetching fresh app for Peeble URL`);
            return fetch('./index.html').catch(() => fetch('./'));
        }
        
    } catch (error) {
        swLog(`❌ Error handling Peeble request: ${error.message}`, 'error');
        
        // Fallback to regular app
        const cachedApp = await caches.match('./index.html') || await caches.match('./');
        return cachedApp || fetch('./index.html').catch(() => fetch('./'));
    }
}

// Check if URL is a Peeble message URL
function isPeebleUrl(url) {
    const params = new URLSearchParams(url.hash.substring(1));
    const hasMessageId = params.has('messageId');
    const hasIpfsHash = params.has('ipfsHash');
    const noSerial = !params.has('serial'); // Security: Peeble URLs should not contain serial
    
    return hasMessageId && hasIpfsHash && noSerial;
}

// Handle messages from the main app
self.addEventListener('message', (event) => {
    const { data } = event;
    
    if (data.type === 'SKIP_WAITING') {
        swLog('Received SKIP_WAITING message');
        self.skipWaiting();
    }
    
    if (data.type === 'GET_VERSION') {
        event.ports[0].postMessage({ version: CACHE_NAME });
    }
    
    if (data.type === 'CACHE_NFC_RESPONSE') {
        // Cache NFC-related responses for faster access
        swLog(`🔒 Caching NFC response for faster access`);
        event.waitUntil(
            caches.open(CACHE_NAME)
                .then(cache => {
                    if (data.url && data.response) {
                        return cache.put(data.url, new Response(data.response));
                    }
                })
        );
    }
});

// Background sync for offline NFC operations
self.addEventListener('sync', (event) => {
    if (event.tag === 'nfc-operation') {
        swLog('🔄 Background sync: NFC operation');
        event.waitUntil(handleOfflineNfcOperation());
    }
});

// Handle offline NFC operations
async function handleOfflineNfcOperation() {
    // Placeholder for future offline NFC functionality
    swLog('📱 Processing offline NFC operations...');
    return Promise.resolve();
}

// Push notification handling (future feature)
self.addEventListener('push', (event) => {
    if (event.data) {
        const data = event.data.json();
        swLog(`📬 Push notification received: ${data.title}`);
        
        const options = {
            body: data.body,
            icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyIiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDE5MiAxOTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxOTIiIGhlaWdodD0iMTkyIiByeD0iMjQiIGZpbGw9IiM1YTY3ZDgiLz4KPC9zdmc+',
            badge: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyIiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDE5MiAxOTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxOTIiIGhlaWdodD0iMTkyIiByeD0iMjQiIGZpbGw9IiM1YTY3ZDgiLz4KPC9zdmc+',
            tag: 'peeble-notification',
            requireInteraction: true,
            actions: [
                {
                    action: 'open',
                    title: 'Open Peeble'
                }
            ]
        };
        
        event.waitUntil(
            self.registration.showNotification(data.title, options)
        );
    }
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
    swLog('🔔 Notification clicked');
    event.notification.close();
    
    if (event.action === 'open' || !event.action) {
        event.waitUntil(
            clients.matchAll({ type: 'window' })
                .then((clientList) => {
                    // Check if app is already open
                    for (const client of clientList) {
                        const clientUrl = new URL(client.url);
                        if (clientUrl.origin === self.location.origin) {
                            return client.focus();
                        }
                    }
                    // Open new window if not already open
                    return clients.openWindow('./');
                })
        );
    }
});

swLog('🚀 Peeble Service Worker loaded and ready!');
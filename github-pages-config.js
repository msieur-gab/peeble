// github-pages-config.js
// Configuration for GitHub Pages deployment

/**
 * GitHub Pages PWA Configuration
 * This file helps configure the app for GitHub Pages subdirectory deployment
 */

// Auto-detect GitHub Pages base path
function getBasePath() {
    const pathname = window.location.pathname;
    
    // For GitHub Pages: https://username.github.io/repository-name/
    if (pathname.includes('.github.io')) {
        const parts = pathname.split('/');
        if (parts.length >= 2 && parts[1]) {
            return `/${parts[1]}/`;
        }
    }
    
    // Fallback to current directory
    return './';
}

// Set global base path
window.PEEBLE_BASE_PATH = getBasePath();

console.log('🔧 GitHub Pages: Base path detected:', window.PEEBLE_BASE_PATH);

/**
 * Helper function to resolve paths for GitHub Pages
 * @param {string} path - Relative path
 * @returns {string} - Resolved path
 */
window.resolvePath = function(path) {
    if (path.startsWith('./')) {
        return window.PEEBLE_BASE_PATH + path.substring(2);
    }
    if (path.startsWith('/')) {
        return window.PEEBLE_BASE_PATH + path.substring(1);
    }
    return window.PEEBLE_BASE_PATH + path;
};

/**
 * Update manifest dynamically for GitHub Pages
 */
function updateManifestForGitHubPages() {
    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (manifestLink && window.PEEBLE_BASE_PATH !== './') {
        // Create dynamic manifest
        const manifest = {
            "name": "Peeble - Secure Voice Messages",
            "short_name": "Peeble",
            "description": "Decrypt and play secure voice messages using NFC stones",
            "start_url": window.PEEBLE_BASE_PATH,
            "display": "standalone",
            "background_color": "#667eea",
            "theme_color": "#5a67d8",
            "orientation": "portrait-primary",
            "scope": window.PEEBLE_BASE_PATH,
            "lang": "en-US",
            "icons": [
                {
                    "src": window.resolvePath("icons/icon-72x72.png"),
                    "sizes": "72x72",
                    "type": "image/png"
                },
                {
                    "src": window.resolvePath("icons/icon-96x96.png"), 
                    "sizes": "96x96",
                    "type": "image/png"
                },
                {
                    "src": window.resolvePath("icons/icon-128x128.png"),
                    "sizes": "128x128", 
                    "type": "image/png"
                },
                {
                    "src": window.resolvePath("icons/icon-144x144.png"),
                    "sizes": "144x144",
                    "type": "image/png"
                },
                {
                    "src": window.resolvePath("icons/icon-152x152.png"),
                    "sizes": "152x152",
                    "type": "image/png"
                },
                {
                    "src": window.resolvePath("icons/icon-192x192.png"),
                    "sizes": "192x192",
                    "type": "image/png",
                    "purpose": "any maskable"
                },
                {
                    "src": window.resolvePath("icons/icon-384x384.png"),
                    "sizes": "384x384",
                    "type": "image/png"
                },
                {
                    "src": window.resolvePath("icons/icon-512x512.png"),
                    "sizes": "512x512",
                    "type": "image/png"
                }
            ],
            "categories": ["communication", "social", "utilities"],
            "protocol_handlers": [
                {
                    "protocol": "web+peeble",
                    "url": window.PEEBLE_BASE_PATH + "?messageId=%s"
                }
            ],
            "prefer_related_applications": false,
            "share_target": {
                "action": window.resolvePath("share"),
                "method": "GET",
                "params": {
                    "title": "title",
                    "text": "text",
                    "url": "url"
                }
            }
        };
        
        // Create blob URL for dynamic manifest
        const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], {
            type: 'application/json'
        });
        const manifestUrl = URL.createObjectURL(manifestBlob);
        manifestLink.href = manifestUrl;
        
        console.log('🔧 GitHub Pages: Dynamic manifest created with base path:', window.PEEBLE_BASE_PATH);
    }
}

/**
 * Update service worker registration for GitHub Pages
 */
window.registerServiceWorkerForGitHubPages = async function() {
    if ('serviceWorker' in navigator) {
        try {
            const swPath = window.resolvePath('sw.js');
            const registration = await navigator.serviceWorker.register(swPath, {
                scope: window.PEEBLE_BASE_PATH
            });
            console.log('✅ GitHub Pages: Service worker registered with scope:', window.PEEBLE_BASE_PATH);
            return registration;
        } catch (error) {
            console.error('❌ GitHub Pages: Service worker registration failed:', error);
            throw error;
        }
    }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateManifestForGitHubPages);
} else {
    updateManifestForGitHubPages();
}

// Export configuration
window.GITHUB_PAGES_CONFIG = {
    basePath: window.PEEBLE_BASE_PATH,
    resolvePath: window.resolvePath,
    registerServiceWorker: window.registerServiceWorkerForGitHubPages
};
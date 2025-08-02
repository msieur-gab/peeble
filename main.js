// main.js - PWA Enhanced Version

import { debugLog } from './services/utils.js';
import { StorageService } from './services/storage.js';
import { stateManager } from './services/state-manager.js';
import { eventBus } from './services/pubsub.js';
import { AudioServiceAdapter } from './services/audio-service-adapter.js';

// Import all components to ensure they are registered
import './components/debug-console.js';
import './components/peeble-app.js';
import './components/nfc-handler.js';

// =======================================================
// === DEVELOPMENT SETUP: PINATA CREDENTIALS ===
// =======================================================
// Hardcoded for development/testing - fill these in:
const DEFAULT_PINATA_API_KEY = '54e63158b8fd4788f2ef'; // <-- Paste your API Key here
const DEFAULT_PINATA_SECRET = '9586c0caa8bc183e8023f7e3b34c5b1e5a4672ca94f0d4d4bdddf8b4fe50e906'; // <-- Paste your Secret here

// Set to true to force use hardcoded keys (ignore localStorage)
const FORCE_USE_HARDCODED_KEYS = true;
// =======================================================

let storageService; // Global instance of StorageService
let audioServiceAdapter; // Audio service adapter

/**
 * PWA-enhanced Pinata connection test
 * @global
 */
window.testPinataConnection = async function() {
    if (FORCE_USE_HARDCODED_KEYS) {
        debugLog('🔧 Development mode active - using hardcoded credentials. Test skipped.', 'info');
        document.getElementById('apiSetup').style.display = 'none';
        return;
    }

    debugLog('Initiating Pinata connection test from main.js...');
    const apiKeyInput = document.getElementById('pinataApiKey');
    const secretInput = document.getElementById('pinataSecret');
    
    const apiKey = apiKeyInput.value.trim();
    const secret = secretInput.value.trim();

    if (!apiKey || !secret) {
        debugLog('Pinata credentials missing.', 'error');
        return;
    }

    const testButton = document.querySelector('.api-input .btn-small');
    const originalButtonText = testButton.textContent;
    testButton.textContent = 'Testing...';
    testButton.disabled = true;

    try {
        storageService.setCredentials(apiKey, secret);
        const success = await storageService.testConnection();
        if (success) {
            // Update state and localStorage
            stateManager.setState({ pinataApiKey: apiKey, pinataSecret: secret });
            localStorage.setItem('pinataApiKey', apiKey);
            localStorage.setItem('pinataSecret', secret);
            
            // Set the storage service in state manager
            stateManager.setStorageService(storageService);
            
            document.getElementById('apiSetup').style.display = 'none';
            debugLog('Pinata connection successful!', 'success');
            debugLog('Pinata credentials saved and connection verified.', 'success');
        } else {
            debugLog('Pinata connection failed during test.', 'error');
        }
    } catch (error) {
        debugLog(`Pinata test error: ${error.message}`, 'error');
    } finally {
        testButton.textContent = originalButtonText;
        testButton.disabled = false;
    }
};

/**
 * Debug function to manually trigger NFC tag scan simulation
 * @global
 */
window.simulateNfcScan = function(serial = 'TEST-SERIAL-123', url = null) {
    debugLog(`🔧 DEBUG: Simulating NFC scan with serial: ${serial}, url: ${url || 'NONE'}`, 'warning');
    eventBus.publish('nfc-tag-scanned', { 
        url: url, 
        serial: serial 
    });
};

/**
 * Debug function to check current state
 * @global
 */
window.debugState = () => {
    const state = stateManager.getState();
    console.log('=== CURRENT STATE ===');
    console.log('App Mode:', state.appMode);
    console.log('Current Step:', state.currentStep);
    console.log('Tag Serial:', state.tagSerial ? `✅ ${state.tagSerial}` : '❌ Missing');
    console.log('Message ID:', state.messageId ? `✅ ${state.messageId}` : '❌ Missing');
    console.log('IPFS Hash:', state.ipfsHash ? `✅ ${state.ipfsHash.substring(0, 10)}...` : '❌ Missing');
    console.log('Storage Service:', state.storageService ? '✅ Present' : '❌ Missing');
    console.log('NFC Write Mode:', state.nfcWriteMode);
    console.log('Write URL Queue:', state.writeUrlQueue ? `✅ ${state.writeUrlQueue.substring(0, 30)}...` : '❌ Missing');
    console.log('Status Message:', state.statusMessage);
    console.log('PWA Mode:', isPWA() ? '✅ Installed App' : '🌐 Browser');
    return state;
};

/**
 * Debug function to force auto-load
 * @global
 */
window.forceAutoLoad = () => {
    debugLog('🔧 DEBUG: Forcing auto-load check...', 'warning');
    stateManager.checkAndTriggerAutoLoad();
};

/**
 * PWA Helper Functions
 */
function isPWA() {
    return window.matchMedia('(display-mode: standalone)').matches || 
           window.navigator.standalone === true;
}

function handlePWANavigation() {
    // Enhanced URL handling for PWA
    const currentUrl = new URL(window.location.href);
    const params = new URLSearchParams(currentUrl.hash.substring(1));
    
    debugLog(`📱 PWA: Handling navigation to ${currentUrl.href}`, 'info');
    
    if (params.has('messageId') && params.has('ipfsHash')) {
        debugLog('📱 PWA: URL contains message parameters, switching to reader mode', 'info');
        
        // Check for any stored physical key from previous scan
        const keyData = sessionStorage.getItem('peeble-physical-key');
        if (keyData) {
            try {
                const parsedKey = JSON.parse(keyData);
                debugLog(`📱 PWA: Found stored physical key: ${parsedKey.serial}`, 'success');
                
                // Use the stored key immediately
                eventBus.publish('nfc-tag-scanned', {
                    url: currentUrl.href,
                    serial: parsedKey.serial
                });
                return;
            } catch (error) {
                debugLog(`📱 PWA: Error parsing stored key: ${error.message}`, 'warning');
                sessionStorage.removeItem('peeble-physical-key');
            }
        }
        
        // No stored key, but we have URL params - wait for NFC scan
        debugLog('📱 PWA: No stored physical key, waiting for NFC scan...', 'info');
    }
}

/**
 * Enhanced NFC Event Handling for PWA
 */
function setupPWAEventHandlers() {
    // Handle browser navigation events (back/forward buttons)
    window.addEventListener('popstate', () => {
        debugLog('📱 PWA: Browser navigation detected', 'info');
        handlePWANavigation();
    });
    
    // Handle PWA-specific events
    window.addEventListener('appinstalled', () => {
        debugLog('📱 PWA: App installed, improving NFC handling', 'success');
        // Restart NFC scanning for better PWA integration
        setTimeout(() => {
            const nfcHandler = document.querySelector('nfc-handler');
            if (nfcHandler && nfcHandler.initNfc) {
                nfcHandler.initNfc();
            }
        }, 1000);
    });
    
    // Handle online/offline events for PWA
    window.addEventListener('online', () => {
        debugLog('📱 PWA: Back online, resuming full functionality', 'success');
        stateManager.setState({
            statusMessage: '📱 Connected - Full functionality restored',
            statusType: 'success'
        });
    });
    
    window.addEventListener('offline', () => {
        debugLog('📱 PWA: Offline mode - limited functionality', 'warning');
        stateManager.setState({
            statusMessage: '📱 Offline mode - Some features unavailable',
            statusType: 'warning'
        });
    });
}

/**
 * PWA Background Sync Setup
 */
function setupBackgroundSync() {
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
        // Register for background sync when messages need to be uploaded
        eventBus.subscribe('upload-pending-messages', async () => {
            try {
                const registration = await navigator.serviceWorker.ready;
                await registration.sync.register('upload-pending-messages');
                debugLog('📱 PWA: Background sync registered for pending uploads', 'info');
            } catch (error) {
                debugLog(`📱 PWA: Background sync registration failed: ${error.message}`, 'warning');
            }
        });
    }
}

/**
 * Main application initialization logic - PWA Enhanced
 */
document.addEventListener('DOMContentLoaded', () => {
    debugLog('📱 PWA: DOM Content Loaded. Initializing Enhanced Peeble App.');
    debugLog(`📱 PWA: Running in ${isPWA() ? 'standalone app' : 'browser'} mode`, 'info');

    // Setup PWA-specific event handlers
    setupPWAEventHandlers();
    setupBackgroundSync();

    // Enhanced NFC event tracking for PWA
    eventBus.subscribe('nfc-tag-scanned', (data) => {
        debugLog('📱 PWA: nfc-tag-scanned event received!', 'info');
        debugLog(`   Serial: ${data.serial || 'NULL'}`, 'info');
        debugLog(`   URL: ${data.url || 'NULL'}`, 'info');
        debugLog(`   PWA Mode: ${isPWA() ? 'Yes' : 'No'}`, 'info');
    });

    // Determine which credentials to use
    let pinataApiKey, pinataSecret;
    
    if (FORCE_USE_HARDCODED_KEYS && DEFAULT_PINATA_API_KEY && DEFAULT_PINATA_SECRET) {
        // Use hardcoded keys for development
        pinataApiKey = DEFAULT_PINATA_API_KEY;
        pinataSecret = DEFAULT_PINATA_SECRET;
        debugLog('🔧 DEVELOPMENT MODE: Using hardcoded Pinata credentials.', 'warning');
    } else {
        // Use stored credentials or fallback to defaults
        const state = stateManager.getState();
        pinataApiKey = state.pinataApiKey || DEFAULT_PINATA_API_KEY;
        pinataSecret = state.pinataSecret || DEFAULT_PINATA_SECRET;
    }

    // Initialize StorageService
    storageService = new StorageService(pinataApiKey, pinataSecret);

    // Initialize Audio Service Adapter
    audioServiceAdapter = new AudioServiceAdapter(eventBus);

    // Auto-configure storage service if we have valid credentials
    if (pinataApiKey && pinataSecret && pinataApiKey !== 'YOUR_PINATA_API_KEY_HERE') {
        // Update state manager with the credentials
        stateManager.setState({ 
            pinataApiKey: pinataApiKey, 
            pinataSecret: pinataSecret 
        });
        
        debugLog('📱 PWA: Setting StorageService in StateManager...', 'info');
        stateManager.setStorageService(storageService);
        debugLog('✅ StorageService automatically configured.', 'success');
        
        // Auto-hide API setup if using hardcoded keys
        if (FORCE_USE_HARDCODED_KEYS) {
            document.getElementById('apiSetup').style.display = 'none';
            debugLog('🔧 API setup hidden - using development credentials.', 'info');
        }
    } else {
        debugLog('⚠️ PWA: StorageService not configured - missing credentials', 'warning');
    }

    // Populate API key inputs (for UI display, even if using hardcoded)
    const apiKeyInput = document.getElementById('pinataApiKey');
    const secretInput = document.getElementById('pinataSecret');
    if (apiKeyInput) apiKeyInput.value = pinataApiKey;
    if (secretInput) secretInput.value = pinataSecret;

    // Hide API setup if credentials are configured
    const hasCredentials = pinataApiKey && pinataSecret && pinataApiKey !== 'YOUR_PINATA_API_KEY_HERE';
    if (hasCredentials) {
        document.getElementById('apiSetup').style.display = 'none';
        debugLog('Pinata credentials configured and ready.', 'success');
    } else {
        debugLog('⚠️ Pinata credentials needed. Please fill in DEFAULT_PINATA_API_KEY and DEFAULT_PINATA_SECRET in main.js', 'warning');
    }

    // Add event listeners for API key input changes (only if not forcing hardcoded)
    if (!FORCE_USE_HARDCODED_KEYS) {
        if (apiKeyInput) {
            apiKeyInput.addEventListener('change', (e) => {
                const newApiKey = e.target.value;
                stateManager.setState({ pinataApiKey: newApiKey });
                localStorage.setItem('pinataApiKey', newApiKey);
                storageService.setCredentials(newApiKey, storageService.secret);
                
                if (newApiKey && stateManager.getState().pinataSecret) {
                    stateManager.setStorageService(storageService);
                }
                
                debugLog('Pinata API Key updated.', 'info');
            });
        }
        
        if (secretInput) {
            secretInput.addEventListener('change', (e) => {
                const newSecret = e.target.value;
                stateManager.setState({ pinataSecret: newSecret });
                localStorage.setItem('pinataSecret', newSecret);
                storageService.setCredentials(storageService.apiKey, newSecret);
                
                if (newSecret && stateManager.getState().pinataApiKey) {
                    stateManager.setStorageService(storageService);
                }
                
                debugLog('Pinata Secret updated.', 'info');
            });
        }
    } else {
        // Disable inputs when using hardcoded keys
        if (apiKeyInput) {
            apiKeyInput.disabled = true;
            apiKeyInput.style.opacity = '0.6';
        }
        if (secretInput) {
            secretInput.disabled = true;
            secretInput.style.opacity = '0.6';
        }
    }

    // Initialize the main PeebleApp component
    const peebleApp = document.querySelector('peeble-app');
    if (peebleApp) {
        peebleApp.initialize({ stateManager, eventBus, storageService });
    } else {
        debugLog('PeebleApp component not found in the DOM.', 'error');
    }

    // Initialize NFC Handler with PWA enhancements
    const nfcHandler = document.querySelector('nfc-handler');
    if (nfcHandler) {
        nfcHandler.initialize({ stateManager, eventBus });
        debugLog('📱 PWA: NFC Handler initialized with PWA enhancements', 'info');
        
        // In PWA mode, give NFC a bit more time to initialize
        if (isPWA()) {
            setTimeout(() => {
                debugLog('📱 PWA: Delayed NFC initialization for PWA mode', 'info');
                if (nfcHandler.initNfc) {
                    nfcHandler.initNfc();
                }
            }, 500);
        }
    } else {
        debugLog('NFC Handler component not found in the DOM.', 'error');
    }

    // Handle initial PWA navigation
    setTimeout(() => {
        handlePWANavigation();
    }, 100);

    debugLog('🎉 PWA-Enhanced Peeble App initialization complete!');
    
    // Log current setup
    if (FORCE_USE_HARDCODED_KEYS) {
        debugLog(`🔧 DEVELOPMENT MODE ACTIVE - API Key: ${pinataApiKey.substring(0, 8)}...`, 'warning');
    }
    
    if (isPWA()) {
        debugLog('📱 PWA: Running as installed app - enhanced NFC handling active', 'success');
    }

    // Enhanced debugging tips for PWA
    setTimeout(() => {
        debugLog('🔧 PWA DEBUG TIPS:', 'info');
        debugLog('   1. simulateNfcScan("TEST-123") to test event flow', 'info');
        debugLog('   2. debugState() to check current state including PWA status', 'info');
        debugLog('   3. forceAutoLoad() to trigger manual load', 'info');
        if (isPWA()) {
            debugLog('   4. PWA mode active - better NFC handling enabled', 'success');
        } else {
            debugLog('   4. Consider installing as PWA for better NFC experience', 'warning');
        }
    }, 2000);
});

// For debugging purposes, expose key objects globally
window.eventBus = eventBus;
window.stateManager = stateManager;
window.isPWA = isPWA;
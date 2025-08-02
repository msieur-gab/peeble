// main.js - Complete version with PWA integration

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
 * Initializes the Pinata API credentials and tests the connection.
 * This function is exposed globally for the HTML button.
 * Note: In development mode with hardcoded keys, this may not be needed.
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

// =======================================================
// === PWA-SPECIFIC FUNCTIONS ===
// =======================================================

/**
 * PWA-specific initialization that should be called after the main app initialization
 */
function initPWAFeatures() {
    debugLog('🔧 PWA: Initializing PWA-specific features...');

    // Enhanced service worker messaging
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        setupServiceWorkerMessaging();
    }

    // Enhanced NFC handling for PWA
    setupPWANfcHandling();

    // PWA-specific state persistence
    setupPWAStatePersistence();

    // Performance monitoring
    setupPWAPerformanceMonitoring();

    debugLog('✅ PWA: PWA features initialized successfully', 'success');
}

/**
 * Enhanced service worker messaging for better URL handling
 */
function setupServiceWorkerMessaging() {
    navigator.serviceWorker.addEventListener('message', (event) => {
        const { data } = event;
        
        switch (data.type) {
            case 'PEEBLE_URL_NAVIGATION':
                handlePeebleUrlNavigation(data);
                break;
            case 'NFC_SERIAL_CAPTURED':
                handleNfcSerialFromSW(data);
                break;
            case 'CACHE_UPDATE':
                handleCacheUpdate(data);
                break;
        }
    });

    // Send app ready signal to service worker
    if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
            type: 'APP_READY',
            timestamp: Date.now(),
            url: window.location.href
        });
    }
}

/**
 * Handle Peeble URL navigation from service worker
 */
function handlePeebleUrlNavigation(data) {
    debugLog(`🔒 PWA: Processing URL navigation from Service Worker`, 'info');
    debugLog(`   Message ID: ${data.messageId}`, 'info');
    debugLog(`   IPFS Hash: ${data.ipfsHash}`, 'info');
    
    try {
        // Update browser URL without reloading
        const newUrl = `${window.location.origin}${window.location.pathname}#messageId=${data.messageId}&ipfsHash=${data.ipfsHash}`;
        
        // Only update if different from current URL
        if (window.location.href !== data.fullUrl) {
            history.pushState({ 
                messageId: data.messageId, 
                ipfsHash: data.ipfsHash,
                timestamp: data.timestamp 
            }, '', newUrl);
            
            debugLog(`🔒 PWA: URL updated to: ${newUrl}`, 'success');
        }

        // Trigger state manager to reinitialize with new URL
        if (window.stateManager) {
            // Force reinitialize from URL
            stateManager.setState({
                messageId: data.messageId,
                ipfsHash: data.ipfsHash,
                appMode: 'READER',
                currentStep: 'waiting',
                statusMessage: '🔒 Message received via PWA routing...'
            });
            
            // Reinitialize from URL to pick up the new parameters
            stateManager.initializeFromUrl();
            
            debugLog('🔒 PWA: State manager reinitialized with new message parameters', 'success');
        } else {
            debugLog('❌ PWA: State manager not available for URL navigation', 'error');
        }

        // Show user feedback
        if (window.debugLog) {
            debugLog(`🎉 PWA: Navigated to Peeble message ${data.messageId}`, 'success');
        }

    } catch (error) {
        debugLog(`❌ PWA: Error handling URL navigation: ${error.message}`, 'error');
    }
}

/**
 * Handle NFC serial captured from service worker
 */
function handleNfcSerialFromSW(data) {
    debugLog(`🔒 PWA: NFC serial received from Service Worker: ${data.serial}`, 'success');
    
    if (window.stateManager && data.serial) {
        stateManager.setState({
            tagSerial: data.serial,
            physicalKeyTimestamp: data.timestamp
        });
        
        debugLog('🔒 PWA: NFC serial set in state manager via Service Worker', 'success');
    }
}

/**
 * Handle cache updates from service worker
 */
function handleCacheUpdate(data) {
    debugLog(`🔧 PWA: Cache update received: ${data.message}`, 'info');
    
    if (data.requiresReload) {
        // Show update available notification
        if (window.pwaUtils) {
            window.pwaUtils.updateStatus('App update available - Refresh to apply', 'warning');
        }
    }
}

/**
 * PWA-specific NFC handling enhancements
 */
function setupPWANfcHandling() {
    // Enhanced NFC event handling for PWA context
    eventBus.subscribe('nfc-tag-scanned', (data) => {
        debugLog('🔒 PWA: Enhanced NFC tag processing...', 'info');
        
        // Store NFC data in session for PWA navigation scenarios
        if (data.serial) {
            try {
                const nfcData = {
                    serial: data.serial,
                    timestamp: Date.now(),
                    url: data.url,
                    source: 'pwa-nfc-handler'
                };
                
                sessionStorage.setItem('pwa-nfc-latest', JSON.stringify(nfcData));
                debugLog(`🔒 PWA: NFC data cached for PWA navigation scenarios`, 'success');
                
                // Send to service worker for caching
                if (navigator.serviceWorker.controller) {
                    navigator.serviceWorker.controller.postMessage({
                        type: 'CACHE_NFC_DATA',
                        data: nfcData
                    });
                }
                
            } catch (error) {
                debugLog(`⚠️ PWA: Error caching NFC data: ${error.message}`, 'warning');
            }
        }
        
        // Enhanced serial detection for PWA
        if (!data.serial || data.serial.startsWith('TEMP-')) {
            debugLog('🔍 PWA: Attempting to recover NFC serial from PWA session...', 'warning');
            
            try {
                const cachedNfc = sessionStorage.getItem('pwa-nfc-latest');
                if (cachedNfc) {
                    const nfcData = JSON.parse(cachedNfc);
                    const age = Date.now() - nfcData.timestamp;
                    
                    if (age < 10000) { // 10 seconds
                        debugLog(`🔒 PWA: Recovered NFC serial from cache: ${nfcData.serial}`, 'success');
                        data.serial = nfcData.serial;
                        
                        // Update the display immediately
                        const serialDisplay = document.getElementById('nfc-serial-display');
                        const serialNumberSpan = document.getElementById('serialNumber');
                        if (serialDisplay && serialNumberSpan) {
                            serialNumberSpan.textContent = nfcData.serial;
                            serialDisplay.style.display = 'block';
                        }
                    }
                }
            } catch (error) {
                debugLog(`⚠️ PWA: Error recovering NFC serial: ${error.message}`, 'warning');
            }
        }
    });

    // PWA-specific NFC retry logic
    let nfcRetryCount = 0;
    const maxNfcRetries = 3;
    
    eventBus.subscribe('nfc-serial-missing', () => {
        if (nfcRetryCount < maxNfcRetries) {
            nfcRetryCount++;
            debugLog(`🔄 PWA: NFC serial missing, retry ${nfcRetryCount}/${maxNfcRetries}`, 'warning');
            
            setTimeout(() => {
                // Try to recover from session storage
                const cachedNfc = sessionStorage.getItem('pwa-nfc-latest');
                if (cachedNfc) {
                    try {
                        const nfcData = JSON.parse(cachedNfc);
                        eventBus.publish('nfc-tag-scanned', {
                            url: nfcData.url,
                            serial: nfcData.serial
                        });
                        debugLog('🔒 PWA: NFC retry successful using cached data', 'success');
                    } catch (error) {
                        debugLog(`❌ PWA: NFC retry failed: ${error.message}`, 'error');
                    }
                }
            }, 1000 * nfcRetryCount); // Progressive delay
        }
    });
}

/**
 * PWA state persistence for better reliability
 */
function setupPWAStatePersistence() {
    // Save critical state to sessionStorage for PWA navigation scenarios
    eventBus.subscribe('state-change', (state) => {
        // Only persist critical data that helps with PWA navigation
        const persistentState = {
            appMode: state.appMode,
            messageId: state.messageId,
            ipfsHash: state.ipfsHash,
            tagSerial: state.tagSerial,
            timestamp: Date.now()
        };
        
        try {
            sessionStorage.setItem('pwa-app-state', JSON.stringify(persistentState));
        } catch (error) {
            debugLog(`⚠️ PWA: Error persisting state: ${error.message}`, 'warning');
        }
    });

    // Restore state on app initialization if needed
    try {
        const persistedState = sessionStorage.getItem('pwa-app-state');
        if (persistedState) {
            const state = JSON.parse(persistedState);
            const age = Date.now() - state.timestamp;
            
            if (age < 30000) { // 30 seconds
                debugLog('🔄 PWA: Restoring persisted state from previous session', 'info');
                
                if (stateManager && state.tagSerial) {
                    stateManager.setState({
                        tagSerial: state.tagSerial
                    });
                    debugLog(`🔒 PWA: Restored tag serial: ${state.tagSerial}`, 'success');
                }
            } else {
                // Clean up old state
                sessionStorage.removeItem('pwa-app-state');
            }
        }
    } catch (error) {
        debugLog(`⚠️ PWA: Error restoring persisted state: ${error.message}`, 'warning');
        sessionStorage.removeItem('pwa-app-state');
    }
}

/**
 * PWA performance monitoring
 */
function setupPWAPerformanceMonitoring() {
    // Monitor critical PWA metrics
    if ('performance' in window) {
        // Monitor navigation timing
        window.addEventListener('load', () => {
            setTimeout(() => {
                const perfData = performance.getEntriesByType('navigation')[0];
                if (perfData) {
                    debugLog(`📊 PWA Performance: Load time ${Math.round(perfData.loadEventEnd - perfData.fetchStart)}ms`, 'info');
                }
            }, 0);
        });

        // Monitor NFC operation timing
        let nfcStartTime;
        eventBus.subscribe('nfc-scan-start', () => {
            nfcStartTime = performance.now();
        });
        
        eventBus.subscribe('nfc-tag-scanned', () => {
            if (nfcStartTime) {
                const duration = performance.now() - nfcStartTime;
                debugLog(`📊 PWA Performance: NFC scan took ${Math.round(duration)}ms`, 'info');
            }
        });
    }

    // Monitor memory usage if available
    if ('memory' in performance) {
        setInterval(() => {
            const memory = performance.memory;
            const usedMB = Math.round(memory.usedJSHeapSize / 1024 / 1024);
            const limitMB = Math.round(memory.jsHeapSizeLimit / 1024 / 1024);
            
            if (usedMB > limitMB * 0.8) {
                debugLog(`⚠️ PWA Performance: High memory usage ${usedMB}MB/${limitMB}MB`, 'warning');
            }
        }, 30000); // Check every 30 seconds
    }
}

/**
 * PWA-specific debugging utilities
 */
window.pwaDiagnostics = {
    checkNfcState: () => {
        console.log('=== PWA NFC DIAGNOSTICS ===');
        console.log('Service Worker:', navigator.serviceWorker.controller ? '✅ Active' : '❌ Inactive');
        console.log('NFC API:', 'NDEFReader' in window ? '✅ Available' : '❌ Not Available');
        
        const cachedNfc = sessionStorage.getItem('pwa-nfc-latest');
        console.log('Cached NFC:', cachedNfc ? `✅ ${JSON.parse(cachedNfc).serial}` : '❌ None');
        
        const persistedState = sessionStorage.getItem('pwa-app-state');
        console.log('Persisted State:', persistedState ? '✅ Available' : '❌ None');
        
        const currentState = stateManager.getState();
        console.log('Current Serial:', currentState.tagSerial ? `✅ ${currentState.tagSerial}` : '❌ Missing');
        
        return {
            serviceWorker: !!navigator.serviceWorker.controller,
            nfcApi: 'NDEFReader' in window,
            cachedNfc: !!cachedNfc,
            persistedState: !!persistedState,
            currentSerial: !!currentState.tagSerial
        };
    },
    
    clearPWAData: () => {
        sessionStorage.removeItem('pwa-nfc-latest');
        sessionStorage.removeItem('pwa-app-state');
        sessionStorage.removeItem('peeble-physical-key');
        console.log('🧹 PWA data cleared');
    },
    
    simulatePWANavigation: (messageId, ipfsHash) => {
        handlePeebleUrlNavigation({
            type: 'PEEBLE_URL_NAVIGATION',
            messageId: messageId || 'TEST-PWA-123',
            ipfsHash: ipfsHash || 'QmTestPWAHash123',
            fullUrl: `${window.location.origin}/?test=pwa`,
            timestamp: Date.now()
        });
    }
};

// Export the PWA initialization function
window.initPWAFeatures = initPWAFeatures;

// =======================================================
// === MAIN APPLICATION INITIALIZATION ===
// =======================================================

/**
 * Main application initialization logic.
 * Runs when the DOM is fully loaded.
 */
document.addEventListener('DOMContentLoaded', () => {
    debugLog('DOM Content Loaded. Initializing Reactive Peeble App.');

    // FIX: Add event listener to track ALL nfc-tag-scanned events
    eventBus.subscribe('nfc-tag-scanned', (data) => {
        debugLog('🔍 MAIN.JS: nfc-tag-scanned event received!', 'info');
        debugLog(`   Serial: ${data.serial || 'NULL'}`, 'info');
        debugLog(`   URL: ${data.url || 'NULL'}`, 'info');
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
        
        debugLog('🔧 MAIN: Setting StorageService in StateManager...', 'info');
        stateManager.setStorageService(storageService);
        debugLog('✅ StorageService automatically configured.', 'success');
        
        // Auto-hide API setup if using hardcoded keys
        if (FORCE_USE_HARDCODED_KEYS) {
            document.getElementById('apiSetup').style.display = 'none';
            debugLog('🔧 API setup hidden - using development credentials.', 'info');
        }
    } else {
        debugLog('⚠️ MAIN: StorageService not configured - missing credentials', 'warning');
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
                
                // Update storage service in state if both credentials are present
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
                
                // Update storage service in state if both credentials are present
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

    // Initialize NFC Handler
    const nfcHandler = document.querySelector('nfc-handler');
    if (nfcHandler) {
        nfcHandler.initialize({ stateManager, eventBus });
        debugLog('🔍 NFC Handler initialized and ready for tag scanning', 'info');
    } else {
        debugLog('NFC Handler component not found in the DOM.', 'error');
    }

    debugLog('🎉 Reactive Peeble App initialization complete!');
    
    // Log current credential status
    if (FORCE_USE_HARDCODED_KEYS) {
        debugLog(`🔧 DEVELOPMENT MODE ACTIVE - API Key: ${pinataApiKey.substring(0, 8)}...`, 'warning');
    }

    // FIX: Add a helpful message for debugging NFC
    setTimeout(() => {
        debugLog('🔧 DEBUG TIP: If NFC scanning issues occur, try:', 'info');
        debugLog('   1. simulateNfcScan("TEST-123") to test event flow', 'info');
        debugLog('   2. debugState() to check current state', 'info');
        debugLog('   3. forceAutoLoad() to trigger manual load', 'info');
        debugLog('   4. pwaDiagnostics.checkNfcState() to check PWA NFC state', 'info');
    }, 2000);

    // Initialize PWA features after main app
    setTimeout(() => {
        debugLog('🔧 PWA: Starting PWA feature initialization...');
        initPWAFeatures();
    }, 1000);
});

// For debugging purposes, expose key objects globally
window.eventBus = eventBus;
window.stateManager = stateManager;
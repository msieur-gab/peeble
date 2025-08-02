// main.js - Complete version with simple PWA solution

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
// === SIMPLE PWA NAVIGATION SOLUTION ===
// =======================================================

/**
 * ✅ SIMPLE: Setup minimal PWA navigation handling
 */
function setupSimplePWANavigation() {
    debugLog('🔧 PWA: Setting up simple PWA navigation...', 'info');
    
    // Listen for messages from service worker
    if (navigator.serviceWorker) {
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data.type === 'NAVIGATE_TO_MESSAGE') {
                debugLog('🔒 PWA: Received navigation message from service worker', 'success');
                debugLog(`   MessageId: ${event.data.messageId}`, 'info');
                debugLog(`   IpfsHash: ${event.data.ipfsHash}`, 'info');
                
                // Update URL without triggering navigation
                const newUrl = `${window.location.origin}${window.location.pathname}#messageId=${event.data.messageId}&ipfsHash=${event.data.ipfsHash}`;
                history.replaceState({}, '', newUrl);
                
                // Update state manager to handle the new message
                if (window.stateManager) {
                    stateManager.setState({
                        messageId: event.data.messageId,
                        ipfsHash: event.data.ipfsHash,
                        appMode: 'READER',
                        currentStep: 'waiting',
                        statusMessage: '🔒 Loading message via PWA routing...'
                    });
                    stateManager.initializeFromUrl();
                    
                    debugLog('✅ PWA: Navigation completed successfully', 'success');
                } else {
                    debugLog('❌ PWA: State manager not available', 'error');
                }
            }
        });
    }
    
    // Simple hash change handler for direct URL access
    window.addEventListener('hashchange', () => {
        const params = new URLSearchParams(window.location.hash.substring(1));
        if (params.has('messageId') && params.has('ipfsHash') && window.stateManager) {
            debugLog('🔄 PWA: Hash change detected - processing Peeble message', 'info');
            stateManager.setState({
                messageId: params.get('messageId'),
                ipfsHash: params.get('ipfsHash'),
                appMode: 'READER',
                currentStep: 'waiting',
                statusMessage: '🔒 Processing hash change navigation...'
            });
            stateManager.initializeFromUrl();
        }
    });
    
    debugLog('✅ PWA: Simple navigation setup complete', 'success');
}

// =======================================================
// === MAIN APPLICATION INITIALIZATION ===
// =======================================================

/**
 * Main application initialization logic.
 * Runs when the DOM is fully loaded.
 */
document.addEventListener('DOMContentLoaded', () => {
    debugLog('DOM Content Loaded. Initializing Reactive Peeble App.');

    // Add event listener to track ALL nfc-tag-scanned events
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

    // Add helpful debug tips
    setTimeout(() => {
        debugLog('🔧 DEBUG TIP: If NFC scanning issues occur, try:', 'info');
        debugLog('   1. simulateNfcScan("TEST-123") to test event flow', 'info');
        debugLog('   2. debugState() to check current state', 'info');
        debugLog('   3. forceAutoLoad() to trigger manual load', 'info');
    }, 2000);

    // ✅ CRITICAL: Initialize simple PWA navigation
    setupSimplePWANavigation();
    
    // Check if we're in PWA mode
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                 window.navigator.standalone === true;
    
    if (isPWA) {
        debugLog('📱 PWA: Running in PWA mode - NFC routing should work!', 'success');
    } else {
        debugLog('🌐 PWA: Running in browser mode - install PWA for better NFC routing', 'warning');
    }
    
    // Check service worker status
    if (navigator.serviceWorker) {
        navigator.serviceWorker.ready.then(() => {
            debugLog('🔧 PWA: Service worker is ready', 'success');
        });
    }
});

// For debugging purposes, expose key objects globally
window.eventBus = eventBus;
window.stateManager = stateManager;
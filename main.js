// main.js

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
const DEFAULT_PINATA_API_KEY = 'YOUR_PINATA_API_KEY_HERE'; // <-- Paste your API Key here
const DEFAULT_PINATA_SECRET = 'YOUR_PINATA_SECRET_HERE'; // <-- Paste your Secret here

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
 * Main application initialization logic.
 * Runs when the DOM is fully loaded.
 */
document.addEventListener('DOMContentLoaded', () => {
    debugLog('DOM Content Loaded. Initializing Reactive Peeble App.');

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
    } else {
        debugLog('NFC Handler component not found in the DOM.', 'error');
    }

    debugLog('🎉 Reactive Peeble App initialization complete!');
    
    // Log current credential status
    if (FORCE_USE_HARDCODED_KEYS) {
        debugLog(`🔧 DEVELOPMENT MODE ACTIVE - API Key: ${pinataApiKey.substring(0, 8)}...`, 'warning');
    }
});

// For debugging purposes, expose key objects globally
window.eventBus = eventBus;
window.stateManager = stateManager;

// Debug helper functions
window.debugState = () => {
    const state = stateManager.getState();
    console.log('=== CURRENT STATE ===');
    console.log('App Mode:', state.appMode);
    console.log('Current Step:', state.currentStep);
    console.log('Tag Serial:', state.tagSerial ? '✅ Present' : '❌ Missing');
    console.log('Message ID:', state.messageId ? '✅ Present' : '❌ Missing');
    console.log('IPFS Hash:', state.ipfsHash ? '✅ Present' : '❌ Missing');
    console.log('Storage Service:', state.storageService ? '✅ Present' : '❌ Missing');
    console.log('NFC Write Mode:', state.nfcWriteMode);
    console.log('Write URL Queue:', state.writeUrlQueue ? '✅ Present' : '❌ Missing');
    console.log('Status Message:', state.statusMessage);
    return state;
};

window.testAutoLoad = () => {
    console.log('=== TESTING AUTO-LOAD ===');
    stateManager.checkAndTriggerAutoLoad();
};

window.testNfcWrite = (url = 'https://example.com/test') => {
    console.log('Testing NFC write with URL:', url);
    eventBus.publish('start-nfc-write', url);
    console.log('Published start-nfc-write event. Check state with debugState()');
};

window.forceLoadMessage = () => {
    console.log('=== FORCE LOADING MESSAGE ===');
    eventBus.publish('load-secure-message');
};
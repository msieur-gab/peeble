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
// === DEMO SETUP: ENTER PINATA CREDENTIALS HERE ===
// =======================================================
// For a quick demo, paste your Pinata API credentials here.
const DEFAULT_PINATA_API_KEY = ''; // <-- Paste your API Key here
const DEFAULT_PINATA_SECRET = ''; // <-- Paste your Secret here
// =======================================================

let storageService; // Global instance of StorageService
let audioServiceAdapter; // Audio service adapter

/**
 * Initializes the Pinata API credentials and tests the connection.
 * This function is exposed globally for the HTML button.
 * @global
 */
window.testPinataConnection = async function() {
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

    // Initialize StorageService with credentials from state manager
    const { pinataApiKey, pinataSecret } = stateManager.getState();
    storageService = new StorageService(
        pinataApiKey || DEFAULT_PINATA_API_KEY, 
        pinataSecret || DEFAULT_PINATA_SECRET
    );

    // Initialize Audio Service Adapter
    audioServiceAdapter = new AudioServiceAdapter(eventBus);

    // Set the storage service in state manager if credentials are available
    if (pinataApiKey && pinataSecret) {
        stateManager.setStorageService(storageService);
        debugLog('StorageService automatically configured with saved credentials.', 'success');
    }

    // Populate API key inputs if saved
    const apiKeyInput = document.getElementById('pinataApiKey');
    const secretInput = document.getElementById('pinataSecret');
    if (apiKeyInput) apiKeyInput.value = pinataApiKey || DEFAULT_PINATA_API_KEY;
    if (secretInput) secretInput.value = pinataSecret || DEFAULT_PINATA_SECRET;

    // Hide API setup if credentials are already present
    const hasCredentials = !!pinataApiKey && !!pinataSecret;
    if (hasCredentials) {
        document.getElementById('apiSetup').style.display = 'none';
        debugLog('Saved Pinata credentials loaded automatically.', 'success');
    } else {
        debugLog('Pinata credentials not found. Please enter them.', 'warning');
    }

    // Add event listeners for API key input changes to save them
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
            
            debugLog('Pinata API Key updated in localStorage.', 'info');
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
            
            debugLog('Pinata Secret updated in localStorage.', 'info');
        });
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
});

// For debugging purposes, expose key objects globally
window.eventBus = eventBus;
window.stateManager = stateManager;
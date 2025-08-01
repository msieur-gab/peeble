// main.js

import { debugLog } from './services/utils.js';
import { StorageService } from './services/storage.js';
import { stateManager } from './services/state-manager.js'; // Import state manager
import { eventBus } from './services/pubsub.js'; // Import event bus

// Import all components to ensure they are registered
import './components/debug-console.js';
import './components/peeble-app.js';
import './components/voice-recorder.js';
import './components/message-player.js';
import './components/nfc-handler.js';

// =======================================================
// === DEMO SETUP: ENTER PINATA CREDENTIALS HERE ===
// =======================================================
// For a quick demo, paste your Pinata API credentials here.
const DEFAULT_PINATA_API_KEY = ''; // <-- Paste your API Key here
const DEFAULT_PINATA_SECRET = ''; // <-- Paste your Secret here
// =======================================================

let storageService; // Global instance of StorageService
let peebleApp; // Reference to the main component

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
    debugLog('DOM Content Loaded. Initializing Peeble App.');

    // Initialize StorageService with credentials from state manager
    const { pinataApiKey, pinataSecret } = stateManager.getState();
    storageService = new StorageService(pinataApiKey || DEFAULT_PINATA_API_KEY, pinataSecret || DEFAULT_PINATA_SECRET);

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
            stateManager.setState({ pinataApiKey: e.target.value });
            localStorage.setItem('pinataApiKey', e.target.value);
            storageService.setCredentials(e.target.value, storageService.secret);
            debugLog('Pinata API Key updated in localStorage.', 'info');
        });
    }
    if (secretInput) {
        secretInput.addEventListener('change', (e) => {
            stateManager.setState({ pinataSecret: e.target.value });
            localStorage.setItem('pinataSecret', e.target.value);
            storageService.setCredentials(storageService.apiKey, e.target.value);
            debugLog('Pinata Secret updated in localStorage.', 'info');
        });
    }

    // Get the main PeebleApp component
    peebleApp = document.querySelector('peeble-app');
    if (peebleApp) {
        // Pass the singletons to the main component
        peebleApp.initialize({ stateManager, eventBus, storageService });
    } else {
        debugLog('PeebleApp component not found in the DOM.', 'error');
    }

    // Initialize NFC Handler - it will start scanning on its own
    const nfcHandler = document.querySelector('nfc-handler');
    if (!nfcHandler) {
        debugLog('NFC Handler component not found in the DOM.', 'error');
    }

    debugLog('Peeble App initialization complete.');
});
// For debugging purposes, expose the eventBus globally
window.eventBus = eventBus; 
// main.js

import { debugLog } from './services/utils.js';
import { StorageService } from './services/storage.js';

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
// These will be used if no credentials are saved in localStorage.
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
        storageService.setCredentials(apiKey, secret); // Update credentials in the service
        const success = await storageService.testConnection();
        if (success) {
            localStorage.setItem('pinataApiKey', apiKey);
            localStorage.setItem('pinataSecret', secret);
            document.getElementById('apiSetup').style.display = 'none'; // Hide setup on success
            debugLog('Pinata connection successful!', 'success');
            debugLog('Pinata credentials saved and connection verified.', 'success');
            
            // Pass the service to the component and trigger initialization
            if (peebleApp) {
                peebleApp.setStorageService(storageService);
            }
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

    // Initialize StorageService with credentials from localStorage or defaults
    const savedApiKey = localStorage.getItem('pinataApiKey') || DEFAULT_PINATA_API_KEY;
    const savedSecret = localStorage.getItem('pinataSecret') || DEFAULT_PINATA_SECRET;
    storageService = new StorageService(savedApiKey || '', savedSecret || '');

    // Populate API key inputs if saved
    const apiKeyInput = document.getElementById('pinataApiKey');
    const secretInput = document.getElementById('pinataSecret');
    if (apiKeyInput) apiKeyInput.value = savedApiKey || '';
    if (secretInput) secretInput.value = savedSecret || '';

    // Hide API setup if credentials are already present
    const hasCredentials = !!savedApiKey && !!savedSecret;
    if (hasCredentials) {
        document.getElementById('apiSetup').style.display = 'none';
        debugLog('Saved Pinata credentials loaded automatically.', 'success');
    } else {
        debugLog('Pinata credentials not found. Please enter them.', 'warning');
    }

    // Add event listeners for API key input changes to save them
    if (apiKeyInput) {
        apiKeyInput.addEventListener('change', (e) => {
            localStorage.setItem('pinataApiKey', e.target.value);
            storageService.setCredentials(e.target.value, storageService.secret);
            debugLog('Pinata API Key updated in localStorage.', 'info');
        });
    }
    if (secretInput) {
        secretInput.addEventListener('change', (e) => {
            localStorage.setItem('pinataSecret', e.target.value);
            storageService.setCredentials(storageService.apiKey, e.target.value);
            debugLog('Pinata Secret updated in localStorage.', 'info');
        });
    }

    // Get the main PeebleApp component
    peebleApp = document.querySelector('peeble-app');
    if (peebleApp) {
        // Always set the service, whether credentials exist or not.
        // The PeebleApp component's logic will handle mode switching.
        peebleApp.setStorageService(storageService);
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

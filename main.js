// main.js

import { debugLog, showStatus } from './services/utils.js';
import { StorageService } from './services/storage.js';

// Import all components to ensure they are registered
import './components/debug-console.js';
import './components/peeble-app.js';
import './components/voice-recorder.js';
import './components/message-player.js';
import './components/nfc-handler.js';

let storageService; // Global instance of StorageService

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
        showStatus('Please enter both Pinata API key and secret.', 'error');
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
            showStatus('Pinata connection successful!', 'success');
            debugLog('Pinata credentials saved and connection verified.', 'success');
            
            // Re-initialize the PeebleApp now that StorageService is ready
            const peebleApp = document.querySelector('peeble-app');
            if (peebleApp) {
                peebleApp.setStorageService(storageService);
            }
        } else {
            showStatus('Pinata connection failed. Check credentials.', 'error');
            debugLog('Pinata connection failed during test.', 'error');
        }
    } catch (error) {
        showStatus(`Pinata test error: ${error.message}`, 'error');
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

    // Initialize StorageService
    const savedApiKey = localStorage.getItem('pinataApiKey');
    const savedSecret = localStorage.getItem('pinataSecret');
    storageService = new StorageService(savedApiKey || '', savedSecret || '');

    // Populate API key inputs if saved
    const apiKeyInput = document.getElementById('pinataApiKey');
    const secretInput = document.getElementById('pinataSecret');
    if (apiKeyInput) apiKeyInput.value = savedApiKey || '';
    if (secretInput) secretInput.value = savedSecret || '';

    // Hide API setup if credentials are already present
    if (savedApiKey && savedSecret) {
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

    // Get the main PeebleApp component and pass the storage service
    const peebleApp = document.querySelector('peeble-app');
    if (peebleApp) {
        peebleApp.setStorageService(storageService);
    } else {
        debugLog('PeebleApp component not found in the DOM.', 'error');
    }

    // Initialize NFC Handler - it will start scanning on its own
    // The NFC handler will dispatch events that peeble-app listens to for mode switching.
    const nfcHandler = document.querySelector('nfc-handler');
    if (!nfcHandler) {
        debugLog('NFC Handler component not found in the DOM.', 'error');
    }

    debugLog('Peeble App initialization complete.');
    showStatus('Peeble app loaded. Configure Pinata API if needed.', 'info');
});

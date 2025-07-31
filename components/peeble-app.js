// components/peeble-app.js

import { URLParser, debugLog } from '../services/utils.js';
import { StorageService } from '../services/storage.js'; // Import StorageService
// Import components so they are defined
import './voice-recorder.js';
import './message-player.js';

/**
 * The main application Web Component.
 * It determines the app mode (creation or reading) based on URL parameters
 * and renders the appropriate sub-component (voice-recorder or message-player).
 */
class PeebleApp extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        this.storageService = null; // Will be initialized globally and passed
        this.currentMode = null;

        this.render(); // Render initial empty state
        this.setupEventListeners();
    }

    /**
     * Sets the StorageService instance. Called from main.js.
     * @param {StorageService} service
     */
    setStorageService(service) {
        this.storageService = service;
        debugLog('StorageService set in PeebleApp.');
        // Once storageService is available, initialize the mode
        this.initializeMode();
    }

    /**
     * Renders the initial structure. Content will be dynamically added.
     * @private
     */
    render() {
        this.shadowRoot.innerHTML = `
            <style>
                /* Import global styles */
                @import '../style.css';

                /* Basic styling for the app container */
                .app-content {
                    min-height: 300px; /* Ensure some height even when empty */
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    flex-direction: column;
                }
                .status-container {
                    width: 100%;
                    padding: 0 20px;
                    margin-bottom: 20px;
                }
            </style>
            <div class="app-content-wrapper">
                <div class="status-container">
                    <div id="status" class="status">Loading Peeble app...</div>
                </div>
                <div class="app-content" id="appContent">
                </div>
            </div>
        `;
        this.appContent = this.shadowRoot.getElementById('appContent');
        this.statusDiv = this.shadowRoot.getElementById('status');
    }
    
    /**
     * Displays a status message to the user.
     * @param {string} message - The message to display.
     * @param {'info'|'success'|'warning'|'error'} [type='info'] - The type of status message.
     * @param {number} [duration=5000] - How long the message should be displayed in milliseconds.
     */
    showStatus(message, type = 'info', duration = 5000) {
        if (this.statusDiv) {
            this.statusDiv.textContent = message;
            this.statusDiv.className = `status ${type}`; // Apply CSS class for styling

            if (duration > 0) {
                setTimeout(() => {
                    // Only clear if the current message is still the one we set
                    if (this.statusDiv.textContent === message) {
                        this.statusDiv.className = 'status'; // Reset to default style
                        this.statusDiv.textContent = 'Ready for action'; // Default message
                    }
                }, duration);
            }
        } else {
            debugLog(`Status display element not found inside PeebleApp.`, 'warning');
        }
    }


    /**
     * Sets up event listeners for mode changes.
     * @private
     */
    setupEventListeners() {
        // Listen for events from NFC handler or other components to switch modes
        window.addEventListener('blank-nfc-scanned', (event) => this.switchToCreatorMode(event.detail.serial));
        window.addEventListener('close-player', () => this.switchToCreatorMode()); // After playing, go back to creator
        window.addEventListener('nfc-write-complete', () => this.switchToCreatorMode()); // After writing, go back to creator
    }

    /**
     * Determines the initial app mode based on URL parameters and renders the appropriate component.
     * @public
     */
    initializeMode() {
        if (!this.storageService) {
            debugLog('StorageService not yet available, delaying mode initialization.', 'warning');
            return; // Wait for StorageService to be set
        }

        const params = URLParser.getParams();
        
        if (params.serial && params.messageId && params.timestamp) {
            debugLog('URL parameters found. Switching to Reading Mode.');
            this.switchToReaderMode(params);
        } else {
            debugLog('No URL parameters found. Switching to Creation Mode.');
            this.switchToCreatorMode();
        }
    }

    /**
     * Switches the app to Creation Mode (voice recorder).
     * @param {string|null} serial - The NFC tag's serial number, if available.
     * @private
     */
    switchToCreatorMode(serial = null) {
        if (this.currentMode === 'CREATOR') {
            debugLog('Already in Creator Mode. No change needed.', 'info');
            return;
        }
        debugLog(`Switching to Creator Mode. Serial: ${serial}`);
        this.appContent.innerHTML = `<voice-recorder></voice-recorder>`;
        
        // Wait for the next tick to ensure the component is in the DOM
        setTimeout(() => {
            // Dispatch a custom event with the serial number
            window.dispatchEvent(new CustomEvent('set-serial', { detail: { serial: serial } }));
        }, 0);
        
        this.currentMode = 'CREATOR';
        this.showStatus('Ready to create a new Peeble message.', 'info');
    }

    /**
     * Switches the app to Reading Mode (message player).
     * @param {object} params - The URL parameters (serial, messageId, timestamp).
     * @private
     */
    switchToReaderMode(params) {
        if (this.currentMode === 'READER') {
            debugLog('Already in Reader Mode. No change needed.', 'info');
            // If parameters are different, the message-player's attributeChangedCallback will handle reload
            const existingPlayer = this.appContent.querySelector('message-player');
            if (existingPlayer) {
                // Update attributes to trigger reload if needed
                existingPlayer.setAttribute('serial', params.serial);
                existingPlayer.setAttribute('message-id', params.messageId);
                existingPlayer.setAttribute('timestamp', params.timestamp);
            }
            return;
        }
        debugLog('Switching to Reader Mode.');
        this.appContent.innerHTML = `
            <message-player 
                serial="${params.serial}" 
                message-id="${params.messageId}" 
                timestamp="${params.timestamp}">
            </message-player>
        `;
        const messagePlayer = this.appContent.querySelector('message-player');
        if (messagePlayer) {
            messagePlayer.setStorageService(this.storageService);
        }
        this.currentMode = 'READER';
        this.showStatus('Loading your Peeble message...', 'info');
    }
}

customElements.define('peeble-app', PeebleApp);

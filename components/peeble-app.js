// components/peeble-app.js

import { URLParser, debugLog } from '../services/utils.js';
import { StorageService } from '../services/storage.js';
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

        this.stateManager = null;
        this.eventBus = null;
        this.storageService = null;
        this.unsubscribe = null;

        // Render initial structure, it will show "Loading..."
        this.render();
    }

    /**
     * Initializes the app with the singleton services.
     * @param {{stateManager: import('../services/state-manager.js').StateManager, eventBus: import('../services/pubsub.js').EventBus, storageService: StorageService}} services
     */
    initialize(services) {
        this.stateManager = services.stateManager;
        this.eventBus = services.eventBus;
        this.storageService = services.storageService;
        debugLog('Services set in PeebleApp.'); //

        this.setupStateSubscription();
        this.initializeMode();
        
        // === THE FIX IS HERE ===
        // Manually trigger the first render based on the initial state
        this.handleStateChange(this.stateManager.getState());
        // =======================
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
                    min-height: 300px;
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
     * Sets up the subscription to state changes.
     * @private
     */
    setupStateSubscription() {
        // Unsubscribe from previous subscription if it exists
        if (this.unsubscribe) {
            this.unsubscribe();
        }

        // Subscribe to state changes
        this.unsubscribe = this.eventBus.subscribe('state-change', (state) => {
            this.handleStateChange(state);
        });

        // Also listen for specific events to trigger state changes
        this.eventBus.subscribe('blank-nfc-scanned', (serial) => {
            this.stateManager.setState({ appMode: 'CREATOR', tagSerial: serial });
        });
        this.eventBus.subscribe('close-player', () => {
            this.stateManager.setState({ appMode: 'CREATOR', tagSerial: null });
        });
    }

    /**
     * Handles state changes and updates the UI accordingly.
     * @param {object} state - The full updated state object.
     * @private
     */
    handleStateChange(state) {
        debugLog('PeebleApp received state change.', 'info');
        const { appMode, tagSerial, pinataApiKey, pinataSecret } = state;

        if (appMode === 'READER') {
            this.renderReaderMode();
        } else {
            this.renderCreatorMode(tagSerial);
        }

        // Propagate services down to child components
        this.passServicesToChild(pinataApiKey, pinataSecret);
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
            this.statusDiv.className = `status ${type}`;

            if (duration > 0) {
                setTimeout(() => {
                    if (this.statusDiv.textContent === message) {
                        this.statusDiv.className = 'status';
                        this.statusDiv.textContent = 'Ready for action';
                    }
                }, duration);
            }
        } else {
            debugLog(`Status display element not found inside PeebleApp.`, 'warning');
        }
    }


    /**
     * Determines the initial app mode based on URL parameters and sets the state.
     * @public
     */
    initializeMode() {
        if (!this.storageService) {
            debugLog('StorageService not yet available, delaying mode initialization.', 'warning');
            return;
        }

        const params = URLParser.getParams();
        
        if (params.serial && params.messageId && params.timestamp) {
            debugLog('URL parameters found. Switching to Reading Mode.');
            this.stateManager.setState({ appMode: 'READER', tagSerial: params.serial });
        } else {
            debugLog('No URL parameters found. Switching to Creation Mode.');
            this.stateManager.setState({ appMode: 'CREATOR', tagSerial: null });
        }
    }

    /**
     * Renders the Voice Recorder component.
     * @param {string|null} serial - The NFC tag's serial number.
     * @private
     */
    renderCreatorMode(serial) {
        debugLog(`Rendering Creator Mode. Serial: ${serial}`);
        this.appContent.innerHTML = `<voice-recorder serial="${serial || ''}"></voice-recorder>`;
        this.showStatus('Ready to create a new Peeble message.', 'info');
    }

    /**
     * Renders the Message Player component.
     * @private
     */
    renderReaderMode() {
        debugLog('Rendering Reader Mode.');
        const params = URLParser.getParams();
        this.appContent.innerHTML = `
            <message-player 
                serial="${params.serial}" 
                message-id="${params.messageId}" 
                timestamp="${params.timestamp}">
            </message-player>
        `;
        this.showStatus('Loading your Peeble message...', 'info');
    }
    
    /**
     * Passes services to the currently active child component.
     * @param {string} apiKey - Pinata API Key
     * @param {string} secret - Pinata Secret
     * @private
     */
    passServicesToChild(apiKey, secret) {
        this.storageService.setCredentials(apiKey, secret);
        
        const childComponent = this.appContent.firstElementChild;
        if (childComponent && typeof childComponent.setStorageService === 'function') {
            childComponent.setStorageService(this.storageService);
        }
    }
}

customElements.define('peeble-app', PeebleApp);
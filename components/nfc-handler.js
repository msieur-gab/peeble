// components/nfc-handler.js

import { NFCService } from '../services/nfc.js';
import { debugLog } from '../services/utils.js';

/**
 * Web Component responsible for initiating and managing NFC scanning and writing.
 * It dispatches events to the main application to indicate NFC tag reads or write requests.
 */
class NFCHandler extends HTMLElement {
    constructor() {
        super();
        // No Shadow DOM needed as this component is primarily for logic and event dispatching.
        // this.attachShadow({ mode: 'open' }); 

        this.nfcService = new NFCService();
        this.writeUrlQueue = null; // Stores the URL to be written when in write mode

        // Bind NFC service callbacks
        this.nfcService.onNfcTagScanned = this.handleNfcTagScanned.bind(this);
        this.nfcService.onNfcError = this.handleNfcError.bind(this);

        this.render(); // Render a simple indicator
        this.setupEventListeners();
        this.initNfc();
    }

    /**
     * Renders a simple indicator for NFC status.
     * @private
     */
    render() {
        this.innerHTML = `
            <div id="nfc-status-indicator" style="text-align: center; margin-top: 20px; color: var(--secondary-color); font-size: 0.9em;">
                NFC Status: Initializing...
            </div>
        `;
        this.statusIndicator = this.querySelector('#nfc-status-indicator');
    }

    /**
     * Sets up event listeners for custom events from other components.
     * @private
     */
    setupEventListeners() {
        // Listen for requests to start NFC writing from the voice-recorder
        window.addEventListener('start-nfc-write', this.handleStartNfcWrite.bind(this));
        // Listen for requests to stop NFC writing (e.g., when user creates another message)
        window.addEventListener('stop-nfc-write', this.handleStopNfcWrite.bind(this));
    }

    /**
     * Initializes NFC scanning when the component is connected.
     * @private
     */
    connectedCallback() {
        debugLog('NFC Handler connected to DOM.');
        // NFC scanning should ideally start as soon as the app loads to detect tags
        // this.initNfc(); // Already called in constructor
    }

    /**
     * Initializes the NFC service and starts scanning if supported.
     * @private
     */
    initNfc() {
        const support = this.nfcService.isSupported();
        let statusMessage = 'NFC Status: Initializing...';

        if (support.read && (support.write || support.legacyWrite)) {
            statusMessage = 'NFC Status: Fully supported. Tap a Peeble to scan.';
            this.nfcService.startScanning();
        } else if (support.read) {
            statusMessage = 'NFC Status: Read-only supported. Writing is not available.';
            this.nfcService.startScanning();
        } else {
            statusMessage = 'NFC Status: Not supported on this device.';
            debugLog('NFC API not supported.', 'warning');
        }

        this.statusIndicator.textContent = statusMessage;
        debugLog(statusMessage, 'info');
    }

    /**
     * Handles an NFC tag being scanned.
     * @param {string|null} url - The URL extracted from the NDEF record, or null if no URL found.
     * @private
     */
    handleNfcTagScanned(url) {
        if (this.writeUrlQueue) {
            // If we are in write mode, attempt to write the URL
            debugLog(`NFC tag scanned while in write mode. Attempting to write URL: ${this.writeUrlQueue}`);
            this.writeToNfcTag(this.writeUrlQueue);
            this.writeUrlQueue = null; // Clear the queue after attempting write
        } else if (url && url.includes(window.location.origin + window.location.pathname)) {
            // If a Peeble URL is scanned and we are not in write mode, navigate to it
            debugLog(`Peeble URL scanned: ${url}. Navigating...`);
            this.statusIndicator.textContent = 'NFC Status: Peeble scanned! Loading message...';
            // Navigate to the URL, which will trigger the peeble-app to switch to reader mode
            window.location.href = url;
        } else if (url) {
            debugLog(`Non-Peeble URL scanned: ${url}. Ignoring.`, 'info');
            this.statusIndicator.textContent = 'NFC Status: Non-Peeble tag scanned. Ignoring.';
        } else {
            debugLog('Blank NFC tag scanned or no URL record found.', 'info');
            // If no URL, it's likely a blank tag, so dispatch event for creator mode
            this.statusIndicator.textContent = 'NFC Status: Blank Peeble scanned. Ready to create.';
            window.dispatchEvent(new CustomEvent('blank-nfc-scanned'));
        }
    }

    /**
     * Handles NFC service errors.
     * @param {string} errorMessage - The error message from NFCService.
     * @private
     */
    handleNfcError(errorMessage) {
        debugLog(`NFC Handler Error: ${errorMessage}`, 'error');
        this.statusIndicator.textContent = `NFC Status: Error - ${errorMessage}`;
    }

    /**
     * Handles the 'start-nfc-write' event.
     * @param {CustomEvent} event - The event containing the URL to write.
     * @private
     */
    handleStartNfcWrite(event) {
        const support = this.nfcService.isSupported();
        if (!support.write && !support.legacyWrite) {
            debugLog('Cannot start NFC write, no supported writing interface.', 'error');
            this.statusIndicator.textContent = 'NFC Status: Write not supported on this device.';
            return;
        }

        const urlToWrite = event.detail.url;
        this.writeUrlQueue = urlToWrite;
        debugLog(`Received request to write URL: ${urlToWrite}. Waiting for tag tap.`);
        this.statusIndicator.textContent = 'NFC Status: Ready to write. Tap a blank Peeble.';
    }

    /**
     * Handles the 'stop-nfc-write' event.
     * @private
     */
    handleStopNfcWrite() {
        this.writeUrlQueue = null;
        debugLog('NFC write mode deactivated.');
        this.statusIndicator.textContent = 'NFC Status: Scanning for Peebles.';
    }

    /**
     * Attempts to write the given URL to an NFC tag.
     * @param {string} url - The URL to write.
     * @private
     */
    async writeToNfcTag(url) {
        try {
            await this.nfcService.writeUrl(url);
            debugLog('URL successfully written to NFC tag.', 'success');
            this.statusIndicator.textContent = 'NFC Status: Peeble written! Scanning for new tags.';
            // After writing, switch back to a general scanning state
            window.dispatchEvent(new CustomEvent('nfc-write-complete'));
        } catch (error) {
            debugLog(`Failed to write URL to NFC tag: ${error.message}`, 'error');
            this.statusIndicator.textContent = `NFC Status: Write failed - ${error.message}`;
            // Keep write mode active if write failed, so user can retry
            this.writeUrlQueue = url; // Re-queue the URL for retry
        }
    }
}

customElements.define('nfc-handler', NFCHandler);

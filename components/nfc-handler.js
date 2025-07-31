// components/nfc-handler.js

import { NFCService } from '../services/nfc.js';
import { debugLog, showStatus } from '../services/utils.js';

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
        if (this.nfcService.isSupported()) {
            this.statusIndicator.textContent = 'NFC Status: Supported. Tap a Peeble to scan.';
            this.nfcService.startScanning();
            debugLog('NFC API supported and scanning started.');
        } else {
            this.statusIndicator.textContent = 'NFC Status: Not Supported on this device/browser.';
            showStatus('Web NFC API is not supported on this device. Use Android Chrome.', 'warning', 0);
            debugLog('NFC API not supported.', 'warning');
        }
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
            showStatus('Peeble writing in progress...', 'info', 3000);
        } else if (url && url.includes(window.location.origin + window.location.pathname)) {
            // If a Peeble URL is scanned and we are not in write mode, navigate to it
            debugLog(`Peeble URL scanned: ${url}. Navigating...`);
            showStatus('Peeble scanned! Loading message...', 'success', 3000);
            // Navigate to the URL, which will trigger the peeble-app to switch to reader mode
            window.location.href = url;
        } else if (url) {
            debugLog(`Non-Peeble URL scanned: ${url}. Ignoring.`, 'info');
            showStatus('Non-Peeble NFC tag scanned. Ignoring.', 'info', 3000);
        } else {
            debugLog('Blank NFC tag scanned or no URL record found.', 'info');
            // If no URL, it's likely a blank tag, so dispatch event for creator mode
            showStatus('Blank Peeble scanned! Ready to create a message.', 'info', 3000);
            window.dispatchEvent(new CustomEvent('blank-nfc-scanned'));
        }
    }

    /**
     * Handles NFC service errors.
     * @param {string} errorMessage - The error message from NFCService.
     * @private
     */
    handleNfcError(errorMessage) {
        showStatus(`NFC Error: ${errorMessage}`, 'error', 0); // Keep error visible
        debugLog(`NFC Handler Error: ${errorMessage}`, 'error');
        this.statusIndicator.textContent = `NFC Status: Error - ${errorMessage}`;
    }

    /**
     * Handles the 'start-nfc-write' event.
     * @param {CustomEvent} event - The event containing the URL to write.
     * @private
     */
    handleStartNfcWrite(event) {
        const urlToWrite = event.detail.url;
        this.writeUrlQueue = urlToWrite;
        debugLog(`Received request to write URL: ${urlToWrite}. Waiting for tag tap.`);
        this.statusIndicator.textContent = 'NFC Status: Ready to write. Tap a blank Peeble.';
        showStatus('Tap your blank Peeble stone to the back of your phone to write the URL.', 'info', 0);
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
            showStatus('Peeble successfully written!', 'success', 5000);
            debugLog('URL successfully written to NFC tag.', 'success');
            this.statusIndicator.textContent = 'NFC Status: Peeble written! Scanning for new tags.';
            // After writing, switch back to a general scanning state
            window.dispatchEvent(new CustomEvent('nfc-write-complete'));
        } catch (error) {
            showStatus(`Failed to write Peeble: ${error.message}. Try again.`, 'error', 0);
            debugLog(`Failed to write URL to NFC tag: ${error.message}`, 'error');
            this.statusIndicator.textContent = `NFC Status: Write failed - ${error.message}`;
            // Keep write mode active if write failed, so user can retry
            this.writeUrlQueue = url; // Re-queue the URL for retry
        }
    }
}

customElements.define('nfc-handler', NFCHandler);

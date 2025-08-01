// components/nfc-handler.js

import { NFCService } from '../services/nfc.js';
import { debugLog } from '../services/utils.js';
import { stateManager } from '../services/state-manager.js';
import { eventBus } from '../services/pubsub.js';

/**
 * Web Component responsible for initiating and managing NFC scanning and writing.
 * It dispatches events to the main application to indicate NFC tag reads or write requests.
 */
class NFCHandler extends HTMLElement {
    constructor() {
        super();
        this.nfcService = new NFCService();
        this.writeUrlQueue = null;
        this.nfcService.onNfcTagScanned = this.handleNfcTagScanned.bind(this);
        this.nfcService.onNfcError = this.handleNfcError.bind(this);
        this.render();
        this.setupEventListeners();
        this.initNfc();
    }

    render() {
        this.innerHTML = `
            <div id="nfc-status-indicator" style="text-align: center; margin-top: 20px; color: var(--secondary-color); font-size: 0.9em;">
                NFC Status: Initializing...
            </div>
        `;
        this.statusIndicator = this.querySelector('#nfc-status-indicator');
    }

    setupEventListeners() {
        eventBus.subscribe('start-nfc-write', this.handleStartNfcWrite.bind(this));
        eventBus.subscribe('stop-nfc-write', this.handleStopNfcWrite.bind(this));
    }

    connectedCallback() {
        debugLog('NFC Handler connected to DOM.');
    }

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
     * @param {{ url: string|null, serial: string|null }} data - The data from the scanned tag.
     * @private
     */
    handleNfcTagScanned(data) {
        const serialDisplay = document.getElementById('nfc-serial-display');
        const serialNumberSpan = document.getElementById('serialNumber');
        if (serialDisplay && serialNumberSpan) {
            serialNumberSpan.textContent = data.serial || 'N/A';
            serialDisplay.style.display = 'block';
        }

        debugLog(`NFC tag scanned. Serial returned from API: ${data.serial}`, data.serial ? 'success' : 'warning');


        if (this.writeUrlQueue) {
            debugLog(`NFC tag scanned while in write mode. Attempting to write URL: ${this.writeUrlQueue}`);
            this.writeToNfcTag(this.writeUrlQueue);
            this.writeUrlQueue = null;
        } else if (data.url && data.url.includes(window.location.origin + window.location.pathname)) {
            debugLog(`Peeble URL scanned: ${data.url}. Navigating...`);
            this.statusIndicator.textContent = 'NFC Status: Peeble scanned! Loading message...';
            window.location.href = data.url;
        } else if (data.url) {
            debugLog(`Non-Peeble URL scanned: ${data.url}. Ignoring.`, 'info');
            this.statusIndicator.textContent = 'NFC Status: Non-Peeble tag scanned. Ignoring.';
        } else {
            debugLog('Blank NFC tag scanned or no URL record found.', 'info');
            this.statusIndicator.textContent = 'NFC Status: Blank Peeble scanned. Ready to create.';
            
            const serial = data.serial || `PBL-TEMP-${Date.now()}`;
            debugLog(`Using serial: ${serial}`, 'info');

            eventBus.publish('blank-nfc-scanned', serial);
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
     * @param {string} url - The URL to write.
     * @private
     */
    handleStartNfcWrite(url) {
        const support = this.nfcService.isSupported();
        if (!support.write && !support.legacyWrite) {
            debugLog('Cannot start NFC write, no supported writing interface.', 'error');
            this.statusIndicator.textContent = 'NFC Status: Write not supported on this device.';
            return;
        }

        this.writeUrlQueue = url;
        debugLog(`Received request to write URL: ${url}. Waiting for tag tap.`);
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
            eventBus.publish('nfc-write-complete');
        } catch (error) {
            debugLog(`Failed to write URL to NFC tag: ${error.message}`, 'error');
            this.statusIndicator.textContent = `NFC Status: Write failed - ${error.message}`;
            this.writeUrlQueue = url;
        }
    }
}

customElements.define('nfc-handler', NFCHandler);
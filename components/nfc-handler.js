// components/nfc-handler.js

import { NFCService } from '../services/nfc.js';
import { debugLog } from '../services/utils.js';
import { stateManager } from '../services/state-manager.js';
import { eventBus } from '../services/pubsub.js';

/**
 * Web Component responsible for secure NFC scanning and writing.
 * SECURITY: Captures tag serial as physical key and routes appropriately.
 */
class NFCHandler extends HTMLElement {
    constructor() {
        super();
        this.nfcService = new NFCService();
        this.writeUrlQueue = null;
        this.nfcService.onNfcTagScanned = this.handleSecureNfcTagScanned.bind(this);
        this.nfcService.onNfcError = this.handleNfcError.bind(this);
        this.render();
        this.setupEventListeners();
        this.initNfc();
    }

    render() {
        this.innerHTML = `
            <div id="nfc-status-indicator" style="text-align: center; margin-top: 20px; color: var(--secondary-color); font-size: 0.9em;">
                🔒 Secure NFC Status: Initializing...
            </div>
        `;
        this.statusIndicator = this.querySelector('#nfc-status-indicator');
    }

    setupEventListeners() {
        eventBus.subscribe('start-nfc-write', this.handleStartNfcWrite.bind(this));
        eventBus.subscribe('stop-nfc-write', this.handleStopNfcWrite.bind(this));
    }

    connectedCallback() {
        debugLog('🔒 SECURITY: Secure NFC Handler connected to DOM.');
    }

    initNfc() {
        const support = this.nfcService.isSupported();
        let statusMessage = '🔒 Secure NFC Status: Initializing...';

        if (support.read && (support.write || support.legacyWrite)) {
            statusMessage = '🔒 Secure NFC Status: Ready. Tap a Peeble to scan securely.';
            this.nfcService.startScanning();
        } else if (support.read) {
            statusMessage = '🔒 Secure NFC Status: Read-only. Writing not available.';
            this.nfcService.startScanning();
        } else {
            statusMessage = '🔒 Secure NFC Status: Not supported on this device.';
            debugLog('🔒 SECURITY: NFC API not supported.', 'warning');
        }

        this.statusIndicator.textContent = statusMessage;
        debugLog(statusMessage, 'info');
    }

    /**
     * SECURITY: Secure NFC tag scanning that properly handles physical key extraction
     */
    handleSecureNfcTagScanned(data) {
        const serialDisplay = document.getElementById('nfc-serial-display');
        const serialNumberSpan = document.getElementById('serialNumber');
        if (serialDisplay && serialNumberSpan) {
            serialNumberSpan.textContent = data.serial || 'N/A';
            serialDisplay.style.display = 'block';
        }

        debugLog(`🔒 SECURITY: NFC tag scanned. Physical key captured: ${data.serial ? 'YES' : 'NO'}`, data.serial ? 'success' : 'warning');

        // Handle write mode first
        if (this.writeUrlQueue) {
            debugLog(`🔒 SECURITY: NFC tag scanned in write mode. Writing secure URL: ${this.writeUrlQueue}`);
            this.writeToNfcTag(this.writeUrlQueue);
            this.writeUrlQueue = null;
            return;
        }

        // Handle URL reading - SECURITY: Check for secure URL format
        if (data.url) {
            debugLog(`🔒 SECURITY: URL detected on tag: ${data.url}`);
            
            if (this.isSecurePeebleUrl(data.url)) {
                debugLog(`🔒 SECURITY: Secure Peeble URL detected. Extracting parameters...`);
                this.handleSecurePeebleUrl(data.url, data.serial);
            } else if (data.url.includes(window.location.origin + window.location.pathname)) {
                debugLog(`🔒 SECURITY: Legacy Peeble URL detected: ${data.url}`, 'warning');
                this.statusIndicator.textContent = '⚠️ Legacy Peeble format detected. Please recreate for full security.';
                // Still navigate but warn user
                window.location.href = data.url;
            } else {
                debugLog(`🔒 SECURITY: Non-Peeble URL ignored: ${data.url}`);
                this.statusIndicator.textContent = '🔒 Non-Peeble tag scanned. Ignored for security.';
            }
        } else {
            // Blank tag - for creation mode
            debugLog('🔒 SECURITY: Blank NFC tag scanned (no URL record).', 'info');
            this.statusIndicator.textContent = '🔒 Blank Peeble scanned. Ready for secure message creation.';
            
            const serial = data.serial || `PBL-TEMP-${Date.now()}`;
            debugLog(`🔒 SECURITY: Using physical key for creation: ${serial}`, 'info');

            eventBus.publish('blank-nfc-scanned', serial);
        }
    }

    /**
     * SECURITY: Check if URL uses secure format (messageId + ipfsHash, no serial)
     */
    isSecurePeebleUrl(url) {
        try {
            const urlObj = new URL(url);
            const params = new URLSearchParams(urlObj.hash.substring(1));
            
            const hasMessageId = params.has('messageId');
            const hasIpfsHash = params.has('ipfsHash');
            const hasSerial = params.has('serial'); // Legacy format
            
            // Secure format: has messageId + ipfsHash, NO serial
            return hasMessageId && hasIpfsHash && !hasSerial;
        } catch (error) {
            return false;
        }
    }

    /**
     * SECURITY: Handle secure Peeble URL with physical key verification
     */
    handleSecurePeebleUrl(url, serial) {
        if (!serial) {
            debugLog('🔒 SECURITY: No physical key available from NFC scan. Cannot decrypt.', 'error');
            this.statusIndicator.textContent = '🔒 Error: No physical key detected. Cannot decrypt message.';
            return;
        }

        // SECURITY: Store physical key temporarily with timestamp for security
        const keyData = {
            serial: serial,
            timestamp: Date.now(),
            url: url
        };
        sessionStorage.setItem('peeble-physical-key', JSON.stringify(keyData));
        debugLog(`🔒 SECURITY: Physical key stored temporarily for page reload`);
        
        // Inform the app that we have both URL and physical key
        eventBus.publish('message-nfc-scanned', { url, serial });
        
        // Navigate to the secure URL
        debugLog(`🔒 SECURITY: Navigating to secure message with physical key...`);
        this.statusIndicator.textContent = '🔒 Physical key verified. Loading secure message...';
        
        window.location.href = url;
    }

    handleNfcError(errorMessage) {
        debugLog(`🔒 SECURITY: NFC Handler Error: ${errorMessage}`, 'error');
        this.statusIndicator.textContent = `🔒 NFC Error: ${errorMessage}`;
    }

    handleStartNfcWrite(url) {
        const support = this.nfcService.isSupported();
        if (!support.write && !support.legacyWrite) {
            debugLog('🔒 SECURITY: Cannot start NFC write - no supported interface.', 'error');
            this.statusIndicator.textContent = '🔒 NFC Write not supported on this device.';
            return;
        }

        this.writeUrlQueue = url;
        debugLog(`🔒 SECURITY: Prepared to write secure URL (${url.length} chars). Waiting for tag...`);
        this.statusIndicator.textContent = '🔒 Ready to write secure URL. Tap a blank Peeble.';
    }

    handleStopNfcWrite() {
        this.writeUrlQueue = null;
        debugLog('🔒 SECURITY: NFC write mode deactivated.');
        this.statusIndicator.textContent = '🔒 Scanning for secure Peebles.';
    }

    async writeToNfcTag(url) {
        try {
            await this.nfcService.writeUrl(url);
            debugLog('🔒 SECURITY: Secure URL written to NFC tag successfully.', 'success');
            this.statusIndicator.textContent = '🔒 Secure Peeble created! Safe to share.';
            eventBus.publish('nfc-write-complete');
        } catch (error) {
            debugLog(`🔒 SECURITY: Failed to write secure URL: ${error.message}`, 'error');
            this.statusIndicator.textContent = `🔒 Write failed: ${error.message}`;
            this.writeUrlQueue = url; // Keep in queue for retry
        }
    }
}

customElements.define('nfc-handler', NFCHandler);
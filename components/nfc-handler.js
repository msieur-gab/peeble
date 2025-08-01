// components/nfc-handler.js

import { NFCService } from '../services/nfc.js';
import { debugLog } from '../services/utils.js';

/**
 * Simplified NFC Handler that just publishes events to the state manager.
 */
class NFCHandler extends HTMLElement {
    constructor() {
        super();
        this.nfcService = new NFCService();
        this.eventBus = null;
        this.stateManager = null;
        
        this.nfcService.onNfcTagScanned = this.handleNfcTagScanned.bind(this);
        this.nfcService.onNfcError = this.handleNfcError.bind(this);
        
        this.render();
        this.initNfc();
    }

    initialize(services) {
        this.eventBus = services.eventBus;
        this.stateManager = services.stateManager;
        this.setupEventListeners();
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
        if (!this.eventBus) return;
        
        // Listen for NFC write requests
        this.eventBus.subscribe('nfc-write-url', (data) => {
            this.writeToNfcTag(data.url);
        });
        
        // Listen for state changes to update status
        this.eventBus.subscribe('state-change', (state) => {
            this.updateStatusFromState(state);
        });
    }

    connectedCallback() {
        debugLog('🔒 SECURITY: Reactive NFC Handler connected to DOM.');
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

    updateStatusFromState(state) {
        if (state.nfcWriteMode) {
            this.statusIndicator.textContent = '🔒 Ready to write secure URL. Tap a blank Peeble.';
        } else if (state.appMode === 'READER' && state.currentStep === 'waiting') {
            this.statusIndicator.textContent = '🔒 Waiting for physical Peeble scan...';
        } else {
            this.statusIndicator.textContent = '🔒 Scanning for secure Peebles.';
        }
    }

    handleNfcTagScanned(data) {
        // Update debug display
        const serialDisplay = document.getElementById('nfc-serial-display');
        const serialNumberSpan = document.getElementById('serialNumber');
        if (serialDisplay && serialNumberSpan) {
            serialNumberSpan.textContent = data.serial || 'N/A';
            serialDisplay.style.display = 'block';
        }

        debugLog(`🔒 SECURITY: NFC tag scanned. Serial: ${data.serial ? 'CAPTURED' : 'MISSING'}, URL: ${data.url ? 'PRESENT' : 'BLANK'}`, 'success');

        // Just publish the raw scan data - let state manager handle the logic
        if (data.url) {
            this.eventBus.publish('nfc-tag-scanned', { url: data.url, serial: data.serial });
        } else {
            this.eventBus.publish('blank-nfc-scanned', data.serial || `PBL-TEMP-${Date.now()}`);
        }
    }

    handleNfcError(errorMessage) {
        debugLog(`🔒 SECURITY: NFC Handler Error: ${errorMessage}`, 'error');
        this.statusIndicator.textContent = `🔒 NFC Error: ${errorMessage}`;
    }

    async writeToNfcTag(url) {
        try {
            this.statusIndicator.textContent = '🔒 Writing secure URL...';
            await this.nfcService.writeUrl(url);
            debugLog('🔒 SECURITY: Secure URL written to NFC tag successfully.', 'success');
            
            // Publish success event
            this.eventBus.publish('nfc-write-complete');
            
        } catch (error) {
            debugLog(`🔒 SECURITY: Failed to write secure URL: ${error.message}`, 'error');
            this.statusIndicator.textContent = `🔒 Write failed: ${error.message}`;
        }
    }
}

customElements.define('nfc-handler', NFCHandler);
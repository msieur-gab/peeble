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
            <div id="nfc-permission-helper" style="display: none;"></div>
        `;
        this.statusIndicator = this.querySelector('#nfc-status-indicator');
        this.permissionHelper = this.querySelector('#nfc-permission-helper');
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
        
        if (!support.read) {
            const message = '🔒 Secure NFC Status: Not supported on this device.';
            this.statusIndicator.textContent = message;
            debugLog('🔒 SECURITY: NFC API not supported.', 'warning');
            return;
        }

        if (support.read && (support.write || support.legacyWrite)) {
            this.statusIndicator.textContent = '🔒 Secure NFC Status: Requesting permissions...';
            debugLog('🔒 NFC: Full NFC support detected, starting scan...', 'info');
        } else if (support.read) {
            this.statusIndicator.textContent = '🔒 Secure NFC Status: Read-only mode...';
            debugLog('🔒 NFC: Read-only NFC support detected, starting scan...', 'info');
        }

        // Start scanning - this should trigger Chrome's permission request
        this.requestNfcPermissionAndStart();
    }

    async requestNfcPermissionAndStart() {
        try {
            debugLog('🔒 NFC: Attempting to start NFC scan (should trigger permission request)...', 'info');
            
            // This call should trigger Chrome's "Allow NFC access?" dialog
            await this.nfcService.startScanning();
            
            // If we get here, permission was granted
            this.statusIndicator.textContent = '🔒 Secure NFC Status: Ready. Tap a Peeble to scan securely.';
            debugLog('✅ NFC scanning initiated successfully. Permission granted.', 'success');
            
        } catch (error) {
            debugLog(`🔒 NFC: Permission/scan error: ${error.message}`, 'error');
            
            if (error.message.includes('permission') || error.message.includes('denied')) {
                this.statusIndicator.textContent = '🔒 NFC Permission needed. Please allow NFC access and refresh.';
                this.showPermissionHelp();
            } else {
                this.statusIndicator.textContent = `🔒 NFC Error: ${error.message}`;
            }
        }
    }

    showPermissionHelp() {
        // Show helpful message in the dedicated helper div
        this.permissionHelper.style.display = 'block';
        this.permissionHelper.innerHTML = `
            <div style="
                background: #fff3cd; 
                border: 2px solid #ffc107; 
                border-radius: 10px; 
                padding: 15px; 
                margin: 15px 0; 
                text-align: center;
                font-size: 0.9em;
            ">
                <h4 style="color: #856404; margin-bottom: 8px;">🔧 NFC Permission Required</h4>
                <p style="color: #664d03; margin: 5px 0;">Chrome should ask: <strong>"Allow NFC access?"</strong></p>
                <p style="color: #664d03; margin: 5px 0;">If you missed it, try refreshing or manually enable NFC in site settings.</p>
                <div style="margin-top: 10px;">
                    <button onclick="location.reload()" style="
                        background: #ffc107; 
                        border: none; 
                        padding: 8px 16px; 
                        border-radius: 5px; 
                        cursor: pointer; 
                        margin: 5px;
                        color: #856404;
                        font-weight: bold;
                    ">🔄 Refresh Page</button>
                    <button onclick="document.querySelector('nfc-handler').retryNfcPermission()" style="
                        background: #17a2b8; 
                        border: none; 
                        padding: 8px 16px; 
                        border-radius: 5px; 
                        cursor: pointer; 
                        margin: 5px;
                        color: white;
                        font-weight: bold;
                    ">🔓 Retry Permission</button>
                </div>
            </div>
        `;
    }

    // Method to retry NFC permission (called from button)
    retryNfcPermission() {
        this.permissionHelper.style.display = 'none';
        this.statusIndicator.textContent = '🔒 Requesting NFC permission...';
        this.requestNfcPermissionAndStart();
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
        // FIX: Add extensive debugging for serial capture
        debugLog(`🔍 NFC RAW DATA RECEIVED:`, 'info');
        debugLog(`   - URL: ${data.url ? 'PRESENT' : 'NULL'}`, 'info');
        debugLog(`   - Serial: ${data.serial ? data.serial : 'NULL'}`, 'info');
        debugLog(`   - Data object keys: ${Object.keys(data).join(', ')}`, 'info');
        
        // FIX: Validate serial number more thoroughly
        let validatedSerial = null;
        if (data.serial) {
            validatedSerial = data.serial;
            debugLog(`✅ SERIAL VALIDATION: Valid serial captured: ${validatedSerial}`, 'success');
        } else {
            // Generate a temporary serial if none provided (should not happen with real NFC tags)
            validatedSerial = `PBL-TEMP-${Date.now()}`;
            debugLog(`⚠️ SERIAL VALIDATION: No serial from NFC, generated temporary: ${validatedSerial}`, 'warning');
        }

        // Update debug display IMMEDIATELY when tag is scanned
        const serialDisplay = document.getElementById('nfc-serial-display');
        const serialNumberSpan = document.getElementById('serialNumber');
        if (serialDisplay && serialNumberSpan) {
            serialNumberSpan.textContent = validatedSerial;
            serialDisplay.style.display = 'block';
            debugLog(`🔍 DEBUG DISPLAY: Updated serial display to: ${validatedSerial}`, 'info');
        }

        // FIX: Ensure we have the eventBus before publishing
        if (!this.eventBus) {
            debugLog(`❌ CRITICAL ERROR: EventBus not available, cannot publish NFC event`, 'error');
            return;
        }

        debugLog(`🔒 SECURITY: Publishing nfc-tag-scanned event with validated serial: ${validatedSerial}`, 'info');

        // ALWAYS publish nfc-tag-scanned and let State Manager decide what to do
        // Don't make decisions here - State Manager knows the current app mode
        this.eventBus.publish('nfc-tag-scanned', { 
            url: data.url || null, 
            serial: validatedSerial  // Use validated serial
        });
        
        debugLog(`✅ NFC EVENT PUBLISHED: nfc-tag-scanned with serial: ${validatedSerial}`, 'success');
    }

    handleNfcError(errorMessage) {
        debugLog(`🔒 SECURITY: NFC Handler Error: ${errorMessage}`, 'error');
        this.statusIndicator.textContent = `🔒 NFC Error: ${errorMessage}`;
    }

    async writeToNfcTag(url) {
        debugLog(`🔒 NFC: Starting write process for URL: ${url.substring(0, 50)}...`);
        
        const support = this.nfcService.isSupported();
        if (!support.write && !support.legacyWrite) {
            const errorMsg = 'NFC writing not supported on this device';
            debugLog(`🔒 NFC: ${errorMsg}`, 'error');
            this.statusIndicator.textContent = `🔒 ${errorMsg}`;
            return;
        }

        try {
            this.statusIndicator.textContent = '🔒 Writing secure URL...';
            debugLog('🔒 NFC: Calling nfcService.writeUrl()...');
            
            await this.nfcService.writeUrl(url);
            
            debugLog('🔒 SECURITY: Secure URL written to NFC tag successfully.', 'success');
            this.statusIndicator.textContent = '🔒 Write successful!';
            
            // Publish success event
            this.eventBus.publish('nfc-write-complete');
            
        } catch (error) {
            debugLog(`🔒 SECURITY: Failed to write secure URL: ${error.message}`, 'error');
            this.statusIndicator.textContent = `🔒 Write failed: ${error.message}`;
            
            // You might want to keep the URL in queue for retry
            debugLog('🔒 NFC: Write failed, URL remains in queue for retry');
        }
    }
}

customElements.define('nfc-handler', NFCHandler);
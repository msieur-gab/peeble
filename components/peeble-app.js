// components/peeble-app.js

import { URLParser, debugLog } from '../services/utils.js';
import { StorageService } from '../services/storage.js';
// Import components so they are defined
import './voice-recorder.js';
import './message-player.js';

/**
 * The main application Web Component.
 * SECURITY: Handles secure URL parsing and ensures serial comes from physical NFC scan only.
 */
class PeebleApp extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        this.stateManager = null;
        this.eventBus = null;
        this.storageService = null;
        this.unsubscribe = null;

        // SECURITY: Store the physical tag serial separately from URL parameters
        this.physicalTagSerial = null;

        this.render();
    }

    initialize(services) {
        this.stateManager = services.stateManager;
        this.eventBus = services.eventBus;
        this.storageService = services.storageService;
        debugLog('🔒 SECURITY: Services initialized in secure PeebleApp.');

        // SECURITY: Check for temporarily stored physical key from NFC scan
        this.restorePhysicalKey();

        this.setupStateSubscription();
        this.initializeMode();
        this.handleInitialLoad();
        this.handleStateChange(this.stateManager.getState());
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                @import '../style.css';
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
                .security-warning {
                    background: #fff3cd;
                    border: 2px solid #ffc107;
                    border-radius: 10px;
                    padding: 15px;
                    margin: 15px 0;
                    text-align: center;
                }
                .security-warning h4 {
                    color: #856404;
                    margin-bottom: 8px;
                }
                .security-warning p {
                    color: #664d03;
                    font-size: 0.9em;
                    margin: 0;
                }
            </style>
            <div class="app-content-wrapper">
                <div class="status-container">
                    <div id="status" class="status">🔒 Loading secure Peeble app...</div>
                </div>
                <div class="app-content" id="appContent">
                </div>
            </div>
        `;
        this.appContent = this.shadowRoot.getElementById('appContent');
        this.statusDiv = this.shadowRoot.getElementById('status');
    }

    handleInitialLoad() {
        if (!this.storageService) {
            debugLog('🔒 SECURITY: StorageService not yet available, delaying mode initialization.', 'warning');
            return;
        }

        const params = URLParser.getParams();
        
        if (params.messageId && params.ipfsHash) {
            debugLog('🔒 SECURITY: Secure URL parameters found. Switching to Reading Mode.', 'info');
            // We now wait for the event instead of relying on a page reload
            this.stateManager.setState({ appMode: 'READER', ipfsHash: params.ipfsHash, messageId: params.messageId });
        } else {
            debugLog('🔒 SECURITY: No URL parameters found. Switching to Creation Mode.', 'info');
            this.stateManager.setState({ appMode: 'CREATOR', tagSerial: null });
        }
    }
    
    setupStateSubscription() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }

        this.unsubscribe = this.eventBus.subscribe('state-change', (state) => {
            this.handleStateChange(state);
        });

        // SECURITY: Listen for NFC scans to capture physical tag serial
        this.eventBus.subscribe('blank-nfc-scanned', (serial) => {
            debugLog(`🔒 SECURITY: Blank NFC tag scanned - serial captured: ${serial}`, 'success');
            this.physicalTagSerial = serial;
            this.stateManager.setState({ appMode: 'CREATOR', tagSerial: serial });
        });

        // SECURITY: Listen for message playback NFC scans
        this.eventBus.subscribe('message-nfc-scanned', (data) => {
            debugLog(`🔒 SECURITY: Message NFC tag scanned - serial captured: ${data.serial}`, 'success');
            this.physicalTagSerial = data.serial;
            // The URL parsing will handle the rest
        });

        this.eventBus.subscribe('close-player', () => {
            this.physicalTagSerial = null; // Clear the physical key
            this.clearPhysicalKey(); // Also clear from storage
            this.stateManager.setState({ appMode: 'CREATOR', tagSerial: null });
        });
    }

    /**
     * SECURITY: Restore physical key from temporary storage after page reload
     */
    restorePhysicalKey() {
        try {
            const keyDataStr = sessionStorage.getItem('peeble-physical-key');
            if (!keyDataStr) {
                debugLog('🔒 SECURITY: No stored physical key found.');
                return;
            }

            const keyData = JSON.parse(keyDataStr);
            const age = Date.now() - keyData.timestamp;
            const maxAge = 30000; // 30 seconds max age for security

            if (age > maxAge) {
                debugLog('🔒 SECURITY: Stored physical key expired. Clearing.', 'warning');
                sessionStorage.removeItem('peeble-physical-key');
                return;
            }

            // Verify URL matches current page
            const currentUrl = window.location.href;
            if (keyData.url !== currentUrl) {
                debugLog('🔒 SECURITY: Stored key URL mismatch. Clearing.', 'warning');
                sessionStorage.removeItem('peeble-physical-key');
                return;
            }

            this.physicalTagSerial = keyData.serial;
            debugLog(`🔒 SECURITY: Physical key restored from temporary storage: ${keyData.serial}`, 'success');

            // Clear the key immediately after use for security
            sessionStorage.removeItem('peeble-physical-key');

        } catch (error) {
            debugLog(`🔒 SECURITY: Error restoring physical key: ${error.message}`, 'error');
            sessionStorage.removeItem('peeble-physical-key');
        }
    }

    /**
     * SECURITY: Clear physical key from temporary storage
     */
    clearPhysicalKey() {
        sessionStorage.removeItem('peeble-physical-key');
        debugLog('🔒 SECURITY: Physical key cleared from temporary storage.');
    }

    handleStateChange(state) {
        debugLog('🔒 SECURITY: PeebleApp received state change.', 'info');
        const { appMode, tagSerial, pinataApiKey, pinataSecret } = state;

        if (appMode === 'READER') {
            this.renderSecureReaderMode();
        } else {
            this.renderCreatorMode(tagSerial);
        }

        this.passServicesToChild(pinataApiKey, pinataSecret);
    }
    
    showStatus(message, type = 'info', duration = 5000) {
        if (this.statusDiv) {
            this.statusDiv.textContent = message;
            this.statusDiv.className = `status ${type}`;

            if (duration > 0) {
                setTimeout(() => {
                    if (this.statusDiv.textContent === message) {
                        this.statusDiv.className = 'status';
                        this.statusDiv.textContent = 'Ready for secure action';
                    }
                }, duration);
            }
        }
    }

    /**
     * SECURITY: Determines app mode using secure URL parsing
     */
    initializeMode() {
        if (!this.storageService) {
            debugLog('🔒 SECURITY: StorageService not yet available, delaying mode initialization.', 'warning');
            return;
        }

        const params = URLParser.getParams();
        
        // SECURITY: Check for secure URL format (messageId + ipfsHash, NO serial)
        if (params.messageId && params.ipfsHash) {
            debugLog('🔒 SECURITY: Secure URL parameters found. Switching to Reading Mode.', 'info');
            debugLog('🔒 SECURITY: Waiting for physical NFC scan to provide decryption key...', 'info');
            this.stateManager.setState({ appMode: 'READER' });
        } else {
            debugLog('🔒 SECURITY: No URL parameters found. Switching to Creation Mode.', 'info');
            this.stateManager.setState({ appMode: 'CREATOR', tagSerial: null });
        }
    }

    renderCreatorMode(serial) {
        debugLog(`🔒 SECURITY: Rendering Creator Mode. Serial: ${serial ? 'AVAILABLE' : 'NONE'}`);
        this.appContent.innerHTML = `<voice-recorder serial="${serial || ''}"></voice-recorder>`;
        this.showStatus('🔒 Ready to create a secure Peeble message.', 'info');
    }

    /**
     * SECURITY: Renders secure reader mode that requires physical NFC scan
     */
    renderSecureReaderMode() {
        debugLog('🔒 SECURITY: Rendering Secure Reader Mode.');
        const params = URLParser.getParams();
        const { tagSerial, messageId, ipfsHash } = this.stateManager.getState();
        
        if (!tagSerial || !messageId || !ipfsHash) {
            // Show waiting state until physical tag is scanned
            this.appContent.innerHTML = `
                <div class="security-warning">
                    <h4>🔒 Physical Key Required</h4>
                    <p>Please scan the Peeble stone to decrypt this message</p>
                </div>
                <div style="text-align: center; padding: 40px;">
                    <h3>🔄 Waiting for Physical Peeble</h3>
                    <p style="color: #666; margin: 20px 0;">
                        This message is encrypted and requires the original Peeble stone to decrypt.
                    </p>
                    <p style="color: #666;">
                        <strong>Tap the Peeble to your phone to continue...</strong>
                    </p>
                    <div style="margin-top: 30px; padding: 15px; background: #f5f5f5; border-radius: 10px;">
                        <p style="font-size: 0.9em; color: #333;">
                            <strong>Message ID:</strong> ${params.messageId}<br>
                            <strong>IPFS Hash:</strong> ${params.ipfsHash.substring(0, 20)}...
                        </p>
                    </div>
                </div>
            `;
            this.showStatus('🔒 Waiting for physical Peeble scan to decrypt message...', 'warning', 0);
            return;
        }

        // Render player with physical key
        debugLog(`🔒 SECURITY: Rendering player with restored physical key: ${tagSerial}`);
        this.appContent.innerHTML = `
            <message-player 
                serial="${tagSerial}" 
                message-id="${messageId}" 
                ipfs-hash="${ipfsHash}">
            </message-player>
        `;
        this.showStatus('🔒 Physical key detected. Loading secure message...', 'success');
    }
    
    passServicesToChild(apiKey, secret) {
        this.storageService.setCredentials(apiKey, secret);
        
        const childComponent = this.appContent.firstElementChild;
        if (childComponent && typeof childComponent.setStorageService === 'function') {
            childComponent.setStorageService(this.storageService);
        }
    }
}

customElements.define('peeble-app', PeebleApp);
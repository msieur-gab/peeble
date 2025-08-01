// components/message-player.js

import { EncryptionService } from '../services/encryption.js';
import { StorageService } from '../services/storage.js';
import { debugLog } from '../services/utils.js';

/**
 * Web Component for playing back encrypted voice messages.
 * SECURITY: Requires physical NFC tag scan to get the encryption key (serial).
 * Expects 'serial', 'message-id', and 'ipfs-hash' attributes.
 */
class MessagePlayer extends HTMLElement {
    static get observedAttributes() {
        return ['serial', 'message-id', 'ipfs-hash'];
    }

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        this.encryptionService = new EncryptionService();
        this.storageService = null;
        this.currentAudio = null;
        this.statusDiv = null;

        // SECURITY: Store decryption parameters
        this.tagSerial = null; // Physical key from NFC scan
        this.messageId = null;
        this.ipfsHash = null;

        this.render();
        this.setupEventListeners();
    }

    setStorageService(service) {
        this.storageService = service;
        debugLog('🔒 SECURITY: StorageService set in MessagePlayer.');
        // Update manual load button visibility
        this.updateManualLoadButton();
        // FIX: Explicitly call loadSecureMessage now that the service is available  
        // Only auto-load if we have all required parameters
        if (this.tagSerial && this.messageId && this.ipfsHash) {
            debugLog('🔒 SECURITY: All parameters available, auto-loading message...');
            this.loadSecureMessage();
        } else {
            debugLog(`🔒 SECURITY: Missing parameters for auto-load - Serial: ${!!this.tagSerial}, MessageId: ${!!this.messageId}, Hash: ${!!this.ipfsHash}`);
        }
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                @import '../style.css';
                .security-notice {
                    background: #e8f5e8;
                    border: 2px solid #4caf50;
                    border-radius: 10px;
                    padding: 15px;
                    margin: 15px 0;
                    text-align: center;
                }
                .security-notice h4 {
                    color: #2e7d2e;
                    margin-bottom: 8px;
                }
                .security-notice p {
                    color: #4caf50;
                    font-size: 0.9em;
                    margin: 0;
                }
                .playback-controls {
                    display: flex;
                    align-items: center;
                    gap: 15px;
                    margin: 15px 0;
                    padding: 15px;
                    background: var(--info-bg);
                    border-radius: 10px;
                }
                .play-button {
                    width: 60px;
                    height: 60px;
                    border-radius: 50%;
                    border: none;
                    background: var(--success-color);
                    color: white;
                    font-size: 1.5em;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }
                .play-button:hover { background: #2f855a; transform: scale(1.05); }
                .play-button:disabled { background: #cbd5e0; cursor: not-allowed; }
                .message-info { flex: 1; }
                .message-info h4 { color: var(--dark-gray); margin-bottom: 5px; }
                .message-info p { color: var(--secondary-color); font-size: 0.9em; }
                #playingTranscript {
                    background: var(--info-bg);
                    padding: 15px;
                    border-radius: 10px;
                    font-style: italic;
                    margin: 15px 0;
                    color: var(--dark-gray);
                    line-height: 1.4;
                }
                audio { width: 100%; margin: 10px 0; }
                .status { margin-bottom: 10px; }
                .error-state {
                    text-align: center;
                    padding: 20px;
                    background: #fee;
                    border-radius: 10px;
                    margin: 20px 0;
                }
                .error-state h3 {
                    color: #c53030;
                    margin-bottom: 10px;
                }
                .error-state p {
                    color: #666;
                    margin-bottom: 15px;
                }
                .manual-load-btn {
                    background: #17a2b8;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 6px;
                    font-size: 0.9em;
                    cursor: pointer;
                    margin: 5px;
                    transition: all 0.3s ease;
                }
                .manual-load-btn:hover {
                    background: #138496;
                    transform: translateY(-1px);
                }
                .manual-load-btn:disabled {
                    background: #6c757d;
                    cursor: not-allowed;
                    transform: none;
                }
            </style>
            <div class="message-player-container">
                <div class="status" id="status"></div>
                <h2>🔒 Secure Peeble Playback</h2>
                
                <div class="security-notice">
                    <h4>🛡️ Physical Security Verification</h4>
                    <p>Decryption requires the physical Peeble that was scanned</p>
                </div>
                
                <div class="playback-controls">
                    <button class="play-button" id="playButton">▶️</button>
                    <div class="message-info">
                        <h4 id="playingTitle">🔄 Loading secure message...</h4>
                        <p id="playingInfo">Verifying physical key and downloading...</p>
                    </div>
                </div>
                
                <div style="text-align: center; margin: 15px 0;">
                    <button class="manual-load-btn" id="manualLoadBtn" style="display: none;">
                        🔓 Manual Load (Testing)
                    </button>
                </div>
                
                <div id="playingTranscript">Decrypting transcript...</div>
                <audio id="playbackAudio" controls style="display: none;"></audio>
                
                <div id="errorState" class="error-state" style="display: none;">
                    <h3>🔒 Decryption Failed</h3>
                    <p>This message requires the original physical Peeble to decrypt.</p>
                    <p>Please scan the correct Peeble stone that was used to create this message.</p>
                </div>
                
                <button class="btn btn-secondary" id="closePlayerBtn">Close Player</button>
            </div>
        `;
        this.statusDiv = this.shadowRoot.getElementById('status');
    }

    showStatus(message, type = 'info', duration = 5000) {
        if (this.statusDiv) {
            this.statusDiv.textContent = message;
            this.statusDiv.className = `status ${type}`;

            if (duration > 0) {
                setTimeout(() => {
                    if (this.statusDiv.textContent === message) {
                        this.statusDiv.className = 'status';
                        this.statusDiv.textContent = '';
                    }
                }, duration);
            }
        }
    }

    setupEventListeners() {
        this.shadowRoot.getElementById('playButton').addEventListener('click', () => this.togglePlayback());
        this.shadowRoot.getElementById('closePlayerBtn').addEventListener('click', () => this.closePlayback());
        this.shadowRoot.getElementById('manualLoadBtn').addEventListener('click', () => this.manualLoadMessage());
        this.currentAudio = this.shadowRoot.getElementById('playbackAudio');
        this.currentAudio.addEventListener('ended', () => {
            this.shadowRoot.getElementById('playButton').textContent = '▶️';
        });
    }

    connectedCallback() {
        debugLog('🔒 SECURITY: MessagePlayer connected to DOM.');
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            debugLog(`🔒 SECURITY: Attribute changed: ${name} = ${newValue ? 'SET' : 'NULL'}`);
            
            if (name === 'serial') {
                this.tagSerial = newValue;
                debugLog(`🔒 SECURITY: Physical key received from NFC scan: ${newValue ? 'AVAILABLE' : 'MISSING'}`);
            } else if (name === 'message-id') {
                this.messageId = newValue;
            } else if (name === 'ipfs-hash') {
                this.ipfsHash = newValue;
            }

            // Show manual load button if we have all parameters but no storage service yet
            this.updateManualLoadButton();

            // Reload message if we have the storage service and key parameters
            if (this.storageService && this.tagSerial && this.messageId && this.ipfsHash) {
                this.loadSecureMessage();
            }
        }
    }

    updateManualLoadButton() {
        const manualBtn = this.shadowRoot.getElementById('manualLoadBtn');
        if (manualBtn) {
            // Show button if we have all params but no storage service, or if loading failed
            const shouldShow = this.tagSerial && this.messageId && this.ipfsHash && 
                               (!this.storageService || this.shadowRoot.getElementById('playingInfo').textContent.includes('failed'));
            manualBtn.style.display = shouldShow ? 'inline-block' : 'none';
        }
    }

    manualLoadMessage() {
        debugLog('🔓 Manual load button clicked - forcing message load');
        if (this.tagSerial && this.messageId && this.ipfsHash) {
            if (!this.storageService) {
                this.showStatus('StorageService not available - check Pinata credentials', 'error');
                return;
            }
            this.loadSecureMessage();
        } else {
            this.showStatus('Missing required parameters for decryption', 'error');
        }
    }

    /**
     * SECURITY: New secure message loading that requires physical tag serial
     */
    async loadSecureMessage() {
        if (!this.tagSerial || !this.messageId || !this.ipfsHash) {
            this.showStatus('Missing security parameters for decryption.', 'error');
            debugLog('🔒 SECURITY: Missing required parameters for secure playback.', 'error');
            this.showErrorState();
            return;
        }

        if (!this.storageService || (!this.storageService.apiKey || !this.storageService.secret)) {
            this.showStatus('Pinata API credentials not configured.', 'error');
            debugLog('🔒 SECURITY: StorageService not properly configured.', 'error');
            return;
        }

        this.shadowRoot.getElementById('playingTitle').textContent = `Peeble ${this.messageId}`;
        this.shadowRoot.getElementById('playingInfo').textContent = '📦 Downloading encrypted package...';
        this.showStatus('🔒 Downloading secure message...', 'info', 0);

        try {
            debugLog(`🔒 SECURITY: Starting secure playback - Message: ${this.messageId}, IPFS: ${this.ipfsHash}`, 'info');
            
            // Step 1: Download complete encrypted package from IPFS
            this.shadowRoot.getElementById('playingInfo').textContent = '📦 Downloading from IPFS...';
            const messagePackage = await this.storageService.downloadMessagePackage(this.ipfsHash);
            debugLog(`🔒 SECURITY: Package downloaded - contains encrypted audio and transcript`, 'success');
            
            // Step 2: Verify message ID matches
            if (messagePackage.messageId !== this.messageId) {
                throw new Error('Message ID mismatch - package corruption detected');
            }
            
            // Step 3: Derive decryption key using physical tag serial + timestamp from package
            this.shadowRoot.getElementById('playingInfo').textContent = '🔑 Deriving decryption key...';
            const decryptionKey = await this.encryptionService.deriveEncryptionKey(this.tagSerial, messagePackage.timestamp);
            debugLog('🔒 SECURITY: Decryption key derived from physical tag + package timestamp', 'success');
            
            // Step 4: Decrypt audio
            this.shadowRoot.getElementById('playingInfo').textContent = '🔓 Decrypting audio...';
            const decryptedAudio = await this.encryptionService.decryptFromBinary(messagePackage.encryptedAudio, decryptionKey);
            debugLog(`🔒 SECURITY: Audio decrypted successfully (${decryptedAudio.byteLength} bytes)`, 'success');
            
            // Step 5: Create playable audio
            const audioBlob = new Blob([decryptedAudio], { type: 'audio/webm' });
            const audioUrl = URL.createObjectURL(audioBlob);
            this.currentAudio.src = audioUrl;
            this.currentAudio.style.display = 'block';
            
            // Step 6: Decrypt transcript
            let transcriptText = 'Transcript not available.';
            if (messagePackage.encryptedTranscript) {
                try {
                    this.shadowRoot.getElementById('playingInfo').textContent = '🔓 Decrypting transcript...';
                    transcriptText = await this.encryptionService.decryptFromBase64(messagePackage.encryptedTranscript, decryptionKey);
                    debugLog('🔒 SECURITY: Transcript decrypted successfully.', 'success');
                } catch (transcriptError) {
                    debugLog(`🔒 SECURITY: Transcript decryption failed: ${transcriptError.message}`, 'warning');
                    transcriptText = 'Transcript decryption failed.';
                }
            }
            
            // Step 7: Display results
            this.shadowRoot.getElementById('playingTranscript').textContent = `"${transcriptText}"`;
            this.shadowRoot.getElementById('playingInfo').textContent = `✅ Ready to play! (Duration: ${messagePackage.metadata?.duration || 'unknown'}s)`;
            this.showStatus('🔒 Message decrypted successfully!', 'success');
            
            // Auto-play
            await this.currentAudio.play();
            this.shadowRoot.getElementById('playButton').textContent = '⏸️';

            // Hide manual load button on success
            this.updateManualLoadButton();

        } catch (error) {
            debugLog(`🔒 SECURITY: Secure playback failed: ${error.message}`, 'error');
            
            // Determine if it's likely a wrong key error
            const isKeyError = error.message.includes('decrypt') || error.message.includes('OperationError');
            if (isKeyError) {
                this.showStatus('🔒 Wrong physical key - this message requires a different Peeble.', 'error');
                this.showErrorState();
            } else {
                this.showStatus(`🔒 Playback failed: ${error.message}`, 'error');
            }
            
            this.shadowRoot.getElementById('playingInfo').textContent = 'Decryption failed.';
            this.currentAudio.src = '';
            
            // Show manual load button on error for retry
            this.updateManualLoadButton();
        }
    }

    showErrorState() {
        this.shadowRoot.getElementById('errorState').style.display = 'block';
        this.shadowRoot.getElementById('playbackAudio').style.display = 'none';
    }

    togglePlayback() {
        if (this.currentAudio && this.currentAudio.src) {
            if (this.currentAudio.paused) {
                this.currentAudio.play();
                this.shadowRoot.getElementById('playButton').textContent = '⏸️';
            } else {
                this.currentAudio.pause();
                this.shadowRoot.getElementById('playButton').textContent = '▶️';
            }
        }
    }

    closePlayback() {
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.src = '';
        }
        window.dispatchEvent(new CustomEvent('close-player'));
        debugLog('🔒 SECURITY: Secure message player closed.');
    }
}

customElements.define('message-player', MessagePlayer);
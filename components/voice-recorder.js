// components/voice-recorder.js

import { AudioService } from '../services/audio.js';
import { EncryptionService } from '../services/encryption.js';
import { StorageService } from '../services/storage.js';
import { debugLog, generateMessageId, URLParser } from '../services/utils.js';
import { stateManager } from '../services/state-manager.js';
import { eventBus } from '../services/pubsub.js';

/**
 * Web Component for the voice message recording and creation interface.
 * SECURITY: Implements secure flow where serial never leaves the physical tag.
 */
class VoiceRecorder extends HTMLElement {
    static get observedAttributes() {
        return ['serial'];
    }

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        this.audioService = new AudioService();
        this.encryptionService = new EncryptionService();
        this.storageService = null;
        this.statusDiv = null;
        this.tagSerial = null; // SECURITY: Only stored in memory, never persisted

        this.audioBlob = null;
        this.recordingDuration = 0;
        this.currentTranscript = '';

        this.handleRecordingTimeUpdate = this.handleRecordingTimeUpdate.bind(this);
        this.handleRecordingStop = this.handleRecordingStop.bind(this);
        this.handleTranscriptUpdate = this.handleTranscriptUpdate.bind(this);
        this.handleAudioServiceError = this.handleAudioServiceError.bind(this);

        this.audioService.onRecordingTimeUpdate = this.handleRecordingTimeUpdate;
        this.audioService.onRecordingStop = this.handleRecordingStop;
        this.audioService.onTranscriptUpdate = this.handleTranscriptUpdate;
        this.audioService.onError = this.handleAudioServiceError;

        this.render();
        this.setupEventListeners();
    }
    
    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'serial' && oldValue !== newValue) {
            this.tagSerial = newValue;
            this.handleSerialSet(newValue);
            debugLog(`SECURITY: Tag serial received (stored in memory only): ${newValue ? 'SET' : 'CLEARED'}`);
        }
    }
    
    connectedCallback() {
        debugLog('VoiceRecorder connected.');
    }
    
    handleSerialSet(serial) {
        this.tagSerial = serial;
        if (!this.tagSerial) {
            this.showStatus('Please scan a blank NFC tag to begin creating a message.', 'info');
        } else {
            this.showStatus('🔒 Tag scanned securely. You can now record your message.', 'success');
            debugLog('SECURITY: Physical tag detected - ready for secure recording.', 'success');
        }
    }
    
    setStorageService(service) {
        this.storageService = service;
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                @import '../style.css';
                .step { display: none; }
                .step.active { display: block; }
                .text-center { text-align: center; }
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
                .record-button {
                    width: 120px;
                    height: 120px;
                    border-radius: 50%;
                    border: none;
                    background: var(--accent-color);
                    color: white;
                    font-size: 1.1em;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    margin: 20px auto;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-direction: column;
                    box-shadow: 0 8px 20px rgba(229, 62, 62, 0.3);
                }
                .record-button:hover { transform: scale(1.05); }
                .record-button.recording { background: var(--success-color); animation: pulse 1.5s infinite; }
                .record-button.processing { background: #3182ce; cursor: not-allowed; }
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 rgba(56, 161, 105, 0.7); }
                    70% { box-shadow: 0 0 0 10px rgba(56, 161, 105, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(56, 161, 105, 0); }
                }
                .recording-time { font-size: 1.2em; font-weight: 500; color: var(--success-color); margin-top: 10px; }
                .transcript-editor textarea {
                    width: 100%;
                    min-height: 120px;
                    padding: 15px;
                    border: 2px solid var(--light-gray);
                    border-radius: 10px;
                    font-size: 1em;
                    line-height: 1.5;
                    resize: vertical;
                    outline: none;
                    transition: border-color 0.3s ease;
                }
                .transcript-editor textarea:focus { border-color: var(--primary-color); }
                .character-count { text-align: right; margin-top: 8px; color: var(--secondary-color); font-size: 0.85em; }
                .audio-player audio { width: 100%; margin: 10px 0; }
            </style>
            <div class="voice-recorder-container">
                <div class="step active" id="recording">
                    <div class="text-center">
                        <h2>🔒 Secure Voice Recording</h2>
                        <div class="security-notice">
                            <h4>🛡️ Physical Security Active</h4>
                            <p>Your tag serial is the encryption key and never leaves this device</p>
                        </div>
                        <p style="color: var(--secondary-color); margin-bottom: 20px;">Speak clearly and from the heart. Maximum 90 seconds.</p>
                        
                        <button class="record-button" id="recordBtn">
                            <span id="recordIcon">🎤</span>
                            <span id="recordText">Press to Record</span>
                        </button>
                        
                        <div class="recording-time" id="recordingTime" style="display: none;">00:00</div>
                        <div class="status" id="status">Ready to record your secure message</div>
                    </div>
                </div>

                <div class="step" id="editing">
                    <h2>Review & Edit Transcript</h2>
                    
                    <div class="audio-player">
                        <audio controls id="audioPlayback" style="display: none;"></audio>
                    </div>
                    
                    <div class="transcript-editor">
                        <textarea id="transcriptText" placeholder="Your transcript will appear here..."></textarea>
                        <div class="character-count">
                            <span id="charCount">0</span>/500 characters
                        </div>
                    </div>
                    
                    <button class="btn" id="saveBtn">🔒 Encrypt & Save Securely</button>
                    <button class="btn btn-secondary" id="retryBtn">Record Again</button>
                </div>

                <div class="step" id="success">
                    <div class="success" style="text-align: center; padding: 20px;">
                        <h2>✅ Message Encrypted & Saved!</h2>
                        <div class="security-notice">
                            <h4>🔐 Security Status</h4>
                            <p>Your message is encrypted. Only the physical Peeble can decrypt it.</p>
                        </div>
                        <p><strong>Now, tap your blank Peeble stone to write the secure URL.</strong></p>
                        <div style="margin: 20px 0; padding: 15px; background: white; border-radius: 10px;">
                            <p><strong>Secure URL (no encryption key):</strong></p>
                            <p style="font-family: monospace; word-break: break-all; font-size: 0.8em; background: #f5f5f5; padding: 10px; border-radius: 5px;" id="nfcUrlDisplay"></p>
                            <p><strong>Message ID:</strong> <span id="messageIdDisplay"></span></p>
                            <p style="color: #666; font-size: 0.85em; margin-top: 10px;">
                                ⚠️ This URL is safe to share - it cannot decrypt your message without the physical Peeble
                            </p>
                        </div>
                        <button class="btn" id="createAnotherBtn">Create Another Message</button>
                    </div>
                </div>
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
                        this.statusDiv.textContent = 'Ready for action';
                    }
                }, duration);
            }
        } else {
            debugLog(`Status display element not found in voice-recorder.`, 'warning');
        }
    }

    setupEventListeners() {
        this.shadowRoot.getElementById('recordBtn').addEventListener('click', () => this.toggleRecording());
        this.shadowRoot.getElementById('saveBtn').addEventListener('click', () => this.saveSecureMessage());
        this.shadowRoot.getElementById('retryBtn').addEventListener('click', () => this.retryRecording());
        this.shadowRoot.getElementById('createAnotherBtn').addEventListener('click', () => this.resetCreator());
        this.shadowRoot.getElementById('transcriptText').addEventListener('input', () => this.updateCharCount());
    }

    showStep(stepId) {
        this.shadowRoot.querySelectorAll('.step').forEach(step => {
            step.classList.remove('active');
        });
        this.shadowRoot.getElementById(stepId).classList.add('active');
        debugLog(`Switched to step: ${stepId}`);
    }

    async toggleRecording() {
        const { tagSerial } = stateManager.getState();
        if (!tagSerial) {
            this.showStatus('🔒 Please scan a blank NFC tag first for secure encryption.', 'warning');
            return;
        }

        if (this.audioService.getRecordingState()) {
            this.audioService.stopRecording();
            this.updateRecordingUI(false, true);
        } else {
            this.currentTranscript = '';
            this.shadowRoot.getElementById('transcriptText').value = '';
            this.updateCharCount();
            await this.audioService.startRecording();
            this.updateRecordingUI(true);
        }
    }

    updateRecordingUI(isRecording, isProcessing = false) {
        const recordBtn = this.shadowRoot.getElementById('recordBtn');
        const recordIcon = this.shadowRoot.getElementById('recordIcon');
        const recordText = this.shadowRoot.getElementById('recordText');
        const recordingTime = this.shadowRoot.getElementById('recordingTime');
        const statusDiv = this.shadowRoot.getElementById('status');

        recordBtn.classList.remove('recording', 'processing');
        if (isRecording) {
            recordBtn.classList.add('recording');
            recordIcon.textContent = '⏹️';
            recordText.textContent = 'Stop Recording';
            statusDiv.textContent = '🔒 Recording securely... Speak clearly';
            recordingTime.style.display = 'block';
        } else if (isProcessing) {
            recordBtn.classList.add('processing');
            recordIcon.textContent = '⏳';
            recordText.textContent = 'Processing...';
            statusDiv.textContent = 'Processing your recording...';
            recordingTime.style.display = 'none';
        } else {
            recordIcon.textContent = '🎤';
            recordText.textContent = 'Press to Record';
            statusDiv.textContent = 'Ready to record your secure message';
            recordingTime.style.display = 'none';
        }
    }

    handleRecordingTimeUpdate(seconds) {
        this.recordingDuration = seconds;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        this.shadowRoot.getElementById('recordingTime').textContent = 
            `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    handleRecordingStop(audioBlob, duration) {
        this.audioBlob = audioBlob;
        this.recordingDuration = duration;
        const audioUrl = URL.createObjectURL(audioBlob);
        const audioPlayback = this.shadowRoot.getElementById('audioPlayback');
        audioPlayback.src = audioUrl;
        audioPlayback.style.display = 'block';
        this.showStep('editing');
        this.updateRecordingUI(false, false);
        debugLog(`Recording stopped. Duration: ${duration}s, Blob size: ${audioBlob.size} bytes`);
    }

    handleTranscriptUpdate(transcript) {
        this.currentTranscript = transcript;
        this.shadowRoot.getElementById('transcriptText').value = transcript;
        this.updateCharCount();
    }

    handleAudioServiceError(errorMessage) {
        this.showStatus(errorMessage, 'error');
        this.updateRecordingUI(false, false);
    }

    updateCharCount() {
        const textarea = this.shadowRoot.getElementById('transcriptText');
        const charCount = this.shadowRoot.getElementById('charCount');
        charCount.textContent = textarea.value.length;
        
        if (textarea.value.length > 500) {
            charCount.style.color = 'var(--accent-color)';
        } else {
            charCount.style.color = 'var(--secondary-color)';
        }
    }

    /**
     * SECURITY: New secure save method that creates a complete encrypted package
     * and generates a URL with no encryption key exposure.
     */
    async saveSecureMessage() {
        debugLog('🔒 SECURITY: Starting secure save process...');
        const transcript = this.shadowRoot.getElementById('transcriptText').value.trim();
        const { tagSerial, pinataApiKey, pinataSecret } = stateManager.getState();
        
        // Validation
        if (!tagSerial) {
            this.showStatus('🔒 Error: No physical tag serial. Please scan a blank tag.', 'error');
            return;
        }
        if (!transcript) {
            this.showStatus('Please add a transcript before saving.', 'error');
            return;
        }
        if (transcript.length > 500) {
            this.showStatus('Transcript is too long. Max 500 characters.', 'error');
            return;
        }
        if (!this.audioBlob) {
            this.showStatus('No audio recorded. Please record a message first.', 'error');
            return;
        }
        if (!pinataApiKey || !pinataSecret) {
            this.showStatus('Pinata API credentials are not set. Please configure them.', 'error');
            return;
        }

        const saveBtn = this.shadowRoot.getElementById('saveBtn');
        const originalText = saveBtn.textContent;
        saveBtn.disabled = true;

        try {
            // Generate message metadata
            const messageId = generateMessageId();
            const timestamp = Date.now();
            
            debugLog(`🔒 SECURITY: Creating secure package - ID: ${messageId}`, 'info');
            
            // Step 1: Derive encryption key from tag serial (NEVER stored)
            saveBtn.textContent = '🔑 Deriving encryption key...';
            const encryptionKey = await this.encryptionService.deriveEncryptionKey(tagSerial, timestamp);
            debugLog('🔒 SECURITY: Encryption key derived from physical tag (not stored)', 'success');
            
            // Step 2: Encrypt audio
            saveBtn.textContent = '🔒 Encrypting audio...';
            const audioBuffer = await this.audioBlob.arrayBuffer();
            const encryptedAudio = await this.encryptionService.encryptDataToBinary(audioBuffer, encryptionKey);
            debugLog(`🔒 SECURITY: Audio encrypted (${encryptedAudio.length} bytes)`, 'success');
            
            // Step 3: Encrypt transcript
            saveBtn.textContent = '🔒 Encrypting transcript...';
            const encryptedTranscript = await this.encryptionService.encryptDataToBase64(transcript, encryptionKey);
            debugLog(`🔒 SECURITY: Transcript encrypted (${encryptedTranscript.length} chars)`, 'success');
            
            // Step 4: Create secure package (NO serial included)
            const messagePackage = {
                messageId,
                timestamp, // Used with serial for key derivation
                encryptedAudio,
                encryptedTranscript,
                metadata: {
                    duration: this.recordingDuration,
                    created: new Date().toISOString(),
                    version: 'secure-v1'
                }
                // SECURITY: tagSerial is NEVER included in the package
            };
            
            // Step 5: Upload complete package to IPFS
            saveBtn.textContent = '📤 Uploading secure package...';
            const ipfsHash = await this.storageService.uploadMessagePackage(messagePackage);
            debugLog(`🔒 SECURITY: Secure package uploaded to IPFS: ${ipfsHash}`, 'success');
            
            // Step 6: Save local reference (for UI list only)
            debugLog('💾 Saving local message reference...');
            const localMessageData = {
                messageId,
                ipfsHash,
                timestamp,
                originalTranscript: transcript, // For UI display only
                duration: this.recordingDuration,
                created: new Date().toISOString()
                // SECURITY: tagSerial is NEVER stored locally
            };

            const savedMessages = JSON.parse(localStorage.getItem('peebleMessages') || '[]');
            savedMessages.push(localMessageData);
            localStorage.setItem('peebleMessages', JSON.stringify(savedMessages));
            debugLog('💾 Local reference saved (no encryption key stored)', 'success');

            // Step 7: Generate SECURE URL (no serial)
            const secureUrl = URLParser.createSecureNfcUrl({ messageId, ipfsHash });
            debugLog('🔒 SECURITY: Secure URL generated (no encryption key exposed)', 'success');

            // Display results
            this.shadowRoot.getElementById('nfcUrlDisplay').textContent = secureUrl;
            this.shadowRoot.getElementById('messageIdDisplay').textContent = messageId;
            this.showStep('success');
            this.showStatus('🔒 Message encrypted and secured! Tap Peeble to write URL.', 'success', 0);

            // Initiate NFC write
            eventBus.publish('start-nfc-write', secureUrl);
            
        } catch (error) {
            debugLog(`🔒 SECURITY: Secure save failed: ${error.message}`, 'error');
            this.showStatus(`Failed to save message securely: ${error.message}`, 'error');
        } finally {
            saveBtn.textContent = originalText;
            saveBtn.disabled = false;
        }
    }

    retryRecording() {
        const audioPlayback = this.shadowRoot.getElementById('audioPlayback');
        audioPlayback.src = '';
        audioPlayback.style.display = 'none';
        
        this.shadowRoot.getElementById('transcriptText').value = '';
        this.currentTranscript = '';
        this.updateCharCount();
        this.audioBlob = null;
        this.recordingDuration = 0;
        
        this.updateRecordingUI(false, false);
        this.showStep('recording');
        this.showStatus('Ready to record your secure message.');
    }

    resetCreator() {
        this.retryRecording();
        this.showStatus('Ready to create a new secure message.');
        eventBus.publish('stop-nfc-write');
    }
}

customElements.define('voice-recorder', VoiceRecorder);
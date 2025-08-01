// components/voice-recorder.js

import { AudioService } from '../services/audio.js';
import { EncryptionService } from '../services/encryption.js';
import { StorageService } from '../services/storage.js';
import { debugLog, generateMessageId, URLParser } from '../services/utils.js';
import { stateManager } from '../services/state-manager.js';
import { eventBus } from '../services/pubsub.js';

/**
 * Web Component for the voice message recording and creation interface.
 */
class VoiceRecorder extends HTMLElement {
    // This is a key change: Tell the component to observe the 'serial' attribute.
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
        this.tagSerial = null;

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
            debugLog(`Attribute 'serial' changed from ${oldValue} to ${newValue}`);
        }
    }
    
    connectedCallback() {
        debugLog('VoiceRecorder connected.');
    }
    
    handleSerialSet(serial) {
        this.tagSerial = serial;
        debugLog(`VoiceRecorder received serial directly: ${this.tagSerial}`);
        if (!this.tagSerial) {
            this.showStatus('Please scan a blank NFC tag to begin creating a message.', 'info');
        } else {
            this.showStatus('Tag scanned. You can now record your message.', 'success');
        }
    }
    
    /**
     * Sets the StorageService instance. Called from the parent component (peeble-app).
     * @param {StorageService} service
     */
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
                        <h2>Record Your Voice Message</h2>
                        <p style="color: var(--secondary-color); margin-bottom: 20px;">Speak clearly and from the heart. Maximum 90 seconds.</p>
                        
                        <button class="record-button" id="recordBtn">
                            <span id="recordIcon">🎤</span>
                            <span id="recordText">Press to Record</span>
                        </button>
                        
                        <div class="recording-time" id="recordingTime" style="display: none;">00:00</div>
                        <div class="status" id="status">Ready to record your message</div>
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
                    
                    <button class="btn" id="saveBtn">Save to IPFS & Write NFC</button>
                    <button class="btn btn-secondary" id="retryBtn">Record Again</button>
                </div>

                <div class="step" id="success">
                    <div class="success" style="text-align: center; padding: 20px;">
                        <h2>✅ Message Saved & Tag Ready!</h2>
                        <p>Your encrypted voice message is now stored on the global IPFS network.</p>
                        <p><strong>Now, tap your blank Peeble stone to the back of your phone to write the URL.</strong></p>
                        <div style="margin: 20px 0; padding: 15px; background: white; border-radius: 10px;">
                            <p><strong>Generated URL:</strong> <span id="nfcUrlDisplay" style="font-family: monospace; word-break: break-all;"></span></p>
                            <p><strong>Message ID:</strong> <span id="messageIdDisplay"></span></p>
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
        this.shadowRoot.getElementById('saveBtn').addEventListener('click', () => this.saveToIPFSAndWriteNFC());
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
            this.showStatus('Please scan a blank NFC tag first.', 'warning');
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
            statusDiv.textContent = 'Recording... Speak clearly into your microphone';
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
            statusDiv.textContent = 'Ready to record your message';
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

    async saveToIPFSAndWriteNFC() {
        debugLog('Save to IPFS button clicked. Starting save process...');
        const transcript = this.shadowRoot.getElementById('transcriptText').value.trim();
        const { tagSerial, pinataApiKey, pinataSecret } = stateManager.getState();
        
        debugLog(`Transcript value before validation: '${transcript}'`);
        debugLog(`Tag serial: '${tagSerial}'`);

        if (!tagSerial) {
            this.showStatus('Error: No NFC tag serial number available. Please scan a blank tag to start.', 'error');
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

        debugLog('All validation checks passed. Entering try block.');

        const saveBtn = this.shadowRoot.getElementById('saveBtn');
        const originalText = saveBtn.textContent;
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        debugLog('All validation checks passed. Entering try block to save.');

        try {
            debugLog('Entering try block. Generating message ID and timestamp.');
            const messageId = generateMessageId();
            const timestamp = Date.now();
            
            debugLog(`Generated message data: ID=${messageId}, Serial: ${tagSerial}, Timestamp=${timestamp}`);
            
            saveBtn.textContent = 'Deriving encryption key...';
            const encryptionKey = await this.encryptionService.deriveEncryptionKey(tagSerial, timestamp);
            debugLog('Encryption key derived successfully.', 'success');
            
            saveBtn.textContent = 'Encrypting audio...';
            const audioBuffer = await this.audioBlob.arrayBuffer();
            const encryptedAudioBinary = await this.encryptionService.encryptDataToBinary(audioBuffer, encryptionKey);
            debugLog(`Audio encrypted to binary: ${encryptedAudioBinary.length} bytes`, 'success');
            
            saveBtn.textContent = 'Encrypting transcript...';
            const encryptedTranscript = await this.encryptionService.encryptDataToBase64(transcript, encryptionKey);
            debugLog(`Transcript encrypted to Base64: ${encryptedTranscript.length} characters`, 'success');
            
            saveBtn.textContent = 'Uploading to IPFS...';
            const ipfsHash = await this.storageService.uploadToPinata(encryptedAudioBinary, `${messageId}-audio.encrypted`);
            debugLog(`IPFS upload complete: ${ipfsHash}`, 'success');
            
            debugLog('Saving message metadata to localStorage...');
            const messageData = {
                messageId,
                serial: tagSerial,
                timestamp,
                ipfsHash,
                encryptedTranscript,
                originalTranscript: transcript,
                duration: this.recordingDuration,
                created: new Date().toISOString()
            };

            const savedMessages = JSON.parse(localStorage.getItem('peebleMessages') || '[]');
            savedMessages.push(messageData);
            localStorage.setItem('peebleMessages', JSON.stringify(savedMessages));
            debugLog('Message metadata saved to localStorage.', 'success');

            const nfcUrl = URLParser.createNfcUrl({ serial: tagSerial, messageId: messageId, timestamp: timestamp });

            this.shadowRoot.getElementById('nfcUrlDisplay').textContent = nfcUrl;
            this.shadowRoot.getElementById('messageIdDisplay').textContent = messageId;
            this.showStep('success');
            this.showStatus('Message saved! Now tap your Peeble to write the URL.', 'success', 0);

            eventBus.publish('start-nfc-write', nfcUrl);
            
        } catch (error) {
            debugLog(`Save and NFC write preparation failed: ${error.message}`, 'error');
            this.showStatus(`Failed to save message: ${error.message}`, 'error');
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
        this.showStatus('Ready to record your message.');
    }

    resetCreator() {
        this.retryRecording();
        this.showStatus('Ready to create a new message.');
        eventBus.publish('stop-nfc-write');
    }
}

customElements.define('voice-recorder', VoiceRecorder);
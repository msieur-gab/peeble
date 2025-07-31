// components/voice-recorder.js

import { AudioService } from '../services/audio.js';
import { EncryptionService } from '../services/encryption.js';
import { StorageService } from '../services/storage.js';
import { debugLog, generateMessageId, URLParser } from '../services/utils.js';

/**
 * Web Component for the voice message recording and creation interface.
 */
class VoiceRecorder extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        this.audioService = new AudioService();
        this.encryptionService = new EncryptionService();
        // StorageService instance will be passed from main.js or peeble-app.js
        this.storageService = null;
        this.statusDiv = null; // Reference to the status div in the shadow DOM
        this.tagSerial = null; // The NFC tag's serial number

        this.audioBlob = null;
        this.recordingDuration = 0;
        this.currentTranscript = '';

        // Bind event handlers
        this.handleRecordingTimeUpdate = this.handleRecordingTimeUpdate.bind(this);
        this.handleRecordingStop = this.handleRecordingStop.bind(this);
        this.handleTranscriptUpdate = this.handleTranscriptUpdate.bind(this);
        this.handleAudioServiceError = this.handleAudioServiceError.bind(this);

        // Set up AudioService callbacks
        this.audioService.onRecordingTimeUpdate = this.handleRecordingTimeUpdate;
        this.audioService.onRecordingStop = this.handleRecordingStop;
        this.audioService.onTranscriptUpdate = this.handleTranscriptUpdate;
        this.audioService.onError = this.handleAudioServiceError;

        this.render();
        this.setupEventListeners();
    }
    
    /**
     * Lifecycle callback to handle when the component is inserted into the DOM.
     */
    connectedCallback() {
        debugLog('VoiceRecorder connected. Waiting for serial from parent.');
        // Initial status is handled by the parent calling setSerial.
    }
    
    /**
     * Sets the StorageService instance. Called from the parent component (peeble-app).
     * @param {StorageService} service
     */
    setStorageService(service) {
        this.storageService = service;
    }
    
    /**
     * Sets the NFC tag serial number. Called by the parent component.
     * @param {string} serial - The NFC tag's serial number.
     */
    setSerial(serial) {
        this.tagSerial = serial;
        debugLog(`VoiceRecorder received serial: ${this.tagSerial}.`);
        if (!this.tagSerial) {
            this.showStatus('Please scan a blank NFC tag to begin creating a message.', 'info');
        } else {
            this.showStatus('Tag scanned. You can now record your message.', 'success');
        }
    }

    /**
     * Renders the initial HTML structure of the voice recorder.
     * @private
     */
    render() {
        this.shadowRoot.innerHTML = `
            <style>
                /* Import global styles (or copy relevant ones) */
                @import '../style.css';

                /* Component-specific styles if any overrides are needed */
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
                <!-- Step 1: Recording -->
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

                <!-- Step 2: Edit & Save -->
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

                <!-- Step 3: Success -->
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

    /**
     * Displays a status message to the user.
     * @param {string} message - The message to display.
     * @param {'info'|'success'|'warning'|'error'} [type='info'] - The type of status message.
     * @param {number} [duration=5000] - How long the message should be displayed in milliseconds.
     */
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


    /**
     * Sets up event listeners for buttons and text areas.
     * @private
     */
    setupEventListeners() {
        this.shadowRoot.getElementById('recordBtn').addEventListener('click', () => this.toggleRecording());
        this.shadowRoot.getElementById('saveBtn').addEventListener('click', () => this.saveToIPFSAndWriteNFC());
        this.shadowRoot.getElementById('retryBtn').addEventListener('click', () => this.retryRecording());
        this.shadowRoot.getElementById('createAnotherBtn').addEventListener('click', () => this.resetCreator());
        this.shadowRoot.getElementById('transcriptText').addEventListener('input', () => this.updateCharCount());
    }

    /**
     * Displays a specific step in the recording workflow.
     * @param {string} stepId - The ID of the step to display ('recording', 'editing', 'success').
     * @private
     */
    showStep(stepId) {
        this.shadowRoot.querySelectorAll('.step').forEach(step => {
            step.classList.remove('active');
        });
        this.shadowRoot.getElementById(stepId).classList.add('active');
        debugLog(`Switched to step: ${stepId}`);
    }

    /**
     * Toggles the recording state (start/stop).
     * @private
     */
    async toggleRecording() {
        debugLog(`Toggle recording called. Current serial is: ${this.tagSerial}`);
        if (!this.tagSerial) {
            this.showStatus('Please scan a blank NFC tag first.', 'warning');
            return;
        }

        if (this.audioService.getRecordingState()) {
            this.audioService.stopRecording();
            this.updateRecordingUI(false, true); // Indicate processing
        } else {
            this.currentTranscript = ''; // Clear transcript for new recording
            this.shadowRoot.getElementById('transcriptText').value = '';
            this.updateCharCount();
            await this.audioService.startRecording();
            this.updateRecordingUI(true);
        }
    }

    /**
     * Updates the UI based on recording state.
     * @param {boolean} isRecording - True if recording, false otherwise.
     * @param {boolean} isProcessing - True if processing after recording, false otherwise.
     * @private
     */
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

    /**
     * Callback for audio service to update recording time.
     * @param {number} seconds - Elapsed seconds.
     * @private
     */
    handleRecordingTimeUpdate(seconds) {
        this.recordingDuration = seconds;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        this.shadowRoot.getElementById('recordingTime').textContent = 
            `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    /**
     * Callback for audio service when recording stops.
     * @param {Blob} audioBlob - The recorded audio Blob.
     * @param {number} duration - The duration of the recording in seconds.
     * @private
     */
    handleRecordingStop(audioBlob, duration) {
        this.audioBlob = audioBlob;
        this.recordingDuration = duration;
        const audioUrl = URL.createObjectURL(audioBlob);
        const audioPlayback = this.shadowRoot.getElementById('audioPlayback');
        audioPlayback.src = audioUrl;
        audioPlayback.style.display = 'block';
        this.showStep('editing');
        this.updateRecordingUI(false, false); // Reset UI after processing
        debugLog(`Recording stopped. Duration: ${duration}s, Blob size: ${audioBlob.size} bytes`);
    }

    /**
     * Callback for audio service to update transcript.
     * @param {string} transcript - The current transcript.
     * @private
     */
    handleTranscriptUpdate(transcript) {
        this.currentTranscript = transcript;
        this.shadowRoot.getElementById('transcriptText').value = transcript;
        this.updateCharCount();
    }

    /**
     * Callback for audio service errors.
     * @param {string} errorMessage - The error message.
     * @private
     */
    handleAudioServiceError(errorMessage) {
        this.showStatus(errorMessage, 'error');
        this.updateRecordingUI(false, false); // Reset UI on error
    }

    /**
     * Updates the character count for the transcript.
     * @private
     */
    updateCharCount() {
        const textarea = this.shadowRoot.getElementById('transcriptText');
        const charCount = this.shadowRoot.getElementById('charCount');
        charCount.textContent = textarea.value.length;
        
        if (textarea.value.length > 500) {
            charCount.style.color = 'var(--accent-color)'; // Red color for overflow
        } else {
            charCount.style.color = 'var(--secondary-color)';
        }
    }

    /**
     * Saves the encrypted message to IPFS and prepares to write to NFC.
     * @private
     */
    async saveToIPFSAndWriteNFC() {
        const transcript = this.shadowRoot.getElementById('transcriptText').value.trim();
        
        if (!this.tagSerial) {
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
        if (!this.storageService || (!this.storageService.apiKey || !this.storageService.secret)) {
            this.showStatus('Pinata API credentials are not set. Please configure them.', 'error');
            return;
        }

        const saveBtn = this.shadowRoot.getElementById('saveBtn');
        const originalText = saveBtn.textContent;
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            // Generate unique identifiers for this message
            const messageId = generateMessageId();
            const timestamp = Date.now();
            
            debugLog(`Generated message data: ID=${messageId}, Serial: ${this.tagSerial}, Timestamp=${timestamp}`);
            
            saveBtn.textContent = 'Deriving encryption key...';
            // Use the tag's serial number for key derivation
            const encryptionKey = await this.encryptionService.deriveEncryptionKey(this.tagSerial, timestamp);
            debugLog('Encryption key derived successfully.', 'success');
            
            // Convert audio blob to ArrayBuffer for encryption
            saveBtn.textContent = 'Encrypting audio...';
            const audioBuffer = await this.audioBlob.arrayBuffer();
            const encryptedAudioBinary = await this.encryptionService.encryptDataToBinary(audioBuffer, encryptionKey);
            debugLog(`Audio encrypted to binary: ${encryptedAudioBinary.length} bytes`, 'success');
            
            // Encrypt transcript (optional, but good for consistency/future features)
            saveBtn.textContent = 'Encrypting transcript...';
            const encryptedTranscript = await this.encryptionService.encryptDataToBase64(transcript, encryptionKey);
            debugLog(`Transcript encrypted to Base64: ${encryptedTranscript.length} characters`, 'success');
            
            // Upload encrypted audio to IPFS
            saveBtn.textContent = 'Uploading to IPFS...';
            const ipfsHash = await this.storageService.uploadToPinata(encryptedAudioBinary, `${messageId}-audio.encrypted`);
            debugLog(`IPFS upload complete: ${ipfsHash}`, 'success');
            
            // Store message metadata locally (simulating a saved "Peeble stone" for the reader)
            const messageData = {
                messageId,
                serial: this.tagSerial,
                timestamp,
                ipfsHash,
                encryptedTranscript, // Store encrypted transcript for local playback
                originalTranscript: transcript, // Store original for preview in reader list
                duration: this.recordingDuration,
                created: new Date().toISOString()
            };

            const savedMessages = JSON.parse(localStorage.getItem('peebleMessages') || '[]');
            savedMessages.push(messageData);
            localStorage.setItem('peebleMessages', JSON.stringify(savedMessages));
            debugLog('Message metadata saved to localStorage.', 'success');

            // Generate the NFC URL, now using the tag's serial number
            const nfcUrl = URLParser.createNfcUrl({ serial: this.tagSerial, messageId: messageId, timestamp: timestamp });

            // Display success message and generated URL for NFC writing
            this.shadowRoot.getElementById('nfcUrlDisplay').textContent = nfcUrl;
            this.shadowRoot.getElementById('messageIdDisplay').textContent = messageId;
            this.showStep('success');
            this.showStatus('Message saved! Now tap your Peeble to write the URL.', 'success', 0); // Keep message visible

            // Dispatch event to main app to trigger NFC write mode
            // The NFC handler will listen for this and initiate writing when a tag is tapped.
            const event = new CustomEvent('start-nfc-write', { detail: { url: nfcUrl } });
            window.dispatchEvent(event);
            
        } catch (error) {
            debugLog(`Save and NFC write preparation failed: ${error.message}`, 'error');
            this.showStatus(`Failed to save message: ${error.message}`, 'error');
        } finally {
            saveBtn.textContent = originalText;
            saveBtn.disabled = false;
        }
    }

    /**
     * Resets the recorder to allow a new recording.
     * @private
     */
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

    /**
     * Resets the entire creator workflow.
     * @private
     */
    resetCreator() {
        this.retryRecording();
        // Also clear any NFC writing instructions
        this.showStatus('Ready to create a new message.');
        // Notify parent to potentially stop NFC write mode if active
        window.dispatchEvent(new CustomEvent('stop-nfc-write'));
    }
}

customElements.define('voice-recorder', VoiceRecorder);

// components/peeble-app.js

import { debugLog } from '../services/utils.js';

/**
 * The main application Web Component - now purely reactive.
 * Just renders based on state and publishes events for user actions.
 */
class PeebleApp extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.stateManager = null;
        this.eventBus = null;
        this.unsubscribe = null;
        this.render();
    }

    initialize(services) {
        this.stateManager = services.stateManager;
        this.eventBus = services.eventBus;
        debugLog('🔒 SECURITY: PeebleApp initialized with reactive services.');
        
        this.setupStateSubscription();
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
                .creator-container, .reader-container {
                    width: 100%;
                    max-width: 600px;
                }
                .waiting-state {
                    text-align: center;
                    padding: 40px 20px;
                }
                .recording-controls {
                    text-align: center;
                    padding: 20px;
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
                .record-button.recording { 
                    background: var(--success-color); 
                    animation: pulse 1.5s infinite; 
                }
                .record-button.processing { 
                    background: #3182ce; 
                    cursor: not-allowed; 
                }
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 rgba(56, 161, 105, 0.7); }
                    70% { box-shadow: 0 0 0 10px rgba(56, 161, 105, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(56, 161, 105, 0); }
                }
                .recording-time {
                    font-size: 1.2em;
                    font-weight: 500;
                    color: var(--success-color);
                    margin-top: 10px;
                }
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
                .character-count { 
                    text-align: right; 
                    margin-top: 8px; 
                    color: var(--secondary-color); 
                    font-size: 0.85em; 
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
                .transcript-display {
                    background: var(--info-bg);
                    padding: 15px;
                    border-radius: 10px;
                    font-style: italic;
                    margin: 15px 0;
                    color: var(--dark-gray);
                    line-height: 1.4;
                }
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
                .error-state {
                    text-align: center;
                    padding: 20px;
                    background: #fee;
                    border-radius: 10px;
                    margin: 20px 0;
                }
                .error-state h3 { color: #c53030; margin-bottom: 10px; }
                .error-state p { color: #666; margin-bottom: 15px; }
                audio { width: 100%; margin: 10px 0; }
                .success-display {
                    text-align: center;
                    padding: 20px;
                    background: var(--success-bg);
                    border-radius: 10px;
                    margin: 20px 0;
                }
                .url-display {
                    margin: 20px 0;
                    padding: 15px;
                    background: white;
                    border-radius: 10px;
                }
                .url-display p {
                    font-family: monospace;
                    word-break: break-all;
                    font-size: 0.8em;
                    background: #f5f5f5;
                    padding: 10px;
                    border-radius: 5px;
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

    setupStateSubscription() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }

        this.unsubscribe = this.eventBus.subscribe('state-change', (state) => {
            this.handleStateChange(state);
        });
    }

    handleStateChange(state) {
        // Update status display
        this.showStatus(state.statusMessage, state.statusType);
        
        // Render appropriate mode
        if (state.appMode === 'CREATOR') {
            this.renderCreatorMode(state);
        } else {
            this.renderReaderMode(state);
        }
    }

    renderCreatorMode(state) {
        const { currentStep, tagSerial, isRecording, isProcessing, recordingDuration, 
                currentTranscript, messageId, ipfsHash } = state;
        
        switch (currentStep) {
            case 'waiting':
                this.appContent.innerHTML = `
                    <div class="creator-container">
                        <h2>🔒 Secure Voice Recording</h2>
                        <div class="security-notice">
                            <h4>🛡️ Physical Security Active</h4>
                            <p>Your tag serial is the encryption key and never leaves this device</p>
                        </div>
                        <div class="waiting-state">
                            ${tagSerial ? `
                                <p>✅ Physical key secured: ${tagSerial}</p>
                                <p>Ready to record your secure message!</p>
                            ` : `
                                <p>Please scan a blank NFC tag to begin.</p>
                            `}
                        </div>
                        ${tagSerial ? `
                            <div class="recording-controls">
                                <button class="record-button" id="recordBtn">
                                    <span>🎤</span>
                                    <span>Press to Record</span>
                                </button>
                            </div>
                        ` : ''}
                    </div>
                `;
                break;
                
            case 'recording':
                this.appContent.innerHTML = `
                    <div class="creator-container">
                        <h2>🔒 Recording in Progress</h2>
                        <div class="recording-controls">
                            <button class="record-button recording" id="recordBtn">
                                <span>⏹️</span>
                                <span>Stop Recording</span>
                            </button>
                            <div class="recording-time">${this.formatTime(recordingDuration)}</div>
                        </div>
                        <p>Speak clearly and from the heart. Maximum 90 seconds.</p>
                    </div>
                `;
                break;
                
            case 'editing':
                this.appContent.innerHTML = `
                    <div class="creator-container">
                        <h2>Review & Edit Transcript</h2>
                        <audio controls id="audioPlayback" src="${state.audioBlob ? URL.createObjectURL(state.audioBlob) : ''}"></audio>
                        <div class="transcript-editor">
                            <textarea id="transcriptText" placeholder="Your transcript...">${currentTranscript}</textarea>
                            <div class="character-count">
                                <span id="charCount">${currentTranscript.length}</span>/500 characters
                            </div>
                        </div>
                        <button class="btn" id="saveBtn" ${isProcessing ? 'disabled' : ''}>
                            ${isProcessing ? '🔒 Encrypting...' : '🔒 Encrypt & Save Securely'}
                        </button>
                        <button class="btn btn-secondary" id="retryBtn" ${isProcessing ? 'disabled' : ''}>
                            Record Again
                        </button>
                    </div>
                `;
                break;
                
            case 'success':
                const secureUrl = `${window.location.origin}${window.location.pathname}#messageId=${messageId}&ipfsHash=${ipfsHash}`;
                this.appContent.innerHTML = `
                    <div class="creator-container">
                        <div class="success-display">
                            <h2>✅ Message Encrypted & Saved!</h2>
                            <div class="security-notice">
                                <h4>🔐 Security Status</h4>
                                <p>Your message is encrypted. Only the physical Peeble can decrypt it.</p>
                            </div>
                            <p><strong>Now, tap your blank Peeble stone to write the secure URL.</strong></p>
                            <div class="url-display">
                                <p><strong>Secure URL (no encryption key):</strong></p>
                                <p>${secureUrl}</p>
                                <p><strong>Message ID:</strong> ${messageId}</p>
                                <p style="color: #666; font-size: 0.85em; margin-top: 10px;">
                                    ⚠️ This URL is safe to share - it cannot decrypt your message without the physical Peeble
                                </p>
                            </div>
                            <button class="btn" id="createAnotherBtn">Create Another Message</button>
                        </div>
                    </div>
                `;
                break;
        }
        
        this.setupCreatorEventListeners(state);
    }

    renderReaderMode(state) {
        const { currentStep, tagSerial, messageId, ipfsHash, decryptedTranscript, 
                audioUrl, isPlaying, errorMessage } = state;
        
        switch (currentStep) {
            case 'waiting':
                this.appContent.innerHTML = `
                    <div class="reader-container">
                        <h2>🔒 Secure Peeble Playback</h2>
                        <div class="security-notice">
                            <h4>🔒 Physical Key Required</h4>
                            <p>Please scan the Peeble stone to decrypt this message</p>
                        </div>
                        <div class="waiting-state">
                            <h3>🔄 Waiting for Physical Peeble</h3>
                            <p>This message is encrypted and requires the original Peeble stone to decrypt.</p>
                            <p><strong>Tap the Peeble to your phone to continue...</strong></p>
                            <div style="margin-top: 30px; padding: 15px; background: #f5f5f5; border-radius: 10px;">
                                <p style="font-size: 0.9em; color: #333;">
                                    <strong>Message ID:</strong> ${messageId || 'Loading...'}<br>
                                    <strong>IPFS Hash:</strong> ${ipfsHash ? ipfsHash.substring(0, 20) + '...' : 'Loading...'}
                                </p>
                            </div>
                        </div>
                    </div>
                `;
                break;
                
            case 'loading':
                this.appContent.innerHTML = `
                    <div class="reader-container">
                        <h2>🔒 Decrypting Message</h2>
                        <div class="security-notice">
                            <h4>🛡️ Physical Security Verification</h4>
                            <p>Decryption using physical key: ${tagSerial}</p>
                        </div>
                        <div class="playback-controls">
                            <div class="play-button" style="cursor: not-allowed; background: #cbd5e0;">
                                🔄
                            </div>
                            <div class="message-info">
                                <h4>Peeble ${messageId}</h4>
                                <p>🔓 Downloading and decrypting...</p>
                            </div>
                        </div>
                    </div>
                `;
                break;
                
            case 'playing':
                this.appContent.innerHTML = `
                    <div class="reader-container">
                        <h2>🔒 Secure Message Ready</h2>
                        <div class="security-notice">
                            <h4>🛡️ Successfully Decrypted</h4>
                            <p>Message unlocked with physical key: ${tagSerial}</p>
                        </div>
                        <div class="playback-controls">
                            <button class="play-button" id="playButton">
                                ${isPlaying ? '⏸️' : '▶️'}
                            </button>
                            <div class="message-info">
                                <h4>Peeble ${messageId}</h4>
                                <p>✅ Ready to play!</p>
                            </div>
                        </div>
                        <audio id="playbackAudio" src="${audioUrl}" style="display: none;"></audio>
                        <div class="transcript-display">"${decryptedTranscript}"</div>
                        <button class="btn btn-secondary" id="closePlayerBtn">Close Player</button>
                    </div>
                `;
                break;
                
            case 'error':
                this.appContent.innerHTML = `
                    <div class="reader-container">
                        <div class="error-state">
                            <h3>🔒 Decryption Failed</h3>
                            <p>This message requires the original physical Peeble to decrypt.</p>
                            <p>Error: ${errorMessage}</p>
                            <p>Please scan the correct Peeble stone that was used to create this message.</p>
                            <button class="btn btn-secondary" id="closePlayerBtn">Close Player</button>
                        </div>
                    </div>
                `;
                break;
        }
        
        this.setupReaderEventListeners(state);
    }

    setupCreatorEventListeners(state) {
        const recordBtn = this.shadowRoot.getElementById('recordBtn');
        const saveBtn = this.shadowRoot.getElementById('saveBtn');
        const retryBtn = this.shadowRoot.getElementById('retryBtn');
        const createAnotherBtn = this.shadowRoot.getElementById('createAnotherBtn');
        const transcriptText = this.shadowRoot.getElementById('transcriptText');
        
        if (recordBtn) {
            recordBtn.addEventListener('click', () => {
                if (state.isRecording) {
                    this.eventBus.publish('stop-recording');
                } else {
                    this.eventBus.publish('start-recording');
                }
            });
        }
        
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const transcript = transcriptText ? transcriptText.value.trim() : '';
                this.eventBus.publish('save-secure-message', transcript);
            });
        }
        
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                this.eventBus.publish('retry-recording');
            });
        }
        
        if (createAnotherBtn) {
            createAnotherBtn.addEventListener('click', () => {
                this.eventBus.publish('create-another');
            });
        }
        
        if (transcriptText) {
            transcriptText.addEventListener('input', () => {
                const charCount = this.shadowRoot.getElementById('charCount');
                if (charCount) {
                    charCount.textContent = transcriptText.value.length;
                }
            });
        }
    }

    setupReaderEventListeners(state) {
        const playButton = this.shadowRoot.getElementById('playButton');
        const closePlayerBtn = this.shadowRoot.getElementById('closePlayerBtn');
        const playbackAudio = this.shadowRoot.getElementById('playbackAudio');
        
        if (playButton) {
            playButton.addEventListener('click', () => {
                this.eventBus.publish('toggle-playback');
            });
        }
        
        if (closePlayerBtn) {
            closePlayerBtn.addEventListener('click', () => {
                this.eventBus.publish('close-player');
            });
        }
        
        if (playbackAudio) {
            playbackAudio.addEventListener('ended', () => {
                if (playButton) playButton.textContent = '▶️';
            });
            
            // Listen for auto-play event
            this.eventBus.subscribe('auto-play-audio', () => {
                playbackAudio.play().then(() => {
                    if (playButton) playButton.textContent = '⏸️';
                }).catch(error => {
                    debugLog(`Auto-play failed: ${error.message}`, 'warning');
                });
            });
            
            // Listen for toggle playback event
            this.eventBus.subscribe('audio-toggle-playback', () => {
                if (playbackAudio.paused) {
                    playbackAudio.play();
                    if (playButton) playButton.textContent = '⏸️';
                } else {
                    playbackAudio.pause();
                    if (playButton) playButton.textContent = '▶️';
                }
            });
        }
    }

    showStatus(message, type = 'info') {
        if (this.statusDiv && message) {
            this.statusDiv.textContent = message;
            this.statusDiv.className = `status ${type}`;
        }
    }

    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    disconnectedCallback() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }
}

customElements.define('peeble-app', PeebleApp);
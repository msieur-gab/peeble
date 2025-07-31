// components/message-player.js

import { EncryptionService } from '../services/encryption.js';
import { StorageService } from '../services/storage.js';
import { debugLog, showStatus } from '../services/utils.js';

/**
 * Web Component for playing back encrypted voice messages.
 * It expects 'uuid', 'message-id', and 'timestamp' attributes.
 */
class MessagePlayer extends HTMLElement {
    static get observedAttributes() {
        return ['uuid', 'message-id', 'timestamp'];
    }

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        this.encryptionService = new EncryptionService();
        this.storageService = null; // Will be set by parent component
        this.currentAudio = null; // Reference to the audio element

        this.render();
        this.setupEventListeners();
    }

    /**
     * Sets the StorageService instance. Called from the parent component (peeble-app).
     * @param {StorageService} service
     */
    setStorageService(service) {
        this.storageService = service;
    }

    /**
     * Renders the initial HTML structure of the message player.
     * @private
     */
    render() {
        this.shadowRoot.innerHTML = `
            <style>
                /* Import global styles (or copy relevant ones) */
                @import '../style.css';

                /* Component-specific styles */
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
            </style>
            <div class="message-player-container">
                <h2>🎧 Playing Your Peeble Message</h2>
                <div class="playback-controls">
                    <button class="play-button" id="playButton">▶️</button>
                    <div class="message-info">
                        <h4 id="playingTitle">Loading message...</h4>
                        <p id="playingInfo">Decrypting and preparing audio...</p>
                    </div>
                </div>
                <div id="playingTranscript"></div>
                <audio id="playbackAudio" controls></audio>
                <button class="btn btn-secondary" id="closePlayerBtn">Close Player</button>
            </div>
        `;
    }

    /**
     * Sets up event listeners for playback controls.
     * @private
     */
    setupEventListeners() {
        this.shadowRoot.getElementById('playButton').addEventListener('click', () => this.togglePlayback());
        this.shadowRoot.getElementById('closePlayerBtn').addEventListener('click', () => this.closePlayback());
        this.currentAudio = this.shadowRoot.getElementById('playbackAudio');
        this.currentAudio.addEventListener('ended', () => {
            this.shadowRoot.getElementById('playButton').textContent = '▶️';
        });
    }

    /**
     * Lifecycle callback when the element is added to the DOM.
     * @private
     */
    connectedCallback() {
        debugLog('MessagePlayer connected to DOM.');
        // Ensure storageService is set before attempting to load message
        // This might be called before setStorageService if the parent renders quickly.
        // The loadMessage will handle the check.
        this.loadMessage();
    }

    /**
     * Lifecycle callback when an observed attribute changes.
     * @param {string} name - The name of the attribute.
     * @param {string} oldValue - The old value of the attribute.
     * @param {string} newValue - The new value of the attribute.
     * @private
     */
    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            debugLog(`Attribute changed: ${name} from ${oldValue} to ${newValue}`);
            // Reload message if critical parameters change, e.g., if user scans a different tag
            if (name === 'uuid' || name === 'message-id' || name === 'timestamp') {
                this.loadMessage();
            }
        }
    }

    /**
     * Loads, decrypts, and prepares the message for playback.
     * @private
     */
    async loadMessage() {
        const uuid = this.getAttribute('uuid');
        const messageId = this.getAttribute('message-id');
        const timestamp = parseInt(this.getAttribute('timestamp'), 10);

        if (!uuid || !messageId || isNaN(timestamp)) {
            showStatus('Missing or invalid message parameters.', 'error');
            debugLog('Missing or invalid message parameters for playback.', 'error');
            return;
        }

        if (!this.storageService || (!this.storageService.apiKey || !this.storageService.secret)) {
            showStatus('Pinata API credentials are not set. Cannot play message.', 'error');
            debugLog('StorageService not initialized or missing credentials.', 'error');
            return;
        }

        this.shadowRoot.getElementById('playingTitle').textContent = `Peeble ${messageId}`;
        this.shadowRoot.getElementById('playingInfo').textContent = 'Downloading from IPFS...';
        showStatus('Downloading message...', 'info', 0); // Keep status visible

        try {
            debugLog(`Starting playback for message: ${messageId}, UUID: ${uuid}, Timestamp: ${timestamp}`);
            
            // 1. Download encrypted audio from IPFS
            const encryptedBinaryData = await this.storageService.downloadFromPinata(messageId); // messageId is the IPFS hash
            debugLog(`Downloaded encrypted binary data: ${encryptedBinaryData.length} bytes`, 'success');
            
            // 2. Derive decryption key
            this.shadowRoot.getElementById('playingInfo').textContent = 'Deriving decryption key...';
            const decryptionKey = await this.encryptionService.deriveEncryptionKey(uuid, timestamp);
            debugLog('Decryption key derived successfully.', 'success');
            
            // 3. Decrypt audio from binary data
            this.shadowRoot.getElementById('playingInfo').textContent = 'Decrypting audio...';
            const decryptedAudio = await this.encryptionService.decryptFromBinary(encryptedBinaryData, decryptionKey);
            debugLog(`Audio decrypted successfully: ${decryptedAudio.byteLength} bytes`, 'success');
            
            // 4. Create playable audio Blob and set to audio element
            const audioBlob = new Blob([decryptedAudio], { type: 'audio/webm' }); // Assuming webm format from recording
            const audioUrl = URL.createObjectURL(audioBlob);
            this.currentAudio.src = audioUrl;
            
            // 5. Retrieve and decrypt transcript (from localStorage, assuming it was saved there for quick access)
            // In a real scenario, the transcript might also be stored on IPFS or a lookup service.
            // For this demo, we rely on the `peebleMessages` in localStorage.
            const savedMessages = JSON.parse(localStorage.getItem('peebleMessages') || '[]');
            const messageData = savedMessages.find(msg => msg.messageId === messageId);

            let transcriptText = 'Transcript not available.';
            if (messageData && messageData.encryptedTranscript) {
                debugLog('Decrypting transcript from localStorage...');
                try {
                    const decryptedTranscriptBinary = await this.encryptionService.decryptFromBase64(messageData.encryptedTranscript, decryptionKey);
                    transcriptText = new TextDecoder().decode(decryptedTranscriptBinary);
                    debugLog('Transcript decrypted successfully.', 'success');
                } catch (transcriptError) {
                    debugLog(`Failed to decrypt transcript: ${transcriptError.message}`, 'warning');
                    transcriptText = 'Failed to decrypt transcript.';
                }
            } else {
                debugLog('Encrypted transcript not found in localStorage.', 'warning');
            }
            this.shadowRoot.getElementById('playingTranscript').textContent = `"${transcriptText}"`;

            this.shadowRoot.getElementById('playingInfo').textContent = `Ready to play!`;
            showStatus('Message loaded and ready to play!', 'success');
            
            // Auto-play the audio
            await this.currentAudio.play();
            this.shadowRoot.getElementById('playButton').textContent = '⏸️'; // Change to pause icon

        } catch (error) {
            debugLog(`Playback failed: ${error.message}`, 'error');
            showStatus(`Failed to play message: ${error.message}. Check console for details.`, 'error');
            this.shadowRoot.getElementById('playingInfo').textContent = 'Error loading message.';
            this.currentAudio.src = ''; // Clear audio source on error
        }
    }

    /**
     * Toggles play/pause for the current audio.
     * @private
     */
    togglePlayback() {
        if (this.currentAudio) {
            if (this.currentAudio.paused) {
                this.currentAudio.play();
                this.shadowRoot.getElementById('playButton').textContent = '⏸️';
            } else {
                this.currentAudio.pause();
                this.shadowRoot.getElementById('playButton').textContent = '▶️';
            }
        }
    }

    /**
     * Closes the playback interface and stops audio.
     * @private
     */
    closePlayback() {
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.src = ''; // Clear the audio source
        }
        // Dispatch event to parent to switch back to default view (e.g., creator mode or list)
        window.dispatchEvent(new CustomEvent('close-player'));
        debugLog('Message player closed.');
    }
}

customElements.define('message-player', MessagePlayer);

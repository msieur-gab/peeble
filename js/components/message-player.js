// Message player component for reading mode
class MessagePlayer extends HTMLElement {
    static get observedAttributes() {
        return ['serial', 'message-id', 'timestamp'];
    }

    constructor() {
        super();
        this.messageData = null;
        this.audioElement = null;
        this.isPlaying = false;
        this.isLoaded = false;
    }

    connectedCallback() {
        window.debugService.log('🎧 Message player component connected');
        this.render();
        this.loadMessage();
    }

    render() {
        this.innerHTML = `
            <div class="player-container">
                <div class="circular-progress">
                    <svg class="progress-ring" width="200" height="200">
                        <circle class="progress-ring__circle" 
                                stroke-width="4" 
                                fill="transparent" 
                                r="90" 
                                cx="100" 
                                cy="100"
                                style="stroke: #4ecdc4;"/>
                    </svg>
                    <div class="progress-content">
                        <div class="time-display" id="timeDisplay">--:--</div>
                        <div class="status-text" id="statusText">Loading...</div>
                    </div>
                </div>

                <div class="waveform" id="waveform">
                    ${Array(20).fill(0).map(() => '<div class="wave-bar"></div>').join('')}
                </div>

                <button class="record-button" id="playButton" disabled>
                    ⏳
                </button>

                <div class="transcript-area" id="transcriptArea" style="display: none;">
                    Loading transcript...
                </div>

                <div class="nfc-status" id="messageStatus">
                    📱 Decrypting message from NFC tag...
                </div>
            </div>
        `;
    }

    async loadMessage() {
        try {
            const serial = this.getAttribute('serial');
            const messageId = this.getAttribute('message-id');
            const timestamp = this.getAttribute('timestamp');
            
            window.debugService.log(`🎧 Loading message: ${messageId} for tag ${serial}`);
            
            this.updateStatus('🔐 Deriving decryption key from tag serial...');
            
            // Derive decryption key using ACTUAL tag serial number
            const decryptionKey = await window.encryptionService.deriveKey(serial, parseInt(timestamp));
            
            this.updateStatus('☁️ Downloading from IPFS...');
            
            // Try to get IPFS hash from local storage first (for testing)
            const localMessage = this.findLocalMessage(messageId);
            let ipfsHash;
            
            if (localMessage) {
                ipfsHash = localMessage.ipfsHash;
                window.debugService.log('🎧 Found message in local storage', 'success');
                
                // Also decrypt and show transcript immediately
                this.showTranscript(localMessage.encryptedTranscript, decryptionKey);
            } else {
                // In production, IPFS hash would come from a lookup service
                throw new Error('Message not found. This is expected in demo mode.');
            }
            
            // Download encrypted audio from IPFS
            const encryptedAudio = await window.storageService.downloadFromIPFS(ipfsHash);
            
            this.updateStatus('🔓 Decrypting audio with tag serial...');
            
            // Decrypt audio using the same tag serial that was used for encryption
            const decryptedAudio = await window.encryptionService.decryptFromBinary(encryptedAudio, decryptionKey);
            
            // Create audio element
            this.audioElement = window.audioService.createAudioElement(decryptedAudio);
            this.setupAudioControls();
            
            this.updateStatus('✅ Ready to play');
            this.isLoaded = true;
            
            // Enable play button
            const playButton = this.querySelector('#playButton');
            playButton.disabled = false;
            playButton.textContent = '▶️';
            
            window.debugService.log('🎧 Message loaded successfully using tag serial!', 'success');
            
        } catch (error) {
            window.debugService.log(`🎧 Load failed: ${error.message}`, 'error');
            this.showError(`Failed to load message: ${error.message}`);
        }
    }

    async showTranscript(encryptedTranscript, decryptionKey) {
        try {
            // Decrypt transcript
            const decryptedTranscript = await window.encryptionService.decryptFromBase64(encryptedTranscript, decryptionKey);
            const transcriptText = new TextDecoder().decode(decryptedTranscript);
            
            // Show transcript
            const transcriptArea = this.querySelector('#transcriptArea');
            transcriptArea.textContent = `"${transcriptText}"`;
            transcriptArea.style.display = 'block';
            
            window.debugService.log('🎧 Transcript decrypted and displayed', 'success');
            
        } catch (error) {
            window.debugService.log(`🎧 Transcript decryption failed: ${error.message}`, 'error');
        }
    }

    findLocalMessage(messageId) {
        const savedMessages = JSON.parse(localStorage.getItem('peebleMessages') || '[]');
        return savedMessages.find(msg => msg.messageId === messageId);
    }

    setupAudioControls() {
        const playButton = this.querySelector('#playButton');
        const timeDisplay = this.querySelector('#timeDisplay');
        const progressCircle = this.querySelector('.progress-ring__circle');
        
        playButton.addEventListener('click', this.togglePlayback.bind(this));
        
        // Audio event listeners
        this.audioElement.addEventListener('loadedmetadata', () => {
            const duration = this.audioElement.duration;
            timeDisplay.textContent = window.audioService.formatDuration(duration);
        });
        
        this.audioElement.addEventListener('timeupdate', () => {
            this.updatePlaybackProgress();
        });
        
        this.audioElement.addEventListener('ended', () => {
            this.onPlaybackEnded();
        });
        
        this.audioElement.addEventListener('error', (e) => {
            window.debugService.log(`🎧 Audio error: ${e.error}`, 'error');
            this.showError('Audio playback failed');
        });
        
        // Start waveform animation
        this.startWaveformAnimation();
    }

    togglePlayback() {
        if (!this.isLoaded || !this.audioElement) return;
        
        const playButton = this.querySelector('#playButton');
        
        if (this.isPlaying) {
            this.audioElement.pause();
            this.isPlaying = false;
            playButton.textContent = '▶️';
            this.updateStatus('⏸️ Paused');
        } else {
            this.audioElement.play();
            this.isPlaying = true;
            playButton.textContent = '⏸️';
            this.updateStatus('🎵 Playing...');
        }
    }

    updatePlaybackProgress() {
        if (!this.audioElement) return;
        
        const currentTime = this.audioElement.currentTime;
        const duration = this.audioElement.duration;
        const timeDisplay = this.querySelector('#timeDisplay');
        const progressCircle = this.querySelector('.progress-ring__circle');
        
        // Update time display
        const remaining = duration - currentTime;
        timeDisplay.textContent = window.audioService.formatDuration(remaining);
        
        // Update circular progress
        const circumference = 2 * Math.PI * 90; // radius = 90
        const progress = (currentTime / duration) * circumference;
        const offset = circumference - progress;
        
        progressCircle.style.strokeDasharray = circumference;
        progressCircle.style.strokeDashoffset = offset;
    }

    onPlaybackEnded() {
        this.isPlaying = false;
        const playButton = this.querySelector('#playButton');
        const progressCircle = this.querySelector('.progress-ring__circle');
        
        playButton.textContent = '🔄';
        this.updateStatus('✅ Message complete');
        
        // Reset progress
        progressCircle.style.strokeDashoffset = '565.48';
        
        // Change button to replay after a moment
        setTimeout(() => {
            playButton.textContent = '▶️';
            this.updateStatus('🎵 Tap to replay');
        }, 2000);
    }

    startWaveformAnimation() {
        const waveformBars = Array.from(this.querySelectorAll('.wave-bar'));
        
        const animateWaveform = () => {
            if (this.isPlaying && this.audioElement) {
                // Active playing animation - sync with actual audio if possible
                waveformBars.forEach((bar, index) => {
                    const height = Math.random() * 35 + 10;
                    bar.style.height = `${height}px`;
                    bar.style.backgroundColor = '#4ecdc4';
                });
            } else {
                // Idle animation
                waveformBars.forEach((bar, index) => {
                    const height = Math.sin(Date.now() * 0.002 + index * 0.3) * 6 + 12;
                    bar.style.height = `${Math.abs(height)}px`;
                    bar.style.backgroundColor = '#ff9a9e';
                });
            }
            
            requestAnimationFrame(animateWaveform);
        };
        
        animateWaveform();
    }

    updateStatus(message) {
        const statusText = this.querySelector('#statusText');
        const messageStatus = this.querySelector('#messageStatus');
        
        if (statusText) {
            statusText.textContent = message;
        }
        
        if (messageStatus) {
            messageStatus.textContent = message;
            messageStatus.className = 'nfc-status';
        }
    }

    showError(message) {
        const messageStatus = this.querySelector('#messageStatus');
        const playButton = this.querySelector('#playButton');
        
        if (messageStatus) {
            messageStatus.textContent = `❌ ${message}`;
            messageStatus.className = 'nfc-status error';
        }
        
        if (playButton) {
            playButton.disabled = true;
            playButton.textContent = '❌';
        }
        
        this.updateStatus('Error loading message');
    }

    // Handle attribute changes
    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue && this.isConnected) {
            this.loadMessage();
        }
    }
}

// Register the custom element
customElements.define('message-player', MessagePlayer);
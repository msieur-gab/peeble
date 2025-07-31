// Voice recorder component for creation mode
class VoiceRecorder extends HTMLElement {
    constructor() {
        super();
        this.isRecording = false;
        this.recordingData = null;
        this.waveformBars = [];
        this.animationFrame = null;
        this.tagSerial = null; // Store the actual NFC tag serial number
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();
        window.debugService.log('🎤 Voice recorder component ready');
    }

    // Set the NFC tag serial number for encryption
    setTagSerial(serial) {
        this.tagSerial = serial;
        window.debugService.log(`🎤 Voice recorder linked to NFC tag: ${serial}`, 'success');
        
        // Update UI to show tag is ready
        const statusText = this.querySelector('#statusText');
        if (statusText) {
            statusText.textContent = `Ready to record (Tag: ${serial.substring(0, 8)}...)`;
        }
    }

    render() {
        this.innerHTML = `
            <div class="recorder-container">
                <div class="circular-progress">
                    <svg class="progress-ring" width="200" height="200">
                        <circle class="progress-ring__circle" 
                                stroke-width="4" 
                                fill="transparent" 
                                r="90" 
                                cx="100" 
                                cy="100"/>
                    </svg>
                    <div class="progress-content">
                        <div class="time-display" id="timeDisplay">00:00</div>
                        <div class="status-text" id="statusText">Ready to record</div>
                    </div>
                </div>

                <div class="waveform" id="waveform">
                    ${Array(20).fill(0).map(() => '<div class="wave-bar"></div>').join('')}
                </div>

                <button class="record-button" id="recordButton">
                    🎤
                </button>

                <div class="nfc-status" id="nfcStatus" style="display: none;">
                    Tap NFC tag to start recording
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        const recordButton = this.querySelector('#recordButton');
        recordButton.addEventListener('click', this.toggleRecording.bind(this));
        
        this.waveformBars = Array.from(this.querySelectorAll('.wave-bar'));
        this.startWaveformAnimation();
    }

    async toggleRecording() {
        if (this.isRecording) {
            await this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    async startRecording() {
        try {
            window.debugService.log('🎤 Starting recording...');
            
            const recordButton = this.querySelector('#recordButton');
            const statusText = this.querySelector('#statusText');
            
            recordButton.classList.add('recording');
            recordButton.textContent = '⏹️';
            statusText.textContent = 'Recording...';
            
            this.isRecording = true;
            this.recordingStartTime = Date.now();
            
            // Start audio recording with transcript
            await window.audioService.startRecording(
                this.updateTranscript.bind(this),
                this.updateProgress.bind(this)
            );
            
            this.startProgressTimer();
            
        } catch (error) {
            window.debugService.log(`🎤 Recording failed: ${error.message}`, 'error');
            this.showError('Could not access microphone. Please check permissions.');
            this.resetRecordingUI();
        }
    }

    async stopRecording() {
        if (!this.isRecording) return;
        
        window.debugService.log('🎤 Stopping recording...');
        
        const statusText = this.querySelector('#statusText');
        statusText.textContent = 'Processing...';
        
        try {
            // Stop audio recording
            this.recordingData = await window.audioService.stopRecording();
            
            if (this.recordingData) {
                window.debugService.log(`🎤 Recording complete: ${this.recordingData.duration}s`, 'success');
                this.showTranscriptEditor();
            } else {
                throw new Error('No recording data received');
            }
            
        } catch (error) {
            window.debugService.log(`🎤 Stop recording failed: ${error.message}`, 'error');
            this.showError('Recording failed. Please try again.');
            this.resetRecordingUI();
        }
        
        this.isRecording = false;
        if (this.progressTimer) {
            clearInterval(this.progressTimer);
        }
    }

    updateProgress(elapsed, maxDuration) {
        const timeDisplay = this.querySelector('#timeDisplay');
        const progressCircle = this.querySelector('.progress-ring__circle');
        
        timeDisplay.textContent = window.audioService.formatDuration(elapsed);
        
        // Update circular progress
        const circumference = 2 * Math.PI * 90; // radius = 90
        const progress = (elapsed / maxDuration) * circumference;
        const offset = circumference - progress;
        
        progressCircle.style.strokeDasharray = circumference;
        progressCircle.style.strokeDashoffset = offset;
    }

    updateTranscript(transcript) {
        // We'll show this in the editor step
        this.currentTranscript = transcript;
    }

    startProgressTimer() {
        this.progressTimer = setInterval(() => {
            if (this.isRecording && this.recordingStartTime) {
                const elapsed = (Date.now() - this.recordingStartTime) / 1000;
                this.updateProgress(elapsed, 90);
            }
        }, 100);
    }

    startWaveformAnimation() {
        const animateWaveform = () => {
            if (this.isRecording) {
                // Active recording animation
                this.waveformBars.forEach((bar, index) => {
                    const height = Math.random() * 40 + 5;
                    bar.style.height = `${height}px`;
                    bar.style.backgroundColor = '#4ecdc4';
                });
            } else {
                // Idle animation
                this.waveformBars.forEach((bar, index) => {
                    const height = Math.sin(Date.now() * 0.003 + index * 0.5) * 8 + 15;
                    bar.style.height = `${Math.abs(height)}px`;
                    bar.style.backgroundColor = '#ff9a9e';
                });
            }
            
            this.animationFrame = requestAnimationFrame(animateWaveform);
        };
        
        animateWaveform();
    }

    showTranscriptEditor() {
        const duration = this.recordingData.duration;
        const transcript = this.recordingData.transcript || '';
        
        this.innerHTML = `
            <div class="transcript-editor">
                <h2>Review Your Message</h2>
                
                <div class="audio-controls">
                    <button class="play-btn" id="playButton">▶️</button>
                    <div>
                        <strong>Duration:</strong> ${window.audioService.formatDuration(duration)}<br>
                        <strong>Size:</strong> ${(this.recordingData.size / 1024).toFixed(1)} KB
                    </div>
                </div>
                
                <audio id="previewAudio" controls style="width: 100%; margin: 15px 0;"></audio>
                
                <h3>Edit Transcript:</h3>
                <textarea class="transcript-area" id="transcriptArea" placeholder="Enter or edit your message transcript...">${transcript}</textarea>
                <div style="text-align: right; font-size: 0.8em; color: #666; margin-top: 5px;">
                    <span id="charCount">${transcript.length}</span>/500 characters
                </div>
                
                <button class="btn" id="saveButton">💾 Save to IPFS</button>
                <button class="btn btn-secondary" id="retryButton">🔄 Record Again</button>
            </div>
        `;
        
        this.setupTranscriptEditor();
    }

    setupTranscriptEditor() {
        // Setup audio preview
        const audio = this.querySelector('#previewAudio');
        const playButton = this.querySelector('#playButton');
        
        audio.src = window.audioService.createAudioURL(this.recordingData.audioBlob);
        
        playButton.addEventListener('click', () => {
            if (audio.paused) {
                audio.play();
                playButton.textContent = '⏸️';
            } else {
                audio.pause();
                playButton.textContent = '▶️';
            }
        });
        
        audio.addEventListener('ended', () => {
            playButton.textContent = '▶️';
        });
        
        // Setup transcript editing
        const transcriptArea = this.querySelector('#transcriptArea');
        const charCount = this.querySelector('#charCount');
        
        transcriptArea.addEventListener('input', () => {
            const length = transcriptArea.value.length;
            charCount.textContent = length;
            charCount.style.color = length > 500 ? '#ff6b6b' : '#666';
        });
        
        // Setup buttons
        this.querySelector('#saveButton').addEventListener('click', this.saveMessage.bind(this));
        this.querySelector('#retryButton').addEventListener('click', this.retryRecording.bind(this));
    }

    async saveMessage() {
        const transcriptArea = this.querySelector('#transcriptArea');
        const saveButton = this.querySelector('#saveButton');
        const transcript = transcriptArea.value.trim();
        
        if (!transcript) {
            this.showError('Please add a transcript before saving.');
            return;
        }
        
        if (transcript.length > 500) {
            this.showError('Transcript too long. Please keep under 500 characters.');
            return;
        }
        
        if (!this.tagSerial) {
            this.showError('No NFC tag detected. Please scan a blank NFC tag first.');
            return;
        }
        
        const originalText = saveButton.textContent;
        saveButton.disabled = true;
        
        try {
            // Generate message identifiers
            const messageId = window.encryptionService.generateMessageId();
            const timestamp = Date.now();
            
            window.debugService.log(`💾 Preparing message: ${messageId} for tag ${this.tagSerial}`);
            
            // Update UI
            saveButton.textContent = '🔐 Encrypting...';
            
            // Derive encryption key using ACTUAL tag serial number
            const encryptionKey = await window.encryptionService.deriveKey(this.tagSerial, timestamp);
            
            // Get audio buffer and encrypt
            const audioBuffer = await this.recordingData.audioBlob.arrayBuffer();
            const encryptedAudio = await window.encryptionService.encryptToBinary(audioBuffer, encryptionKey);
            
            // Encrypt transcript for local storage
            const encryptedTranscript = await window.encryptionService.encryptToBase64(transcript, encryptionKey);
            
            // Create message data with ACTUAL tag serial (but don't upload yet)
            const messageData = {
                messageId,
                tagSerial: this.tagSerial,
                timestamp,
                encryptedAudio, // Keep encrypted data for upload after NFC write
                encryptedTranscript,
                duration: this.recordingData.duration,
                originalTranscript: transcript,
                created: new Date().toISOString()
            };
            
            // Create NFC URL using actual tag serial
            const nfcUrl = window.URLParser.createNfcUrl(messageData);
            
            window.debugService.log('💾 Message prepared - ready for NFC write', 'success');
            
            // Emit event to parent component for NFC writing FIRST
            this.dispatchEvent(new CustomEvent('message-created', {
                detail: { messageData, nfcUrl }
            }));
            
        } catch (error) {
            window.debugService.log(`💾 Preparation failed: ${error.message}`, 'error');
            this.showError(`Failed to prepare message: ${error.message}`);
            
            saveButton.textContent = originalText;
            saveButton.disabled = false;
        }
    }

    saveMessageLocally(messageData) {
        const savedMessages = JSON.parse(localStorage.getItem('peebleMessages') || '[]');
        savedMessages.push(messageData);
        localStorage.setItem('peebleMessages', JSON.stringify(savedMessages));
        window.debugService.log('💾 Message also saved locally for testing');
    }

    retryRecording() {
        this.recordingData = null;
        this.resetRecordingUI();
        this.render();
        this.setupEventListeners();
    }

    resetRecordingUI() {
        const recordButton = this.querySelector('#recordButton');
        const statusText = this.querySelector('#statusText');
        const timeDisplay = this.querySelector('#timeDisplay');
        const progressCircle = this.querySelector('.progress-ring__circle');
        
        if (recordButton) {
            recordButton.classList.remove('recording');
            recordButton.textContent = '🎤';
        }
        
        if (statusText) {
            statusText.textContent = 'Ready to record';
        }
        
        if (timeDisplay) {
            timeDisplay.textContent = '00:00';
        }
        
        if (progressCircle) {
            progressCircle.style.strokeDashoffset = '565.48';
        }
        
        this.isRecording = false;
    }

    showError(message) {
        const statusEl = this.querySelector('#nfcStatus') || this.querySelector('#statusText');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.style.display = 'block';
            statusEl.className = 'nfc-status error';
            
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, 5000);
        }
    }

    disconnectedCallback() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        if (this.progressTimer) {
            clearInterval(this.progressTimer);
        }
    }
}

// Register the custom element
customElements.define('voice-recorder', VoiceRecorder);
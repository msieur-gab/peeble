// Audio service for recording and playback
class AudioService {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
        this.recognition = null;
        this.currentTranscript = '';
        this.isRecording = false;
        this.recordingStartTime = 0;
        this.maxDuration = 90; // seconds
    }

    // Initialize speech recognition
    initSpeechRecognition() {
        if ('webkitSpeechRecognition' in window) {
            this.recognition = new webkitSpeechRecognition();
        } else if ('SpeechRecognition' in window) {
            this.recognition = new SpeechRecognition();
        }

        if (this.recognition) {
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';
            
            window.debugService.log('🎤 Speech recognition initialized');
        } else {
            window.debugService.log('🎤 Speech recognition not supported', 'warning');
        }
    }

    // Start recording audio
    async startRecording(onTranscriptUpdate, onProgress) {
        try {
            window.debugService.log('🎤 Starting audio recording...');
            
            // Get microphone access
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            // Setup MediaRecorder
            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            
            this.audioChunks = [];
            this.currentTranscript = '';
            this.recordingStartTime = Date.now();
            this.isRecording = true;

            // Handle data availability
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            // Start recording
            this.mediaRecorder.start(1000); // Collect data every second

            // Start speech recognition if available
            if (this.recognition && onTranscriptUpdate) {
                this.recognition.onresult = (event) => {
                    let transcript = '';
                    for (let i = event.resultIndex; i < event.results.length; i++) {
                        if (event.results[i].isFinal) {
                            transcript += event.results[i][0].transcript + ' ';
                        }
                    }
                    this.currentTranscript = transcript.trim();
                    onTranscriptUpdate(this.currentTranscript);
                };
                
                this.recognition.start();
            }

            // Progress tracking
            if (onProgress) {
                this.progressInterval = setInterval(() => {
                    const elapsed = (Date.now() - this.recordingStartTime) / 1000;
                    onProgress(elapsed, this.maxDuration);
                    
                    // Auto-stop at max duration
                    if (elapsed >= this.maxDuration) {
                        this.stopRecording();
                    }
                }, 100);
            }

            window.debugService.log('🎤 Recording started successfully', 'success');
            return true;
            
        } catch (error) {
            window.debugService.log(`🎤 Recording failed: ${error.message}`, 'error');
            throw error;
        }
    }

    // Stop recording audio
    async stopRecording() {
        return new Promise((resolve) => {
            if (!this.isRecording || !this.mediaRecorder) {
                resolve(null);
                return;
            }

            window.debugService.log('🎤 Stopping audio recording...');

            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                const duration = (Date.now() - this.recordingStartTime) / 1000;
                
                // Stop microphone stream
                if (this.stream) {
                    this.stream.getTracks().forEach(track => track.stop());
                    this.stream = null;
                }

                // Stop speech recognition
                if (this.recognition) {
                    this.recognition.stop();
                }

                // Clear progress interval
                if (this.progressInterval) {
                    clearInterval(this.progressInterval);
                    this.progressInterval = null;
                }

                this.isRecording = false;
                
                const result = {
                    audioBlob,
                    transcript: this.currentTranscript,
                    duration: Math.round(duration),
                    size: audioBlob.size
                };
                
                window.debugService.log(`🎤 Recording stopped (${duration.toFixed(1)}s, ${audioBlob.size} bytes)`, 'success');
                resolve(result);
            };

            this.mediaRecorder.stop();
        });
    }

    // Create audio URL for playback
    createAudioURL(audioBlob) {
        return URL.createObjectURL(audioBlob);
    }

    // Clean up audio URL
    revokeAudioURL(url) {
        URL.revokeObjectURL(url);
    }

    // Get audio buffer from blob
    async getAudioBuffer(audioBlob) {
        return await audioBlob.arrayBuffer();
    }

    // Create audio element for playback
    createAudioElement(audioData) {
        const audio = new Audio();
        
        if (audioData instanceof Blob) {
            audio.src = this.createAudioURL(audioData);
        } else if (audioData instanceof ArrayBuffer) {
            const blob = new Blob([audioData], { type: 'audio/webm' });
            audio.src = this.createAudioURL(blob);
        } else {
            throw new Error('Invalid audio data format');
        }

        return audio;
    }

    // Check microphone permissions
    async checkPermissions() {
        try {
            const permission = await navigator.permissions.query({ name: 'microphone' });
            window.debugService.log(`🎤 Microphone permission: ${permission.state}`);
            return permission.state;
        } catch (error) {
            window.debugService.log('🎤 Cannot check microphone permissions', 'warning');
            return 'unknown';
        }
    }

    // Test microphone access
    async testMicrophone() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            window.debugService.log('🎤 Microphone test successful', 'success');
            return true;
        } catch (error) {
            window.debugService.log(`🎤 Microphone test failed: ${error.message}`, 'error');
            return false;
        }
    }

    // Format duration for display
    formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}

// Create global audio service
window.audioService = new AudioService();

// Initialize speech recognition when available
document.addEventListener('DOMContentLoaded', () => {
    window.audioService.initSpeechRecognition();
});
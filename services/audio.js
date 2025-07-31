// services/audio.js

import { debugLog } from './utils.js';

/**
 * Service for handling audio recording and speech-to-text transcription.
 */
export class AudioService {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.recognition = null;
        this.isRecording = false;
        this.recordingStartTime = 0;
        this.recordingInterval = null;

        // Callbacks
        this.onRecordingTimeUpdate = () => {};
        this.onRecordingStop = () => {};
        this.onTranscriptUpdate = () => {};
        this.onError = () => {};

        this._initSpeechRecognition();
    }

    /**
     * Initializes the Web Speech API for transcription.
     * Checks for browser compatibility.
     * @private
     */
    _initSpeechRecognition() {
        if ('webkitSpeechRecognition' in window) {
            this.recognition = new webkitSpeechRecognition();
        } else if ('SpeechRecognition' in window) {
            this.recognition = new SpeechRecognition();
        }

        if (this.recognition) {
            this.recognition.continuous = true; // Keep listening
            this.recognition.interimResults = true; // Get results while speaking
            this.recognition.lang = 'en-US'; // Set default language

            this.recognition.onresult = (event) => {
                let transcript = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    if (event.results[i].isFinal) {
                        transcript += event.results[i][0].transcript;
                    }
                }
                this.onTranscriptUpdate(transcript); // Call the registered callback
            };

            this.recognition.onerror = (event) => {
                debugLog(`Speech recognition error: ${event.error}`, 'error');
                this.onError(`Speech recognition error: ${event.error}`);
            };

            this.recognition.onend = () => {
                debugLog('Speech recognition ended.');
            };
            debugLog('Speech recognition initialized.');
        } else {
            debugLog('Speech Recognition API not supported in this browser.', 'warning');
            this.onError('Speech Recognition not supported.');
        }
    }

    /**
     * Starts the audio recording and speech recognition.
     * @returns {Promise<void>}
     */
    async startRecording() {
        if (this.isRecording) {
            debugLog('Already recording.', 'warning');
            return;
        }

        debugLog('Starting recording...');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];
            this.recordingStartTime = Date.now();
            this.isRecording = true;

            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };

            this.mediaRecorder.onstop = () => {
                debugLog('Recording stopped.');
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                const duration = Math.floor((Date.now() - this.recordingStartTime) / 1000);
                this.onRecordingStop(audioBlob, duration); // Call the registered callback
                stream.getTracks().forEach(track => track.stop()); // Stop microphone access
                this.isRecording = false;
                clearInterval(this.recordingInterval);
            };

            this.mediaRecorder.start();
            if (this.recognition) {
                this.recognition.start();
            }

            this.recordingInterval = setInterval(() => {
                const elapsedSeconds = Math.floor((Date.now() - this.recordingStartTime) / 1000);
                this.onRecordingTimeUpdate(elapsedSeconds); // Update UI with time
            }, 1000);

            debugLog('Recording started successfully.', 'success');
        } catch (error) {
            debugLog(`Error starting recording: ${error.message}`, 'error');
            this.onError(`Could not access microphone: ${error.message}`);
            this.isRecording = false;
        }
    }

    /**
     * Stops the audio recording and speech recognition.
     */
    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            debugLog('Stopping recording...');
            this.mediaRecorder.stop();
        }
        if (this.recognition) {
            this.recognition.stop();
        }
        clearInterval(this.recordingInterval);
        this.isRecording = false;
    }

    /**
     * Checks if currently recording.
     * @returns {boolean} True if recording, false otherwise.
     */
    getRecordingState() {
        return this.isRecording;
    }
}

// services/audio-service-adapter.js

import { AudioService } from './audio.js';
import { debugLog } from './utils.js';

/**
 * Adapter to connect the AudioService to the reactive event system.
 * This bridges the callback-based AudioService with the event-based architecture.
 */
export class AudioServiceAdapter {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.audioService = new AudioService();
        this.setupAudioServiceCallbacks();
        this.setupEventListeners();
    }

    setupAudioServiceCallbacks() {
        // Connect AudioService callbacks to event bus
        this.audioService.onRecordingTimeUpdate = (seconds) => {
            this.eventBus.publish('recording-time-update', seconds);
        };

        this.audioService.onRecordingStop = (audioBlob, duration) => {
            this.eventBus.publish('recording-complete', { audioBlob, duration });
        };

        this.audioService.onTranscriptUpdate = (transcript) => {
            this.eventBus.publish('transcript-update', transcript);
        };

        this.audioService.onError = (errorMessage) => {
            debugLog(`Audio service error: ${errorMessage}`, 'error');
            this.eventBus.publish('audio-service-error', errorMessage);
        };
    }

    setupEventListeners() {
        // Listen for recording control events
        this.eventBus.subscribe('start-recording', () => {
            this.startRecording();
        });

        this.eventBus.subscribe('stop-recording', () => {
            this.stopRecording();
        });
    }

    async startRecording() {
        try {
            await this.audioService.startRecording();
            debugLog('Audio recording started via adapter.', 'success');
        } catch (error) {
            debugLog(`Failed to start recording: ${error.message}`, 'error');
            this.eventBus.publish('audio-service-error', error.message);
        }
    }

    stopRecording() {
        try {
            this.audioService.stopRecording();
            debugLog('Audio recording stopped via adapter.');
        } catch (error) {
            debugLog(`Failed to stop recording: ${error.message}`, 'error');
            this.eventBus.publish('audio-service-error', error.message);
        }
    }

    getRecordingState() {
        return this.audioService.getRecordingState();
    }
}
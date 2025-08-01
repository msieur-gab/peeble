// services/state-manager.js

import { eventBus } from './pubsub.js';
import { debugLog, URLParser } from './utils.js';
import { EncryptionService } from './encryption.js';

/**
 * A centralized, reactive State Manager that coordinates the entire application flow.
 * All shared data is stored here, and components are notified of changes via the event bus.
 */
class StateManager {
    constructor() {
        this._state = {
            // App state
            appMode: 'CREATOR', // 'CREATOR' or 'READER'
            currentStep: 'waiting', // 'waiting', 'recording', 'editing', 'success', 'loading', 'playing', 'error'
            
            // API credentials - will be set by main.js based on development mode
            pinataApiKey: '',
            pinataSecret: '',
            
            // NFC/Security state
            tagSerial: null,
            physicalKeyTimestamp: null,
            nfcWriteMode: false,
            writeUrlQueue: null,
            
            // Message creation state
            audioBlob: null,
            recordingDuration: 0,
            currentTranscript: '',
            isRecording: false,
            isProcessing: false,
            
            // Message playback state
            messageId: null,
            ipfsHash: null,
            messagePackage: null,
            decryptedAudio: null,
            decryptedTranscript: '',
            audioUrl: null,
            isPlaying: false,
            
            // UI state
            statusMessage: '🔒 Loading secure Peeble app...',
            statusType: 'info',
            errorMessage: null,
            
            // Services (will be injected)
            storageService: null,
            encryptionService: new EncryptionService()
        };
        
        this.setupEventListeners();
        this.initializeFromUrl();
    }

    setupEventListeners() {
        // NFC Events
        eventBus.subscribe('nfc-tag-scanned', (data) => this.handleNfcTagScanned(data));
        eventBus.subscribe('blank-nfc-scanned', (serial) => this.handleBlankNfcScanned(serial));
        
        // Recording Events
        eventBus.subscribe('start-recording', () => this.handleStartRecording());
        eventBus.subscribe('stop-recording', () => this.handleStopRecording());
        eventBus.subscribe('recording-time-update', (seconds) => this.handleRecordingTimeUpdate(seconds));
        eventBus.subscribe('recording-complete', (data) => this.handleRecordingComplete(data));
        eventBus.subscribe('transcript-update', (transcript) => this.handleTranscriptUpdate(transcript));
        
        // Message creation events
        eventBus.subscribe('save-secure-message', (transcript) => this.handleSaveSecureMessage(transcript));
        eventBus.subscribe('retry-recording', () => this.handleRetryRecording());
        eventBus.subscribe('create-another', () => this.handleCreateAnother());
        
        // Playback events
        eventBus.subscribe('load-secure-message', () => this.handleLoadSecureMessage());
        eventBus.subscribe('toggle-playback', () => this.handleTogglePlayback());
        eventBus.subscribe('close-player', () => this.handleClosePlayer());
        
        // NFC Write events
        eventBus.subscribe('start-nfc-write', (url) => this.handleStartNfcWrite(url));
        eventBus.subscribe('stop-nfc-write', () => this.handleStopNfcWrite());
        eventBus.subscribe('nfc-write-complete', () => this.handleNfcWriteComplete());
    }

    initializeFromUrl() {
        const params = URLParser.getParams();
        if (params.messageId && params.ipfsHash) {
            debugLog('🔒 SECURITY: URL parameters found, switching to READER mode');
            this.setState({
                appMode: 'READER',
                messageId: params.messageId,
                ipfsHash: params.ipfsHash,
                currentStep: 'waiting',
                statusMessage: '🔒 Waiting for physical Peeble scan...'
            });
            
            // Try to restore physical key
            this.restorePhysicalKey();
            
            // Check if we can auto-load (in case storage service is already available)
            this.checkAndTriggerAutoLoad();
        }
    }

    restorePhysicalKey() {
        try {
            const keyDataStr = sessionStorage.getItem('peeble-physical-key');
            if (!keyDataStr) {
                debugLog('🔒 SECURITY: No physical key found in sessionStorage');
                return;
            }

            const keyData = JSON.parse(keyDataStr);
            const age = Date.now() - keyData.timestamp;
            
            debugLog(`🔒 SECURITY: Found physical key, age: ${age}ms, serial: ${keyData.serial}`);
            
            if (age > 60000) { // Increased to 60 seconds max age
                debugLog('🔒 SECURITY: Physical key expired (>60s), removing');
                sessionStorage.removeItem('peeble-physical-key');
                return;
            }

            // FIX: More flexible URL matching - compare the core parameters instead of full URLs
            const storedUrl = new URL(keyData.url);
            const currentUrl = new URL(window.location.href);
            const storedParams = new URLSearchParams(storedUrl.hash.substring(1));
            const currentParams = new URLSearchParams(currentUrl.hash.substring(1));
            
            const storedMessageId = storedParams.get('messageId');
            const storedIpfsHash = storedParams.get('ipfsHash');
            const currentMessageId = currentParams.get('messageId');
            const currentIpfsHash = currentParams.get('ipfsHash');
            
            if (storedMessageId !== currentMessageId || storedIpfsHash !== currentIpfsHash) {
                debugLog(`🔒 SECURITY: URL mismatch - stored: ${storedMessageId}/${storedIpfsHash}, current: ${currentMessageId}/${currentIpfsHash}`);
                sessionStorage.removeItem('peeble-physical-key');
                return;
            }

            debugLog(`🔒 SECURITY: Physical key restored successfully: ${keyData.serial}`, 'success');
            this.setState({
                tagSerial: keyData.serial,
                physicalKeyTimestamp: keyData.timestamp
            });
            
            // Check if we can now auto-load
            this.checkAndTriggerAutoLoad();
        } catch (error) {
            debugLog(`🔒 SECURITY: Error restoring physical key: ${error.message}`, 'error');
            sessionStorage.removeItem('peeble-physical-key');
        }
    }

    // New method to check if all conditions are met for auto-loading
    checkAndTriggerAutoLoad() {
        const { appMode, tagSerial, messageId, ipfsHash, storageService, currentStep } = this._state;
        
        debugLog(`🔒 AUTO-LOAD CHECK: Mode=${appMode}, Serial=${!!tagSerial ? tagSerial : 'MISSING'}, MessageId=${!!messageId}, Hash=${!!ipfsHash}, Storage=${!!storageService}, Step=${currentStep}`);
        
        if (appMode === 'READER' && 
            tagSerial && 
            messageId && 
            ipfsHash && 
            storageService && 
            currentStep !== 'loading' && 
            currentStep !== 'playing') {
            
            debugLog('🔒 AUTO-LOAD: All conditions met - triggering automatic load!', 'success');
            
            // Clear the physical key now that we're about to use it
            sessionStorage.removeItem('peeble-physical-key');
            
            eventBus.publish('load-secure-message');
        } else {
            debugLog('🔒 AUTO-LOAD: Not ready yet, waiting for missing components...');
            
            // FIX: If we have the tag serial but missing storage service, retry after a delay
            if (appMode === 'READER' && tagSerial && messageId && ipfsHash && !storageService) {
                debugLog('🔒 AUTO-LOAD: Have physical key but missing storage service, will retry...', 'warning');
                setTimeout(() => {
                    debugLog('🔒 AUTO-LOAD: Retrying auto-load check...');
                    this.checkAndTriggerAutoLoad();
                }, 1000);
            }
        }
    }

    // NFC Event Handlers
    handleNfcTagScanned(data) {
        debugLog(`🔍 STATE MANAGER: NFC tag scanned event received`, 'info');
        debugLog(`   - URL present: ${!!data.url}`, 'info');
        debugLog(`   - Serial received: ${data.serial || 'NULL'}`, 'info');
        debugLog(`   - Current nfcWriteMode: ${this._state.nfcWriteMode}`, 'info');
        debugLog(`   - Write queue: ${!!this._state.writeUrlQueue}`, 'info');
        
        // PRIORITY 1: Check if we're in NFC write mode (ALWAYS check this first!)
        if (this._state.nfcWriteMode && this._state.writeUrlQueue) {
            debugLog(`🔒 SECURITY: In write mode - attempting to write URL to tag with serial: ${data.serial}`);
            eventBus.publish('nfc-write-url', { url: this._state.writeUrlQueue, serial: data.serial });
            return;
        }
        
        // PRIORITY 2: Check if tag has a URL (reading mode)
        if (data.url && this.isSecurePeebleUrl(data.url)) {
            debugLog(`🔒 SECURITY: Tag contains secure Peeble URL - processing with serial: ${data.serial}`);
            
            // Parse the URL to get message parameters
            let urlObj, params, messageId, ipfsHash;
            try {
                urlObj = new URL(data.url);
                params = new URLSearchParams(urlObj.hash.substring(1));
                messageId = params.get('messageId');
                ipfsHash = params.get('ipfsHash');
                debugLog(`🔍 URL PARSING: MessageId=${messageId}, IpfsHash=${ipfsHash}`);
            } catch (error) {
                debugLog(`❌ URL PARSING ERROR: ${error.message}`, 'error');
                this.setState({
                    statusMessage: '🔒 Invalid message URL format',
                    statusType: 'error'
                });
                return;
            }
            
            if (messageId && ipfsHash) {
                // Check if we're already on the same message URL
                const currentParams = URLParser.getParams();
                debugLog(`🔍 URL COMPARISON: Current MessageId=${currentParams.messageId}, Current Hash=${currentParams.ipfsHash}`);
                
                if (currentParams.messageId === messageId && currentParams.ipfsHash === ipfsHash) {
                    debugLog('🔒 SECURITY: Same message URL - using physical key directly', 'success');
                    debugLog(`🔍 SETTING SERIAL IN STATE: ${data.serial}`, 'info');
                    
                    this.setState({
                        appMode: 'READER',
                        tagSerial: data.serial,  // FIX: Make sure this is actually being set
                        messageId: messageId,
                        ipfsHash: ipfsHash,
                        currentStep: 'waiting',
                        statusMessage: '🔒 Physical key captured, preparing to load...',
                        statusType: 'info'
                    });
                    
                    // Immediate verification that serial was set
                    const currentState = this.getState();
                    debugLog(`🔍 STATE VERIFICATION: tagSerial after setState = ${currentState.tagSerial}`, currentState.tagSerial ? 'success' : 'error');
                    
                    // Use the auto-load check method
                    setTimeout(() => {
                        debugLog('🔍 TRIGGERING AUTO-LOAD CHECK AFTER SERIAL SET...');
                        this.checkAndTriggerAutoLoad();
                    }, 100); // Small delay to ensure state is fully updated
                    return;
                }
            }
            
            // Different URL - store for navigation
            debugLog(`🔒 SECURITY: Different URL detected, storing physical key for navigation`);
            try {
                const keyData = {
                    serial: data.serial,
                    timestamp: Date.now(),
                    url: data.url,
                    messageId: messageId,
                    ipfsHash: ipfsHash
                };
                sessionStorage.setItem('peeble-physical-key', JSON.stringify(keyData));
                debugLog(`🔒 SECURITY: Physical key stored for navigation - Serial: ${data.serial}, MessageId: ${messageId}`, 'success');
                
                // Navigate to the URL (this will trigger a page reload)
                debugLog('🔒 SECURITY: Navigating to secure message URL');
                window.location.href = data.url;
                return;
            } catch (error) {
                debugLog(`🔒 SECURITY: Error storing physical key: ${error.message}`, 'error');
                this.setState({
                    statusMessage: '🔒 Failed to store physical key',
                    statusType: 'error'
                });
                return;
            }
        }
        
        // PRIORITY 3: Blank tag - only for creation mode if not in write mode
        debugLog(`🔒 SECURITY: Blank tag detected - entering creation mode with serial: ${data.serial}`);
        this.handleBlankNfcScanned(data.serial);
    }

    handleBlankNfcScanned(serial) {
        debugLog(`🔒 SECURITY: Handling blank NFC tag with serial: ${serial}`, 'success');
        this.setState({
            appMode: 'CREATOR',
            tagSerial: serial,
            currentStep: 'waiting',
            statusMessage: '🔒 Physical key captured. Ready to record.',
            statusType: 'success'
        });
        
        // Verification
        const currentState = this.getState();
        debugLog(`🔍 BLANK TAG STATE VERIFICATION: tagSerial = ${currentState.tagSerial}`, currentState.tagSerial === serial ? 'success' : 'error');
    }

    // Recording Event Handlers
    handleStartRecording() {
        if (!this._state.tagSerial) {
            this.setState({
                statusMessage: '🔒 Please scan a blank NFC tag first.',
                statusType: 'warning'
            });
            return;
        }
        
        this.setState({
            isRecording: true,
            currentStep: 'recording',
            currentTranscript: '',
            statusMessage: '🔒 Recording securely...',
            statusType: 'info'
        });
    }

    handleStopRecording() {
        this.setState({
            isRecording: false,
            isProcessing: true,
            statusMessage: 'Processing recording...'
        });
    }

    handleRecordingTimeUpdate(seconds) {
        this.setState({ recordingDuration: seconds });
    }

    handleRecordingComplete(data) {
        this.setState({
            audioBlob: data.audioBlob,
            recordingDuration: data.duration,
            isProcessing: false,
            currentStep: 'editing',
            statusMessage: 'Recording complete. Review and edit transcript.'
        });
    }

    handleTranscriptUpdate(transcript) {
        this.setState({ currentTranscript: transcript });
    }

    // Message Creation Event Handlers
    async handleSaveSecureMessage(transcript) {
        if (!this._state.tagSerial || !this._state.audioBlob || !this._state.storageService) {
            this.setState({
                statusMessage: 'Missing required data for secure save.',
                statusType: 'error'
            });
            return;
        }

        this.setState({
            isProcessing: true,
            statusMessage: '🔒 Creating secure message package...'
        });

        try {
            const messageId = this.generateMessageId();
            const timestamp = Date.now();
            
            // Derive encryption key
            const encryptionKey = await this._state.encryptionService.deriveEncryptionKey(
                this._state.tagSerial, 
                timestamp
            );
            
            // Encrypt audio and transcript
            const audioBuffer = await this._state.audioBlob.arrayBuffer();
            const encryptedAudio = await this._state.encryptionService.encryptDataToBinary(audioBuffer, encryptionKey);
            const encryptedTranscript = await this._state.encryptionService.encryptDataToBase64(transcript, encryptionKey);
            
            // Create package
            const messagePackage = {
                messageId,
                timestamp,
                encryptedAudio,
                encryptedTranscript,
                metadata: {
                    duration: this._state.recordingDuration,
                    created: new Date().toISOString(),
                    version: 'secure-v1'
                }
            };
            
            // Upload to IPFS
            const ipfsHash = await this._state.storageService.uploadMessagePackage(messagePackage);
            
            // Generate secure URL
            const secureUrl = URLParser.createSecureNfcUrl({ messageId, ipfsHash });
            
            // Save local reference
            this.saveLocalMessageReference({ messageId, ipfsHash, transcript, timestamp });
            
            this.setState({
                messageId,
                ipfsHash,
                isProcessing: false,
                currentStep: 'success',
                statusMessage: '🔒 Message encrypted and secured!',
                statusType: 'success'
            });
            
            // Start NFC write mode
            debugLog(`🔒 STATE: Message saved successfully, starting NFC write mode with URL: ${secureUrl.substring(0, 50)}...`);
            eventBus.publish('start-nfc-write', secureUrl);
            
        } catch (error) {
            debugLog(`🔒 SECURITY: Save failed: ${error.message}`, 'error');
            this.setState({
                isProcessing: false,
                statusMessage: `Save failed: ${error.message}`,
                statusType: 'error'
            });
        }
    }

    // Message Loading Event Handler
    async handleLoadSecureMessage() {
        const { tagSerial, messageId, ipfsHash, storageService, encryptionService } = this._state;
        
        debugLog(`🔍 LOAD MESSAGE: Starting with serial=${tagSerial}, messageId=${messageId}, hash=${ipfsHash}, storage=${!!storageService}`);
        
        if (!tagSerial || !messageId || !ipfsHash || !storageService) {
            debugLog('🔒 SECURITY: Missing parameters for secure load', 'warning');
            debugLog(`🔒 PARAMS: Serial=${!!tagSerial}, MessageId=${!!messageId}, Hash=${!!ipfsHash}, Storage=${!!storageService}`);
            
            // FIX: Show more specific error message
            let missingParams = [];
            if (!tagSerial) missingParams.push('Physical Key');
            if (!messageId) missingParams.push('Message ID');
            if (!ipfsHash) missingParams.push('IPFS Hash');
            if (!storageService) missingParams.push('Storage Service');
            
            this.setState({
                statusMessage: `🔒 Missing: ${missingParams.join(', ')}`,
                statusType: 'warning'
            });
            return;
        }

        this.setState({
            currentStep: 'loading',
            statusMessage: '🔒 Downloading and decrypting message...',
            statusType: 'info'
        });

        try {
            // Download package
            debugLog(`🔍 DOWNLOADING: Using serial ${tagSerial} to decrypt message ${messageId}`);
            const messagePackage = await storageService.downloadMessagePackage(ipfsHash);
            
            // Verify message ID
            if (messagePackage.messageId !== messageId) {
                throw new Error('Message ID mismatch');
            }
            
            // Derive decryption key
            const decryptionKey = await encryptionService.deriveEncryptionKey(tagSerial, messagePackage.timestamp);
            
            // Decrypt audio
            const decryptedAudio = await encryptionService.decryptFromBinary(messagePackage.encryptedAudio, decryptionKey);
            const audioBlob = new Blob([decryptedAudio], { type: 'audio/webm' });
            const audioUrl = URL.createObjectURL(audioBlob);
            
            // Decrypt transcript
            let decryptedTranscript = 'Transcript not available.';
            if (messagePackage.encryptedTranscript) {
                try {
                    decryptedTranscript = await encryptionService.decryptFromBase64(messagePackage.encryptedTranscript, decryptionKey);
                } catch (error) {
                    debugLog(`Transcript decryption failed: ${error.message}`, 'warning');
                }
            }
            
            this.setState({
                messagePackage,
                decryptedAudio,
                decryptedTranscript,
                audioUrl,
                currentStep: 'playing',
                statusMessage: '🔒 Message decrypted successfully!',
                statusType: 'success'
            });
            
            // Auto-play
            eventBus.publish('auto-play-audio');
            
        } catch (error) {
            debugLog(`🔒 SECURITY: Load failed: ${error.message}`, 'error');
            this.setState({
                currentStep: 'error',
                errorMessage: error.message,
                statusMessage: '🔒 Decryption failed. Wrong physical key?',
                statusType: 'error'
            });
        }
    }

    // Playback Event Handlers
    handleTogglePlayback() {
        eventBus.publish('audio-toggle-playback');
    }

    handleClosePlayer() {
        // Clean up audio resources
        if (this._state.audioUrl) {
            URL.revokeObjectURL(this._state.audioUrl);
        }
        
        // Clear any remaining physical key
        sessionStorage.removeItem('peeble-physical-key');
        
        this.setState({
            appMode: 'CREATOR',
            tagSerial: null,
            messageId: null,
            ipfsHash: null,
            messagePackage: null,
            decryptedAudio: null,
            decryptedTranscript: '',
            audioUrl: null,
            currentStep: 'waiting',
            statusMessage: 'Ready to create a new secure message.'
        });
    }

    // NFC Write Event Handlers
    handleStartNfcWrite(url) {
        debugLog(`🔒 STATE: Starting NFC write mode with URL: ${url.substring(0, 50)}...`);
        this.setState({
            nfcWriteMode: true,
            writeUrlQueue: url,
            statusMessage: '🔒 Ready to write. Tap a blank Peeble.'
        });
    }

    handleStopNfcWrite() {
        debugLog('🔒 STATE: Stopping NFC write mode');
        this.setState({
            nfcWriteMode: false,
            writeUrlQueue: null
        });
    }

    handleNfcWriteComplete() {
        debugLog('🔒 STATE: NFC write completed successfully');
        this.setState({
            nfcWriteMode: false,
            writeUrlQueue: null,
            statusMessage: '🔒 Secure Peeble created! Safe to share.',
            statusType: 'success'
        });
    }

    // Utility methods
    handleRetryRecording() {
        this.setState({
            audioBlob: null,
            recordingDuration: 0,
            currentTranscript: '',
            currentStep: 'waiting',
            statusMessage: 'Ready to record again.'
        });
    }

    handleCreateAnother() {
        this.handleRetryRecording();
        eventBus.publish('stop-nfc-write');
    }

    isSecurePeebleUrl(url) {
        try {
            const urlObj = new URL(url);
            const params = new URLSearchParams(urlObj.hash.substring(1));
            return params.has('messageId') && params.has('ipfsHash') && !params.has('serial');
        } catch {
            return false;
        }
    }

    generateMessageId() {
        return 'PBL-' + Math.random().toString(36).substr(2, 8).toUpperCase();
    }

    saveLocalMessageReference({ messageId, ipfsHash, transcript, timestamp }) {
        const localMessageData = {
            messageId,
            ipfsHash,
            timestamp,
            originalTranscript: transcript,
            duration: this._state.recordingDuration,
            created: new Date().toISOString()
        };

        const savedMessages = JSON.parse(localStorage.getItem('peebleMessages') || '[]');
        savedMessages.push(localMessageData);
        localStorage.setItem('peebleMessages', JSON.stringify(savedMessages));
    }

    // Public methods
    getState() {
        return { ...this._state };
    }

    setState(newState) {
        const previousState = this._state;
        const updatedKeys = [];

        // FIX: Special handling for tagSerial to ensure it's properly tracked
        if ('tagSerial' in newState) {
            debugLog(`🔍 SETSTATE: tagSerial changing from '${previousState.tagSerial}' to '${newState.tagSerial}'`, newState.tagSerial ? 'success' : 'warning');
        }

        for (const key in newState) {
            if (previousState[key] !== newState[key]) {
                this._state[key] = newState[key];
                updatedKeys.push(key);
            }
        }

        if (updatedKeys.length > 0) {
            debugLog(`State updated: ${updatedKeys.join(', ')}`, 'info');
            
            // FIX: Special verification for tagSerial
            if (updatedKeys.includes('tagSerial')) {
                debugLog(`🔍 TAGSERIAL UPDATE VERIFIED: New value = '${this._state.tagSerial}'`, this._state.tagSerial ? 'success' : 'error');
            }
            
            eventBus.publish('state-change', {
                ...this._state,
                updatedKeys
            });
            
            // Check for auto-load if any critical parameters were updated
            const criticalKeys = ['tagSerial', 'messageId', 'ipfsHash', 'storageService', 'appMode'];
            const hasCriticalUpdate = updatedKeys.some(key => criticalKeys.includes(key));
            
            if (hasCriticalUpdate) {
                debugLog('🔒 CRITICAL UPDATE: Checking if auto-load can be triggered...', 'info');
                // Use setTimeout to ensure state is fully updated before checking
                setTimeout(() => this.checkAndTriggerAutoLoad(), 0);
            }
        }
    }

    setStorageService(service) {
        debugLog('🔒 STORAGE: StorageService set in StateManager');
        this.setState({ storageService: service });
        
        // Check if we can now auto-load
        this.checkAndTriggerAutoLoad();
    }
}

// Export a singleton instance
export const stateManager = new StateManager();
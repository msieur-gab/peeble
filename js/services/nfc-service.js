// NFC service for real NFC tag operations
class NFCService {
    constructor() {
        this.reader = null;
        this.writer = null;
        this.isScanning = false;
        this.onNFCRead = null;
        this.onNFCError = null;
    }

    // Check if NFC is supported
    isSupported() {
        return 'NDEFReader' in window;
    }

    // Start scanning for NFC tags
    async startScanning(onRead, onError) {
        if (!this.isSupported()) {
            const error = 'NFC not supported. Enable Web NFC in Chrome flags.';
            window.debugService.log(error, 'error');
            if (onError) onError(error);
            return false;
        }

        try {
            this.onNFCRead = onRead;
            this.onNFCError = onError;
            
            this.reader = new NDEFReader();
            await this.reader.scan();
            
            this.reader.addEventListener('reading', this.handleNFCRead.bind(this));
            this.reader.addEventListener('readingerror', this.handleNFCError.bind(this));
            
            this.isScanning = true;
            window.debugService.log('📱 NFC scanning started - tap a tag!', 'nfc');
            return true;
            
        } catch (error) {
            const errorMsg = `NFC scan failed: ${error.message}`;
            window.debugService.log(errorMsg, 'error');
            if (onError) onError(errorMsg);
            return false;
        }
    }

    // Stop scanning
    stopScanning() {
        if (this.reader) {
            this.reader = null;
            this.isScanning = false;
            window.debugService.log('📱 NFC scanning stopped', 'nfc');
        }
    }

    // Handle NFC tag read
    handleNFCRead(event) {
        window.debugService.log('📱 NFC tag detected!', 'nfc');
        
        const { message, serialNumber } = event;
        
        // Extract URL from NDEF message
        let url = null;
        for (const record of message.records) {
            if (record.recordType === 'url') {
                url = new TextDecoder().decode(record.data);
                break;
            }
        }

        if (url) {
            window.debugService.log(`📱 URL found: ${url}`, 'success');
            if (this.onNFCRead) {
                this.onNFCRead(url, serialNumber);
            }
        } else {
            // Empty or blank tag
            window.debugService.log('📱 Blank NFC tag detected', 'nfc');
            if (this.onNFCRead) {
                this.onNFCRead(null, serialNumber);
            }
        }
    }

    // Handle NFC errors
    handleNFCError(event) {
        const errorMsg = `NFC read error: ${event.error}`;
        window.debugService.log(errorMsg, 'error');
        if (this.onNFCError) {
            this.onNFCError(errorMsg);
        }
    }

    // Write URL to NFC tag (without locking for testing)
    async writeToTag(url) {
        if (!this.isSupported()) {
            throw new Error('NFC not supported');
        }

        try {
            window.debugService.log(`📱 Starting NFC write operation...`, 'nfc');
            window.debugService.log(`📱 URL to write: ${url}`, 'nfc');
            window.debugService.log(`📱 URL length: ${url.length} characters`, 'nfc');
            
            // Create new writer instance
            this.writer = new NDEFWriter();
            
            // Prepare NDEF message
            const ndefMessage = {
                records: [
                    {
                        recordType: 'url',
                        data: url
                    }
                ]
            };
            
            window.debugService.log('📱 NDEF message prepared, initiating write...', 'nfc');
            
            // Write to tag with timeout handling
            await this.writer.write(ndefMessage);
            
            window.debugService.log('📱 NFC write operation completed successfully!', 'success');
            return true;
            
        } catch (error) {
            window.debugService.log(`📱 NFC write error details:`, 'error');
            window.debugService.log(`📱 Error name: ${error.name}`, 'error');
            window.debugService.log(`📱 Error message: ${error.message}`, 'error');
            
            // Provide more specific error messages
            let userMessage = error.message;
            
            if (error.name === 'NotAllowedError') {
                userMessage = 'NFC permission denied. Please allow NFC access in browser settings.';
            } else if (error.name === 'NetworkError') {
                userMessage = 'Could not connect to NFC tag. Hold phone closer to tag and try again.';
            } else if (error.name === 'NotSupportedError') {
                userMessage = 'NFC writing not supported. Enable Web NFC in Chrome flags.';
            } else if (error.name === 'InvalidStateError') {
                userMessage = 'NFC is busy. Please try again in a moment.';
            } else if (error.message.includes('timeout')) {
                userMessage = 'Write operation timed out. Hold phone steady on NFC tag.';
            }
            
            throw new Error(userMessage);
        }
    }

    // Get tag info (for debugging)
    getTagInfo(serialNumber) {
        return {
            serialNumber,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent
        };
    }

    // Show NFC permission status
    async checkPermissions() {
        try {
            const permission = await navigator.permissions.query({ name: 'nfc' });
            window.debugService.log(`📱 NFC permission: ${permission.state}`, 'nfc');
            return permission.state;
        } catch (error) {
            window.debugService.log('📱 Cannot check NFC permissions', 'warning');
            return 'unknown';
        }
    }
}

// Create global NFC service
window.nfcService = new NFCService();
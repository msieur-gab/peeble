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
            this.writer = new NDEFWriter();
            
            window.debugService.log(`📱 Writing URL to NFC tag: ${url}`, 'nfc');
            
            await this.writer.write({
                records: [
                    {
                        recordType: 'url',
                        data: url
                    }
                ]
            });
            
            window.debugService.log('📱 URL written to NFC tag successfully!', 'success');
            return true;
            
        } catch (error) {
            const errorMsg = `NFC write failed: ${error.message}`;
            window.debugService.log(errorMsg, 'error');
            throw new Error(errorMsg);
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
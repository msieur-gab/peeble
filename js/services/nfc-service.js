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
        const tagSerial = this.formatSerialNumber(serialNumber);
        
        window.debugService.log(`📱 Tag serial: ${tagSerial}`, 'nfc');
        
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
                this.onNFCRead(url, tagSerial);
            }
        } else {
            // Empty or blank tag
            window.debugService.log('📱 Blank NFC tag detected', 'nfc');
            if (this.onNFCRead) {
                this.onNFCRead(null, tagSerial);
            }
        }
    }

    // Format serial number consistently
    formatSerialNumber(serialNumber) {
        if (!serialNumber) return null;
        
        // Convert ArrayBuffer to hex string if needed
        if (serialNumber instanceof ArrayBuffer) {
            const bytes = new Uint8Array(serialNumber);
            return Array.from(bytes)
                .map(b => b.toString(16).padStart(2, '0').toUpperCase())
                .join(':');
        }
        
        // If it's already a string, normalize the format
        if (typeof serialNumber === 'string') {
            return serialNumber.toUpperCase().replace(/[^0-9A-F]/g, '').match(/.{2}/g)?.join(':') || serialNumber;
        }
        
        return serialNumber;
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
        try {
            window.debugService.log(`📱 Writing to NFC tag: ${url}`, 'nfc');
            
            if (!('NDEFWriter' in window)) {
                throw new Error('NDEFWriter not supported on this device/browser');
            }
            
            const writer = new NDEFWriter();
            
            // Try writing with just the URL
            await writer.write(url);
            
            window.debugService.log('📱 NFC write successful!', 'success');
            return true;
            
        } catch (error) {
            window.debugService.log(`📱 NFC write failed: ${error.name} - ${error.message}`, 'error');
            
            // Try to give more helpful error messages
            if (error.name === 'NotAllowedError') {
                throw new Error('NFC permission denied');
            } else if (error.name === 'NetworkError') {
                throw new Error('Could not reach NFC tag - hold phone closer');
            } else if (error.name === 'NotSupportedError') {
                throw new Error('NFC writing not supported on this device');
            } else {
                throw new Error(error.message || 'NFC write failed');
            }
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
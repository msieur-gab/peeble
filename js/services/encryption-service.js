// Encryption service for secure message handling
class EncryptionService {
    constructor() {
        this.algorithm = 'AES-GCM';
        this.keyLength = 256;
        this.ivLength = 12;
        this.iterations = 100000;
    }

    // Derive encryption key from UUID and timestamp
    async deriveKey(uuid, timestamp) {
        try {
            window.debugService.log('🔐 Deriving encryption key...');
            
            const keyMaterial = await crypto.subtle.importKey(
                'raw',
                new TextEncoder().encode(timestamp.toString()),
                'PBKDF2',
                false,
                ['deriveKey']
            );

            const key = await crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: new TextEncoder().encode(uuid),
                    iterations: this.iterations,
                    hash: 'SHA-256'
                },
                keyMaterial,
                { name: this.algorithm, length: this.keyLength },
                false,
                ['encrypt', 'decrypt']
            );

            window.debugService.log('🔐 Encryption key derived successfully', 'success');
            return key;
            
        } catch (error) {
            window.debugService.log(`🔐 Key derivation failed: ${error.message}`, 'error');
            throw error;
        }
    }

    // Encrypt data to binary format
    async encryptToBinary(data, key) {
        try {
            window.debugService.log(`🔐 Encrypting data (${data.byteLength || data.length} bytes)...`);
            
            const iv = crypto.getRandomValues(new Uint8Array(this.ivLength));
            const encodedData = typeof data === 'string' ? 
                new TextEncoder().encode(data) : new Uint8Array(data);
            
            const encrypted = await crypto.subtle.encrypt(
                { name: this.algorithm, iv: iv },
                key,
                encodedData
            );

            // Combine IV + encrypted data
            const result = new Uint8Array(iv.length + encrypted.byteLength);
            result.set(iv);
            result.set(new Uint8Array(encrypted), iv.length);
            
            window.debugService.log(`🔐 Data encrypted to binary (${result.length} bytes)`, 'success');
            return result;
            
        } catch (error) {
            window.debugService.log(`🔐 Encryption failed: ${error.message}`, 'error');
            throw error;
        }
    }

    // Encrypt data to base64 string (for localStorage)
    async encryptToBase64(data, key) {
        try {
            const binaryResult = await this.encryptToBinary(data, key);
            const base64 = this.binaryToBase64(binaryResult);
            
            window.debugService.log(`🔐 Data encrypted to base64 (${base64.length} chars)`, 'success');
            return base64;
            
        } catch (error) {
            window.debugService.log(`🔐 Base64 encryption failed: ${error.message}`, 'error');
            throw error;
        }
    }

    // Decrypt from binary data
    async decryptFromBinary(encryptedData, key) {
        try {
            window.debugService.log(`🔓 Decrypting binary data (${encryptedData.length} bytes)...`);
            
            const iv = encryptedData.slice(0, this.ivLength);
            const encrypted = encryptedData.slice(this.ivLength);
            
            const decrypted = await crypto.subtle.decrypt(
                { name: this.algorithm, iv: iv },
                key,
                encrypted
            );

            window.debugService.log(`🔓 Binary decryption successful (${decrypted.byteLength} bytes)`, 'success');
            return decrypted;
            
        } catch (error) {
            window.debugService.log(`🔓 Binary decryption failed: ${error.message}`, 'error');
            throw error;
        }
    }

    // Decrypt from base64 string
    async decryptFromBase64(encryptedBase64, key) {
        try {
            window.debugService.log(`🔓 Decrypting base64 data (${encryptedBase64.length} chars)...`);
            
            const binaryData = this.base64ToBinary(encryptedBase64);
            const decrypted = await this.decryptFromBinary(binaryData, key);
            
            return decrypted;
            
        } catch (error) {
            window.debugService.log(`🔓 Base64 decryption failed: ${error.message}`, 'error');
            throw error;
        }
    }

    // Helper: Convert binary to base64
    binaryToBase64(data) {
        let base64String = '';
        const chunk = 8192; // Process in chunks to avoid stack overflow
        
        for (let i = 0; i < data.length; i += chunk) {
            const slice = data.slice(i, i + chunk);
            base64String += btoa(String.fromCharCode.apply(null, slice));
        }
        
        return base64String;
    }

    // Helper: Convert base64 to binary
    base64ToBinary(base64String) {
        try {
            const binaryString = atob(base64String);
            const data = new Uint8Array(binaryString.length);
            
            for (let i = 0; i < binaryString.length; i++) {
                data[i] = binaryString.charCodeAt(i);
            }
            
            return data;
            
        } catch (error) {
            // Try to clean the base64 string if it's malformed
            const cleanBase64 = base64String.replace(/[^A-Za-z0-9+/]/g, '');
            const paddedBase64 = cleanBase64 + '='.repeat((4 - cleanBase64.length % 4) % 4);
            
            window.debugService.log('🔓 Cleaned malformed base64 string', 'warning');
            
            const binaryString = atob(paddedBase64);
            const data = new Uint8Array(binaryString.length);
            
            for (let i = 0; i < binaryString.length; i++) {
                data[i] = binaryString.charCodeAt(i);
            }
            
            return data;
        }
    }

    // Generate unique identifiers
    generateMessageId() {
        return 'PBL-' + Math.random().toString(36).substr(2, 8).toUpperCase();
    }

    // Note: No longer generating random UUIDs - we use actual NFC tag serial numbers
}

// Create global encryption service
window.encryptionService = new EncryptionService();
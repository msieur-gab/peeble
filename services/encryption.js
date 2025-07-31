// services/encryption.js

import { debugLog } from './utils.js';

/**
 * Handles all encryption and decryption operations for Peeble messages.
 */
export class EncryptionService {
    /**
     * Derives an encryption key from a UUID and timestamp using PBKDF2.
     * @param {string} uuid - The NFC UUID, used as salt for key derivation.
     * @param {number} timestamp - The timestamp, used as key material.
     * @returns {Promise<CryptoKey>} A promise that resolves to the derived CryptoKey.
     */
    async deriveEncryptionKey(uuid, timestamp) {
        debugLog('Deriving encryption key...');
        try {
            // Use timestamp as raw key material
            const keyMaterial = await crypto.subtle.importKey(
                'raw',
                new TextEncoder().encode(timestamp.toString()),
                'PBKDF2',
                false,
                ['deriveKey']
            );

            // Derive the actual AES-GCM key using UUID as salt
            const key = await crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: new TextEncoder().encode(uuid), // UUID as salt
                    iterations: 100000, // High iteration count for security
                    hash: 'SHA-256'
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 }, // AES-256-GCM for strong encryption
                false,
                ['encrypt', 'decrypt']
            );
            debugLog('Encryption key derived successfully.', 'success');
            return key;
        } catch (error) {
            debugLog(`Error deriving encryption key: ${error.message}`, 'error');
            throw new Error('Failed to derive encryption key.');
        }
    }

    /**
     * Encrypts data (Uint8Array or ArrayBuffer) using AES-GCM.
     * @param {ArrayBuffer|Uint8Array} data - The data to encrypt.
     * @param {CryptoKey} key - The encryption key.
     * @returns {Promise<Uint8Array>} A promise that resolves to the combined IV + encrypted data.
     */
    async encryptDataToBinary(data, key) {
        debugLog(`Encrypting data to binary, original size: ${data.byteLength} bytes`);
        try {
            const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for AES-GCM
            const encrypted = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                data
            );

            // Combine IV and encrypted data into a single Uint8Array
            const result = new Uint8Array(iv.length + encrypted.byteLength);
            result.set(iv);
            result.set(new Uint8Array(encrypted), iv.length);

            debugLog(`Data encrypted to binary: ${result.length} bytes`, 'success');
            return result;
        } catch (error) {
            debugLog(`Encryption to binary error: ${error.message}`, 'error');
            throw new Error('Failed to encrypt data to binary.');
        }
    }

    /**
     * Encrypts string data and encodes the result to Base64.
     * Useful for storing encrypted transcripts in local storage or as part of a URL.
     * @param {string} data - The string data to encrypt.
     * @param {CryptoKey} key - The encryption key.
     * @returns {Promise<string>} A promise that resolves to the Base64 encoded encrypted string.
     */
    async encryptDataToBase64(data, key) {
        debugLog(`Encrypting string data to Base64, original length: ${data.length}`);
        try {
            const encodedData = new TextEncoder().encode(data); // Encode string to Uint8Array
            const binaryResult = await this.encryptDataToBinary(encodedData, key);

            // Convert Uint8Array to Base64 string
            let base64String = '';
            const chunk = 8192; // Process in chunks to avoid stack overflow for large data
            for (let i = 0; i < binaryResult.length; i += chunk) {
                const slice = binaryResult.slice(i, i + chunk);
                base64String += btoa(String.fromCharCode.apply(null, slice));
            }

            debugLog(`String data encrypted to Base64: ${base64String.length} characters`, 'success');
            return base64String;
        } catch (error) {
            debugLog(`Encryption to Base64 error: ${error.message}`, 'error');
            throw new Error('Failed to encrypt data to Base64.');
        }
    }

    /**
     * Decrypts binary data (IV + encrypted data) using AES-GCM.
     * @param {Uint8Array} encryptedData - The combined IV + encrypted data.
     * @param {CryptoKey} key - The decryption key.
     * @returns {Promise<ArrayBuffer>} A promise that resolves to the decrypted ArrayBuffer.
     */
    async decryptFromBinary(encryptedData, key) {
        debugLog(`Decrypting binary data, size: ${encryptedData.length} bytes`);
        try {
            const iv = encryptedData.slice(0, 12); // Extract IV (first 12 bytes)
            const encrypted = encryptedData.slice(12); // Remaining bytes are the ciphertext

            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                encrypted
            );

            debugLog(`Decryption successful, result size: ${decrypted.byteLength} bytes`, 'success');
            return decrypted;
        } catch (error) {
            debugLog(`Binary decryption error: ${error.message}`, 'error');
            throw new Error('Failed to decrypt binary data.');
        }
    }

    /**
     * Decrypts Base64 encoded data and decodes it back to a string.
     * @param {string} encryptedData - The Base64 encoded encrypted string.
     * @param {CryptoKey} key - The decryption key.
     * @returns {Promise<string>} A promise that resolves to the decrypted string.
     */
    async decryptFromBase64(encryptedData, key) {
        debugLog(`Decrypting Base64 data, length: ${encryptedData.length}`);
        try {
            // Safely decode Base64 to binary string
            let binaryString;
            try {
                binaryString = atob(encryptedData);
            } catch (error) {
                debugLog(`Base64 decode failed, attempting cleanup: ${error.message}`, 'warning');
                // Attempt to clean and pad the Base64 string if it's malformed
                const cleanBase64 = encryptedData.replace(/[^A-Za-z0-9+/=]/g, ''); // Remove invalid chars
                const paddedBase64 = cleanBase64 + '='.repeat((4 - cleanBase64.length % 4) % 4); // Add padding
                binaryString = atob(paddedBase64);
            }

            // Convert binary string to Uint8Array
            const data = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                data[i] = binaryString.charCodeAt(i);
            }

            const decryptedBinary = await this.decryptFromBinary(data, key);
            const decryptedString = new TextDecoder().decode(decryptedBinary); // Decode Uint8Array to string

            debugLog('Base64 decryption successful and decoded to string.', 'success');
            return decryptedString;
        } catch (error) {
            debugLog(`Base64 decryption error: ${error.message}`, 'error');
            throw new Error('Failed to decrypt Base64 data.');
        }
    }
}

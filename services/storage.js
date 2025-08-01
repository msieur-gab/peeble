// services/storage.js

import { debugLog } from './utils.js';

/**
 * Service for interacting with Pinata IPFS for storing and retrieving encrypted messages.
 * SECURITY: Stores complete encrypted packages but NEVER stores the tag serial.
 */
export class StorageService {
    /**
     * @param {string} apiKey - Pinata API Key.
     * @param {string} secret - Pinata Secret API Key.
     */
    constructor(apiKey, secret) {
        this.apiKey = apiKey;
        this.secret = secret;
        this.pinataApiUrl = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
        this.pinataGatewayUrl = 'https://gateway.pinata.cloud/ipfs/';
    }

    /**
     * Sets the Pinata API credentials.
     * @param {string} apiKey
     * @param {string} secret
     */
    setCredentials(apiKey, secret) {
        this.apiKey = apiKey;
        this.secret = secret;
        debugLog('Pinata credentials updated in StorageService.');
    }

    /**
     * Tests the connection to the Pinata API.
     * @returns {Promise<boolean>} True if connection is successful, false otherwise.
     */
    async testConnection() {
        debugLog('Testing Pinata API connection...');
        if (!this.apiKey || !this.secret) {
            debugLog('Pinata API credentials are not set.', 'error');
            throw new Error('Pinata API credentials are required.');
        }

        try {
            const response = await fetch('https://api.pinata.cloud/data/testAuthentication', {
                headers: {
                    'pinata_api_key': this.apiKey,
                    'pinata_secret_api_key': this.secret
                }
            });

            const data = await response.json();
            if (response.ok && data.message === 'Congratulations! You are communicating with the Pinata API!') {
                debugLog('Pinata API authentication successful.', 'success');
                return true;
            } else {
                debugLog(`Pinata API authentication failed: ${data.error || data.message || 'Unknown error'}`, 'error');
                return false;
            }
        } catch (error) {
            debugLog(`Error testing Pinata API connection: ${error.message}`, 'error');
            throw new Error(`Failed to connect to Pinata: ${error.message}`);
        }
    }

    /**
     * Uploads a complete encrypted Peeble package to IPFS.
     * SECURITY: Package contains everything EXCEPT the tag serial (encryption key).
     * @param {object} messagePackage - The complete message package.
     * @param {string} messagePackage.messageId - Unique message identifier.
     * @param {number} messagePackage.timestamp - Creation timestamp (used with serial for key derivation).
     * @param {Uint8Array} messagePackage.encryptedAudio - Encrypted audio data.
     * @param {string} messagePackage.encryptedTranscript - Base64 encrypted transcript.
     * @param {object} messagePackage.metadata - Additional metadata (duration, etc.).
     * @returns {Promise<string>} A promise that resolves to the IPFS hash (CID).
     */
    async uploadMessagePackage(messagePackage) {
        debugLog(`Starting secure package upload: ${messagePackage.messageId}`);

        if (!this.apiKey || !this.secret) {
            debugLog('Pinata API credentials are not set. Cannot upload.', 'error');
            throw new Error('Pinata API credentials are required for upload.');
        }

        // Check file size limits
        const audioSize = messagePackage.encryptedAudio.length;
        if (audioSize > 25 * 1024 * 1024) { // 25MB limit
            debugLog(`Audio file too large: ${audioSize} bytes. Maximum 25MB allowed.`, 'error');
            throw new Error('Audio file too large. Please record a shorter message.');
        }

        try {
            // Create a JSON representation of the package
            // Convert Uint8Array to base64 safely (handle large files)
            debugLog(`Converting encrypted audio to base64 (${messagePackage.encryptedAudio.length} bytes)...`);
            let audioBase64 = '';
            const chunkSize = 8192; // Process in chunks to avoid stack overflow
            for (let i = 0; i < messagePackage.encryptedAudio.length; i += chunkSize) {
                const chunk = messagePackage.encryptedAudio.slice(i, i + chunkSize);
                audioBase64 += btoa(String.fromCharCode.apply(null, chunk));
            }
            debugLog(`Base64 conversion complete (${audioBase64.length} characters)`);

            const packageData = {
                messageId: messagePackage.messageId,
                timestamp: messagePackage.timestamp,
                encryptedTranscript: messagePackage.encryptedTranscript,
                metadata: messagePackage.metadata,
                encryptedAudio: audioBase64
            };

            const jsonString = JSON.stringify(packageData);
            debugLog(`Package JSON created (${jsonString.length} characters)`);
            
            const blob = new Blob([jsonString], { type: 'application/json' });

            const formData = new FormData();
            formData.append('file', blob, `${messagePackage.messageId}-package.json`);

            const metadata = JSON.stringify({
                name: `${messagePackage.messageId}-package.json`,
                keyvalues: {
                    app: 'peeble-secure',
                    type: 'encrypted-package',
                    messageId: messagePackage.messageId,
                    created: new Date().toISOString()
                }
            });
            formData.append('pinataMetadata', metadata);

            const options = JSON.stringify({
                cidVersion: 0,
            });
            formData.append('pinataOptions', options);

            const response = await fetch(this.pinataApiUrl, {
                method: 'POST',
                headers: {
                    'pinata_api_key': this.apiKey,
                    'pinata_secret_api_key': this.secret
                },
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                debugLog(`Pinata package upload failed: ${errorText}`, 'error');
                let errorMessage;
                try {
                    const errorJson = JSON.parse(errorText);
                    errorMessage = errorJson.error || errorJson.message || `HTTP ${response.status}`;
                } catch {
                    errorMessage = `HTTP ${response.status}: ${errorText}`;
                }
                throw new Error(`Pinata upload failed: ${errorMessage}`);
            }

            const result = await response.json();
            debugLog(`Secure package uploaded! IPFS Hash: ${result.IpfsHash}`, 'success');
            return result.IpfsHash;
        } catch (error) {
            debugLog(`Error uploading package to Pinata: ${error.message}`, 'error');
            throw new Error(`Failed to upload to IPFS: ${error.message}`);
        }
    }

    /**
     * Downloads a complete encrypted message package from IPFS.
     * SECURITY: Package contains encrypted data but NO decryption key (serial).
     * @param {string} ipfsHash - The IPFS hash (CID) of the package to download.
     * @returns {Promise<object>} A promise that resolves to the message package.
     */
    async downloadMessagePackage(ipfsHash) {
        debugLog(`Downloading secure package from IPFS: ${ipfsHash}`);
        try {
            const url = `${this.pinataGatewayUrl}${ipfsHash}`;
            const response = await fetch(url);

            if (!response.ok) {
                debugLog(`Failed to download package from IPFS: ${response.status} ${response.statusText}`, 'error');
                throw new Error(`Failed to download from IPFS: ${response.status} ${response.statusText}`);
            }

            const packageData = await response.json();

            // Convert base64 audio back to Uint8Array safely
            const audioBase64 = packageData.encryptedAudio;
            const binaryString = atob(audioBase64);
            const encryptedAudio = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                encryptedAudio[i] = binaryString.charCodeAt(i);
            }

            const messagePackage = {
                messageId: packageData.messageId,
                timestamp: packageData.timestamp,
                encryptedAudio: encryptedAudio,
                encryptedTranscript: packageData.encryptedTranscript,
                metadata: packageData.metadata
            };

            debugLog(`Package downloaded successfully: ${messagePackage.messageId}`, 'success');
            return messagePackage;
        } catch (error) {
            debugLog(`Error downloading package from Pinata: ${error.message}`, 'error');
            throw new Error(`Failed to download package from IPFS: ${error.message}`);
        }
    }

    // Legacy methods kept for backward compatibility (not used in secure flow)
    async uploadToPinata(data, filename) {
        debugLog('Warning: Using legacy upload method. Consider using uploadMessagePackage for security.', 'warning');
        
        if (!this.apiKey || !this.secret) {
            debugLog('Pinata API credentials are not set. Cannot upload.', 'error');
            throw new Error('Pinata API credentials are required for upload.');
        }

        try {
            const formData = new FormData();
            const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/octet-stream' });
            formData.append('file', blob, filename);

            const metadata = JSON.stringify({
                name: filename,
                keyvalues: {
                    app: 'peeble-legacy',
                    type: 'legacy-upload',
                    created: new Date().toISOString()
                }
            });
            formData.append('pinataMetadata', metadata);

            const response = await fetch(this.pinataApiUrl, {
                method: 'POST',
                headers: {
                    'pinata_api_key': this.apiKey,
                    'pinata_secret_api_key': this.secret
                },
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.status}`);
            }

            const result = await response.json();
            return result.IpfsHash;
        } catch (error) {
            throw new Error(`Failed to upload to IPFS: ${error.message}`);
        }
    }

    async downloadFromPinata(ipfsHash) {
        debugLog('Warning: Using legacy download method. Consider using downloadMessagePackage for security.', 'warning');
        
        try {
            const url = `${this.pinataGatewayUrl}${ipfsHash}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Failed to download from IPFS: ${response.status} ${response.statusText}`);
            }

            return new Uint8Array(await response.arrayBuffer());
        } catch (error) {
            throw new Error(`Failed to download from IPFS: ${error.message}`);
        }
    }
}
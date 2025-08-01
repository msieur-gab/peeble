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
     * Requests a temporary, signed URL from Pinata for a specific IPFS hash.
     * This URL can bypass CORS issues and is a more reliable way to download content.
     * @param {string} ipfsHash - The IPFS hash (CID) of the package to download.
     * @returns {Promise<string>} A promise that resolves to the signed URL.
     */
    async getSignedDownloadUrl(ipfsHash) {
        if (!this.apiKey || !this.secret) {
            throw new Error('Pinata API credentials are required to get a signed URL.');
        }
        
        const apiUrl = 'https://api.pinata.cloud/signed-url';
        const body = JSON.stringify({ ipfsPinHash: ipfsHash });

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'pinata_api_key': this.apiKey,
                    'pinata_secret_api_key': this.secret
                },
                body: body
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Pinata signed URL failed: HTTP ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            return result.signedUrl;
        } catch (error) {
            debugLog(`Error getting signed URL from Pinata: ${error.message}`, 'error');
            throw new Error(`Failed to get signed URL: ${error.message}`);
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
            // FIX: Using a more robust conversion method for binary to Base64
            debugLog(`Converting encrypted audio to base64 (${messagePackage.encryptedAudio.length} bytes)...`);
            const audioBase64 = this.binToBase64(messagePackage.encryptedAudio);
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
     * This updated version first tries to get a signed URL from Pinata to avoid CORS issues.
     * It then falls back to public gateways if the signed URL attempt fails.
     * @param {string} ipfsHash - The IPFS hash (CID) of the package to download.
     * @returns {Promise<object>} A promise that resolves to the message package.
     */
    async downloadMessagePackage(ipfsHash) {
        debugLog(`🔽 STARTING SECURE DOWNLOAD`, 'info');
        debugLog(`📋 Package Hash: ${ipfsHash}`, 'info');
        
        let lastError = null;
        let packageData;

        // NEW: Step 1 - Try downloading with a signed URL first
        try {
            debugLog('🌐 GATEWAY 1/4: Attempting to get Pinata Signed URL...', 'info');
            const signedUrl = await this.getSignedDownloadUrl(ipfsHash);
            
            debugLog('🌐 GATEWAY 2/4: Downloading using Signed URL', 'info');
            const response = await fetch(signedUrl);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            packageData = await response.json();
            debugLog(`✅ JSON parsed from signed URL`, 'success');
            debugLog(`🎉 IPFS DOWNLOAD COMPLETE using signed URL!`, 'success');

        } catch (error) {
            lastError = error;
            debugLog(`❌ Signed URL download failed: ${error.message}`, 'error');
            debugLog('🔄 Trying public gateways as fallback...', 'info');
        }

        // ORIGINAL: Step 2 - Fallback to public gateways if signed URL fails
        if (!packageData) {
            const gateways = [
                `https://ipfs.io/ipfs/${ipfsHash}`,
                `https://cloudflare-ipfs.com/ipfs/${ipfsHash}`,
                `${this.pinataGatewayUrl}${ipfsHash}`
            ];
            
            for (let i = 0; i < gateways.length; i++) {
                const url = gateways[i];
                const gatewayName = url.includes('ipfs.io') ? 'IPFS.IO' : 
                                  url.includes('cloudflare') ? 'CLOUDFLARE' : 'PINATA';
                
                debugLog(`🌐 GATEWAY ${i + 3}/${gateways.length + 2}: ${gatewayName}`, 'info');

                try {
                    const response = await fetch(url, {
                        method: 'GET',
                        mode: 'cors',
                        headers: { 'Accept': 'application/json' },
                        cache: 'no-cache'
                    });
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    packageData = await response.json();
                    debugLog(`✅ JSON parsed from ${gatewayName}`, 'success');
                    debugLog(`🎉 IPFS DOWNLOAD COMPLETE using public gateway!`, 'success');
                    break; // Exit the loop if successful
                } catch (error) {
                    lastError = error;
                    debugLog(`❌ GATEWAY ${i + 3} FAILED: ${error.message}`, 'error');
                }
            }
        }

        if (!packageData) {
            throw new Error(`All download attempts failed: ${lastError?.message || 'Unknown error'}`);
        }

        // FINAL STEP: Process the downloaded package
        debugLog(`🔄 Converting base64 audio back to binary...`, 'info');
        const audioBase64 = packageData.encryptedAudio;
        if (!audioBase64) {
            throw new Error('No encrypted audio data in package');
        }
        
        try {
            // FIX: Correctly converting from base64 string to Uint8Array
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

            return messagePackage;

        } catch (error) {
            debugLog(`❌ Error converting base64 audio: ${error.message}`, 'error');
            throw new Error(`Failed to process downloaded audio: ${error.message}`);
        }
    }
    
    /**
     * @param {Uint8Array} binary
     * @returns {string}
     */
    binToBase64(binary) {
        let binaryString = '';
        const len = binary.byteLength;
        for (let i = 0; i < len; i++) {
            binaryString += String.fromCharCode(binary[i]);
        }
        return btoa(binaryString);
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
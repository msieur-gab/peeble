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
        debugLog(`🔽 STARTING IPFS DOWNLOAD`, 'info');
        debugLog(`📋 Package Hash: ${ipfsHash}`, 'info');
        debugLog(`📋 Mobile Debug Mode: Full logging enabled`, 'info');
        
        // Try CORS-friendly IPFS gateways first
        const gateways = [
            `https://ipfs.io/ipfs/${ipfsHash}`, // Better CORS support
            `https://cloudflare-ipfs.com/ipfs/${ipfsHash}`, // Good CORS support
            `${this.pinataGatewayUrl}${ipfsHash}` // Pinata gateway (may have CORS issues)
        ];
        
        debugLog(`📋 Will try ${gateways.length} IPFS gateways in order`, 'info');
        
        let lastError = null;
        
        for (let i = 0; i < gateways.length; i++) {
            const url = gateways[i];
            const gatewayName = url.includes('ipfs.io') ? 'IPFS.IO' : 
                              url.includes('cloudflare') ? 'CLOUDFLARE' : 'PINATA';
            
            debugLog(`🌐 GATEWAY ${i + 1}/${gateways.length}: ${gatewayName}`, 'info');
            debugLog(`📋 Full URL: ${url}`, 'info');
            
            try {
                debugLog(`📤 Sending fetch request...`, 'info');
                debugLog(`📋 Request mode: CORS`, 'info');
                debugLog(`📋 Request headers: Accept=application/json`, 'info');
                
                const fetchStart = Date.now();
                const response = await fetch(url, {
                    method: 'GET',
                    mode: 'cors', // Explicitly request CORS
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    // Add cache-busting to avoid stale responses
                    cache: 'no-cache'
                });
                const fetchTime = Date.now() - fetchStart;

                debugLog(`📥 Response received in ${fetchTime}ms`, 'info');
                debugLog(`📋 Status: ${response.status} ${response.statusText}`, 'info');
                debugLog(`📋 Content-Type: ${response.headers.get('content-type') || 'unknown'}`, 'info');
                debugLog(`📋 CORS headers: ${response.headers.get('access-control-allow-origin') || 'none'}`, 'info');

                if (!response.ok) {
                    debugLog(`❌ HTTP Error Response`, 'error');
                    debugLog(`📋 Status Code: ${response.status}`, 'error');
                    debugLog(`📋 Status Text: ${response.statusText}`, 'error');
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                debugLog(`✅ HTTP Response OK - parsing JSON...`, 'success');
                const jsonStart = Date.now();
                const packageData = await response.json();
                const jsonTime = Date.now() - jsonStart;
                
                debugLog(`✅ JSON parsed in ${jsonTime}ms`, 'success');
                debugLog(`📋 Package contains: messageId, timestamp, encryptedAudio, encryptedTranscript, metadata`, 'info');
                debugLog(`📋 MessageId from package: ${packageData.messageId}`, 'info');
                debugLog(`📋 Timestamp from package: ${packageData.timestamp}`, 'info');
                debugLog(`📋 Audio data length: ${packageData.encryptedAudio?.length || 0} chars`, 'info');
                debugLog(`📋 Transcript data length: ${packageData.encryptedTranscript?.length || 0} chars`, 'info');

                debugLog(`🔄 Converting base64 audio back to binary...`, 'info');
                // Convert base64 audio back to Uint8Array safely
                const audioBase64 = packageData.encryptedAudio;
                if (!audioBase64) {
                    throw new Error('No encrypted audio data in package');
                }
                
                const binaryStart = Date.now();
                const binaryString = atob(audioBase64);
                const encryptedAudio = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    encryptedAudio[i] = binaryString.charCodeAt(i);
                }
                const binaryTime = Date.now() - binaryStart;
                
                debugLog(`✅ Binary conversion complete in ${binaryTime}ms`, 'success');
                debugLog(`📋 Final audio binary size: ${encryptedAudio.length} bytes`, 'info');

                const messagePackage = {
                    messageId: packageData.messageId,
                    timestamp: packageData.timestamp,
                    encryptedAudio: encryptedAudio,
                    encryptedTranscript: packageData.encryptedTranscript,
                    metadata: packageData.metadata
                };

                debugLog(`🎉 IPFS DOWNLOAD COMPLETE!`, 'success');
                debugLog(`✅ Gateway used: ${gatewayName}`, 'success');
                debugLog(`✅ Package ready for decryption`, 'success');
                return messagePackage;
                
            } catch (error) {
                lastError = error;
                debugLog(`❌ GATEWAY ${i + 1} FAILED: ${error.name}`, 'error');
                debugLog(`📋 Error message: ${error.message}`, 'error');
                debugLog(`📋 Error type: ${error.constructor.name}`, 'error');
                
                // Detailed error analysis
                if (error.message.includes('Failed to fetch')) {
                    debugLog(`📋 Analysis: Network/CORS issue - browser blocked request`, 'error');
                    debugLog(`📋 Possible causes: CORS policy, network connectivity, gateway down`, 'error');
                } else if (error.message.includes('JSON')) {
                    debugLog(`📋 Analysis: JSON parsing failed - invalid response format`, 'error');
                } else if (error.message.includes('HTTP')) {
                    debugLog(`📋 Analysis: Server returned error status code`, 'error');
                } else {
                    debugLog(`📋 Analysis: Unknown error type`, 'error');
                }
                
                // If this isn't the last gateway, continue trying
                if (i < gateways.length - 1) {
                    debugLog(`🔄 Trying next gateway...`, 'info');
                    debugLog(`⏳ Brief delay before next attempt...`, 'info');
                    // Small delay between attempts
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                } else {
                    debugLog(`❌ All gateways exhausted`, 'error');
                }
            }
        }

        // All gateways failed - provide comprehensive error summary
        debugLog(`💥 IPFS DOWNLOAD COMPLETELY FAILED`, 'error');
        debugLog(`📋 Tried ${gateways.length} different IPFS gateways`, 'error');
        debugLog(`📋 Final error: ${lastError.message}`, 'error');
        
        const corsError = lastError.message.includes('Failed to fetch');
        if (corsError) {
            debugLog(`📋 Root cause: CORS (Cross-Origin Resource Sharing) blocking`, 'error');
            debugLog(`📋 Solution needed: CORS proxy or alternative download method`, 'error');
            throw new Error(`CORS policy blocked IPFS download from all gateways`);
        } else {
            debugLog(`📋 Root cause: ${lastError.constructor.name}`, 'error');
            throw new Error(`All IPFS gateways failed: ${lastError.message}`);
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
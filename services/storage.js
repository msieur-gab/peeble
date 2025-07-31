// services/storage.js

import { debugLog } from './utils.js';

/**
 * Service for interacting with Pinata IPFS for storing and retrieving encrypted messages.
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
     * Uploads data to Pinata IPFS.
     * @param {Uint8Array|ArrayBuffer|Blob} data - The data to upload.
     * @param {string} filename - The filename for the IPFS content.
     * @returns {Promise<string>} A promise that resolves to the IPFS hash (CID).
     */
    async uploadToPinata(data, filename) {
        debugLog(`Starting upload to Pinata: ${filename}, size: ${data.byteLength || data.size} bytes`);

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
                    app: 'peeble-demo',
                    type: 'encrypted-message',
                    created: new Date().toISOString()
                }
            });
            formData.append('pinataMetadata', metadata);

            const options = JSON.stringify({
                cidVersion: 0, // Use CIDv0 for broader compatibility
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
                debugLog(`Pinata upload failed with response: ${errorText}`, 'error');
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
            debugLog(`Upload successful! IPFS Hash: ${result.IpfsHash}`, 'success');
            return result.IpfsHash;
        } catch (error) {
            debugLog(`Error uploading to Pinata: ${error.message}`, 'error');
            throw new Error(`Failed to upload to IPFS: ${error.message}`);
        }
    }

    /**
     * Downloads data from Pinata IPFS gateway.
     * @param {string} ipfsHash - The IPFS hash (CID) of the content to download.
     * @returns {Promise<Uint8Array>} A promise that resolves to the downloaded binary data.
     */
    async downloadFromPinata(ipfsHash) {
        debugLog(`Downloading from IPFS: ${ipfsHash}`);
        try {
            const url = `${this.pinataGatewayUrl}${ipfsHash}`;
            const response = await fetch(url);

            if (!response.ok) {
                debugLog(`Failed to download from IPFS gateway: ${response.status} ${response.statusText}`, 'error');
                throw new Error(`Failed to download from IPFS: ${response.status} ${response.statusText}`);
            }

            const data = new Uint8Array(await response.arrayBuffer());
            debugLog(`Downloaded ${data.length} bytes from IPFS.`, 'success');
            return data;
        } catch (error) {
            debugLog(`Error downloading from Pinata: ${error.message}`, 'error');
            throw new Error(`Failed to download from IPFS: ${error.message}`);
        }
    }
}

// Storage service for IPFS/Pinata operations
class StorageService {
    constructor() {
        this.apiKey = '';
        this.secret = '';
        this.gatewayUrl = 'https://gateway.pinata.cloud/ipfs/';
        this.apiUrl = 'https://api.pinata.cloud';
    }

    // Initialize with API credentials
    init(apiKey, secret) {
        this.apiKey = apiKey;
        this.secret = secret;
        window.debugService.log('💾 Storage service initialized with Pinata credentials');
    }

    // Test connection to Pinata
    async testConnection() {
        if (!this.apiKey || !this.secret) {
            throw new Error('API credentials not set');
        }

        try {
            window.debugService.log('💾 Testing Pinata connection...');
            
            const response = await fetch(`${this.apiUrl}/data/testAuthentication`, {
                headers: {
                    'pinata_api_key': this.apiKey,
                    'pinata_secret_api_key': this.secret
                }
            });

            const data = await response.json();
            
            if (response.ok && data.message === 'Congratulations! You are communicating with the Pinata API!') {
                window.debugService.log('💾 Pinata connection successful!', 'success');
                return true;
            } else {
                throw new Error(data.error || data.message || 'Authentication failed');
            }
            
        } catch (error) {
            window.debugService.log(`💾 Pinata connection failed: ${error.message}`, 'error');
            throw error;
        }
    }

    // Upload encrypted data to IPFS
    async uploadToIPFS(encryptedData, messageId) {
        if (!this.apiKey || !this.secret) {
            throw new Error('Storage credentials not configured');
        }

        try {
            window.debugService.log(`💾 Uploading to IPFS: ${messageId} (${encryptedData.length} bytes)`);
            
            const formData = new FormData();
            const blob = new Blob([encryptedData], { type: 'application/octet-stream' });
            const filename = `${messageId}-audio.encrypted`;
            
            formData.append('file', blob, filename);

            // Add metadata
            const metadata = JSON.stringify({
                name: filename,
                keyvalues: {
                    app: 'peeble',
                    messageId: messageId,
                    type: 'encrypted-audio',
                    created: new Date().toISOString()
                }
            });
            formData.append('pinataMetadata', metadata);

            // Add options
            const options = JSON.stringify({
                cidVersion: 0,
            });
            formData.append('pinataOptions', options);

            const response = await fetch(`${this.apiUrl}/pinning/pinFileToIPFS`, {
                method: 'POST',
                headers: {
                    'pinata_api_key': this.apiKey,
                    'pinata_secret_api_key': this.secret
                },
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage;
                
                try {
                    const errorJson = JSON.parse(errorText);
                    errorMessage = errorJson.error || errorJson.message || `HTTP ${response.status}`;
                } catch {
                    errorMessage = `HTTP ${response.status}: ${errorText}`;
                }
                
                throw new Error(`Upload failed: ${errorMessage}`);
            }

            const result = await response.json();
            window.debugService.log(`💾 Upload successful! IPFS Hash: ${result.IpfsHash}`, 'success');
            
            return result.IpfsHash;
            
        } catch (error) {
            window.debugService.log(`💾 Upload failed: ${error.message}`, 'error');
            throw error;
        }
    }

    // Download encrypted data from IPFS
    async downloadFromIPFS(ipfsHash) {
        try {
            window.debugService.log(`💾 Downloading from IPFS: ${ipfsHash}`);
            
            const url = `${this.gatewayUrl}${ipfsHash}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`Download failed: HTTP ${response.status}`);
            }

            const encryptedData = new Uint8Array(await response.arrayBuffer());
            window.debugService.log(`💾 Download successful (${encryptedData.length} bytes)`, 'success');
            
            return encryptedData;
            
        } catch (error) {
            window.debugService.log(`💾 Download failed: ${error.message}`, 'error');
            throw error;
        }
    }

    // Get file info from IPFS
    async getFileInfo(ipfsHash) {
        try {
            const url = `${this.gatewayUrl}${ipfsHash}`;
            const response = await fetch(url, { method: 'HEAD' });
            
            return {
                exists: response.ok,
                size: response.headers.get('content-length'),
                type: response.headers.get('content-type'),
                lastModified: response.headers.get('last-modified')
            };
            
        } catch (error) {
            window.debugService.log(`💾 File info failed: ${error.message}`, 'error');
            return { exists: false };
        }
    }

    // Store credentials locally (for testing convenience)
    saveCredentials(apiKey, secret) {
        localStorage.setItem('pinataApiKey', apiKey);
        localStorage.setItem('pinataSecret', secret);
        this.init(apiKey, secret);
        window.debugService.log('💾 Credentials saved locally');
    }

    // Load credentials from localStorage
    loadCredentials() {
        const apiKey = localStorage.getItem('pinataApiKey');
        const secret = localStorage.getItem('pinataSecret');
        
        if (apiKey && secret) {
            this.init(apiKey, secret);
            window.debugService.log('💾 Credentials loaded from localStorage');
            return true;
        }
        
        return false;
    }

    // Check if credentials are configured
    isConfigured() {
        return !!(this.apiKey && this.secret);
    }
}

// Create global storage service
window.storageService = new StorageService();
// Main Peeble app component
class PeebleApp extends HTMLElement {
    constructor() {
        super();
        this.currentMode = null;
        this.currentComponent = null;
    }

    connectedCallback() {
        window.debugService.log('🪨 Peeble app connected');
        this.initializeApp();
    }

    async initializeApp() {
        // Load saved credentials if available
        window.storageService.loadCredentials();
        
        // Check NFC support
        await this.checkNFCSupport();
        
        // Determine app mode based on URL
        const modeInfo = window.URLParser.determineMode();
        window.debugService.log(`🪨 App mode: ${modeInfo.mode}`);
        
        if (modeInfo.mode === 'READING' && modeInfo.params) {
            await this.initReadingMode(modeInfo.params);
        } else {
            await this.initCreationMode();
        }
    }

    async checkNFCSupport() {
        if (window.nfcService.isSupported()) {
            window.debugService.log('📱 NFC supported - ready for real tags!', 'success');
            
            // Check permissions
            const permission = await window.nfcService.checkPermissions();
            if (permission === 'denied') {
                this.showNFCStatus('NFC permission denied. Please enable in browser settings.', 'error');
            }
        } else {
            window.debugService.log('📱 NFC not supported. Enable Web NFC in Chrome flags:', 'warning');
            window.debugService.log('chrome://flags/#enable-experimental-web-platform-features', 'warning');
            this.showNFCStatus('NFC not supported. Enable Web NFC in Chrome flags and restart browser.', 'warning');
        }
    }

    async initCreationMode() {
        this.currentMode = 'CREATION';
        this.updateStepIndicator(1);
        
        window.debugService.log('📝 Initializing creation mode...');
        
        // Check if we need to setup storage credentials
        if (!window.storageService.isConfigured()) {
            this.showStorageSetup();
            return;
        }
        
        // Create voice recorder component
        this.currentComponent = document.createElement('voice-recorder');
        this.currentComponent.addEventListener('message-created', this.handleMessageCreated.bind(this));
        
        this.innerHTML = '';
        this.appendChild(this.currentComponent);
        
        // Start NFC scanning for blank tags
        this.startNFCScanning();
    }

    async initReadingMode(params) {
        this.currentMode = 'READING';
        this.updateStepIndicator(3);
        
        window.debugService.log('👂 Initializing reading mode...', 'success');
        
        // Validate parameters
        const validation = window.URLParser.validateParams(params);
        if (!validation.isValid) {
            this.showError(`Invalid Peeble URL: ${validation.errors.join(', ')}`);
            return;
        }
        
        // Create message player component
        this.currentComponent = document.createElement('message-player');
        this.currentComponent.setAttribute('uuid', params.uuid);
        this.currentComponent.setAttribute('message-id', params.messageId);
        this.currentComponent.setAttribute('timestamp', params.timestamp);
        
        this.innerHTML = '';
        this.appendChild(this.currentComponent);
    }

    showStorageSetup() {
        this.innerHTML = `
            <div class="nfc-status warning">
                <h3>🔑 Setup Required</h3>
                <p>Please enter your Pinata IPFS credentials for testing:</p>
                <div style="margin: 15px 0;">
                    <input type="text" id="setupApiKey" placeholder="API Key" style="width: 100%; margin: 5px 0; padding: 10px; border: 1px solid #ddd; border-radius: 8px;">
                    <input type="password" id="setupSecret" placeholder="Secret" style="width: 100%; margin: 5px 0; padding: 10px; border: 1px solid #ddd; border-radius: 8px;">
                </div>
                <button class="btn" onclick="this.parentElement.parentElement.saveAndContinue()">Save & Continue</button>
                <p style="font-size: 0.8em; margin-top: 10px; opacity: 0.7;">
                    Get free credentials at <a href="https://pinata.cloud" target="_blank">pinata.cloud</a>
                </p>
            </div>
        `;
    }

    async saveAndContinue() {
        const apiKey = document.getElementById('setupApiKey').value.trim();
        const secret = document.getElementById('setupSecret').value.trim();
        
        if (!apiKey || !secret) {
            this.showNFCStatus('Please enter both API key and secret', 'error');
            return;
        }
        
        try {
            window.storageService.init(apiKey, secret);
            await window.storageService.testConnection();
            window.storageService.saveCredentials(apiKey, secret);
            
            // Continue with creation mode
            this.initCreationMode();
            
        } catch (error) {
            this.showNFCStatus(`Setup failed: ${error.message}`, 'error');
        }
    }

    startNFCScanning() {
        window.nfcService.startScanning(
            this.handleNFCRead.bind(this),
            this.handleNFCError.bind(this)
        );
    }

    handleNFCRead(url, serialNumber) {
        window.debugService.log(`📱 NFC tag scanned: ${url || 'blank tag'}`, 'nfc');
        
        if (url && window.URLParser.isPeebleUrl(url)) {
            // Redirect to reading mode
            window.location.href = url;
        } else if (!url) {
            // Blank tag - perfect for creation mode
            this.showNFCStatus('✅ Blank NFC tag detected - ready to create message!', 'success');
        } else {
            // Other URL
            this.showNFCStatus('📱 NFC tag contains different URL - place a blank tag to create message', 'warning');
        }
    }

    handleNFCError(error) {
        this.showNFCStatus(`NFC Error: ${error}`, 'error');
    }

    handleMessageCreated(event) {
        const { messageData, nfcUrl } = event.detail;
        this.showWriteToNFC(nfcUrl, messageData);
    }

    showWriteToNFC(nfcUrl, messageData) {
        this.updateStepIndicator(2);
        
        const urlInfo = window.URLParser.calculateUrlLength(messageData);
        
        this.innerHTML = `
            <div class="text-center">
                <h2>📱 Write to NFC Tag</h2>
                <p style="margin: 20px 0; color: #666;">
                    Place your phone on the NFC tag to write the message URL.
                </p>
                
                <div class="nfc-status">
                    <strong>Ready to write:</strong><br>
                    <small style="font-family: monospace; word-break: break-all;">${nfcUrl}</small><br>
                    <small>Length: ${urlInfo.length} chars ${urlInfo.fits.ntag213 ? '✅' : '❌'} NTAG213</small>
                </div>
                
                <button class="btn" onclick="this.parentElement.writeToNFC('${nfcUrl}')">
                    📱 Write to NFC Tag
                </button>
                
                <button class="btn btn-secondary" onclick="this.parentElement.backToCreation()">
                    ← Back to Recording
                </button>
            </div>
        `;
    }

    async writeToNFC(nfcUrl) {
        try {
            this.showNFCStatus('📱 Place phone on NFC tag now...', 'info');
            
            await window.nfcService.writeToTag(nfcUrl);
            
            this.updateStepIndicator(3);
            this.showSuccess();
            
        } catch (error) {
            this.showNFCStatus(`Write failed: ${error.message}`, 'error');
        }
    }

    showSuccess() {
        this.innerHTML = `
            <div class="text-center">
                <h2>🎉 Peeble Created!</h2>
                <p style="margin: 20px 0; color: #666;">
                    Your NFC tag now contains the encrypted voice message.
                    Anyone can scan it to hear your message!
                </p>
                
                <div class="nfc-status success">
                    ✅ Message encrypted and stored on IPFS<br>
                    ✅ NFC tag written successfully<br>
                    ✅ Ready to share your Peeble stone
                </div>
                
                <button class="btn" onclick="this.parentElement.createAnother()">
                    Create Another Peeble
                </button>
            </div>
        `;
    }

    backToCreation() {
        this.initCreationMode();
    }

    createAnother() {
        window.URLParser.clearParams();
        this.initCreationMode();
    }

    showError(message) {
        this.innerHTML = `
            <div class="nfc-status error">
                <h3>❌ Error</h3>
                <p>${message}</p>
                <button class="btn" onclick="location.href = '${window.URLParser.getBaseUrl()}'">
                    Start Over
                </button>
            </div>
        `;
    }

    showNFCStatus(message, type = 'info') {
        const existingStatus = document.querySelector('.nfc-status');
        if (existingStatus) {
            existingStatus.className = `nfc-status ${type}`;
            existingStatus.innerHTML = message;
        }
    }

    updateStepIndicator(step) {
        const dots = document.querySelectorAll('.step-dot');
        dots.forEach((dot, index) => {
            dot.classList.toggle('active', index < step);
        });
    }
}

// Register the custom element
customElements.define('peeble-app', PeebleApp);
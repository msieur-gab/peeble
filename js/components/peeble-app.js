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
        
        // Debug the URL parsing
        window.debugService.log(`🪨 Current URL: ${window.location.href}`);
        window.debugService.log(`🪨 Hash: ${window.location.hash}`);
        window.debugService.log(`🪨 Parsed params: ${JSON.stringify(modeInfo.params)}`);
        window.debugService.log(`🪨 App mode: ${modeInfo.mode}`);
        
        if (modeInfo.mode === 'READING' && modeInfo.params) {
            await this.initReadingMode(modeInfo.params);
        } else {
            await this.initCreationMode();
        }
    }

    async checkNFCSupport() {
        if ('NDEFReader' in window) {
            window.debugService.log('📱 NFC supported - ready for testing!', 'success');
        } else {
            this.showNFCStatus('NFC not supported on this browser/device.', 'error');
        }
    }

    async initCreationMode() {
        this.currentMode = 'CREATION';
        this.updateStepIndicator(1);
        
        window.debugService.log('📝 Initializing creation mode...', 'success');
        
        // Update page title to show mode
        document.title = '🪨 Peeble - Create Message';
        
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
        
        // Update page title to show mode
        document.title = '🪨 Peeble - Play Message';
        
        // Validate parameters
        const validation = window.URLParser.validateParams(params);
        if (!validation.isValid) {
            this.showError(`Invalid Peeble URL: ${validation.errors.join(', ')}`);
            return;
        }
        
        // Create message player component
        this.currentComponent = document.createElement('message-player');
        this.currentComponent.setAttribute('serial', params.serial); // Use actual tag serial
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
                <button class="btn" id="saveCredentialsBtn">Save & Continue</button>
                <p style="font-size: 0.8em; margin-top: 10px; opacity: 0.7;">
                    Get free credentials at <a href="https://pinata.cloud" target="_blank">pinata.cloud</a>
                </p>
            </div>
        `;
        
        // Add proper event listener
        const saveBtn = this.querySelector('#saveCredentialsBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveAndContinue());
        }
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

    handleNFCRead(url, tagSerial) {
        window.debugService.log(`📱 NFC tag scanned: ${url || 'blank tag'} (Serial: ${tagSerial})`, 'nfc');
        
        if (url && window.URLParser.isPeebleUrl(url)) {
            // Written Peeble tag - redirect to reading mode
            window.location.href = url;
        } else if (!url && tagSerial) {
            // Blank tag with serial number - perfect for creation mode
            this.showNFCStatus(`✅ Blank NFC tag detected!\nSerial: ${tagSerial}\nReady to create message with this tag.`, 'success');
            
            // Pass the serial number to the voice recorder
            if (this.currentComponent && this.currentComponent.tagName === 'VOICE-RECORDER') {
                this.currentComponent.setTagSerial(tagSerial);
            }
        } else if (!url) {
            // Blank tag but no serial (shouldn't happen, but handle it)
            this.showNFCStatus('📱 Blank NFC tag detected - ready to create message!', 'success');
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
                    Write to NFC first, then upload to IPFS.
                </p>
                
                <div class="nfc-status" id="writeStatus">
                    <strong>Ready to write:</strong><br>
                    <small style="font-family: monospace; word-break: break-all;">${nfcUrl}</small><br>
                    <small>Tag: ${messageData.tagSerial}</small>
                </div>
                
                <button class="btn" id="writeNfcBtn">
                    📱 Write to NFC Tag
                </button>
                
                <button class="btn btn-secondary" id="backToRecordingBtn">
                    ← Back to Recording
                </button>
            </div>
        `;
        
        // Store messageData for the write operation
        this.currentMessageData = messageData;
        
        // Add proper event listeners with correct context
        this.setupWriteNFCHandlers(nfcUrl);
    }

    setupWriteNFCHandlers(nfcUrl) {
        const writeBtn = this.querySelector('#writeNfcBtn');
        const backBtn = this.querySelector('#backToRecordingBtn');
        
        if (writeBtn) {
            writeBtn.addEventListener('click', () => this.writeToNFC(nfcUrl, this.currentMessageData));
        }
        
        if (backBtn) {
            backBtn.addEventListener('click', () => this.backToCreation());
        }
    }

    async writeToNFC(nfcUrl, messageData) {
        const writeBtn = this.querySelector('#writeNfcBtn');
        const statusEl = this.querySelector('#writeStatus');
        
        if (!writeBtn || !statusEl) return;
        
        const originalText = writeBtn.textContent;
        writeBtn.disabled = true;
        writeBtn.textContent = '📱 Writing...';
        
        try {
            statusEl.className = 'nfc-status';
            statusEl.innerHTML = '📱 <strong>Place phone on NFC tag now...</strong>';
            
            // Write to NFC first
            await window.nfcService.writeToTag(nfcUrl);
            
            window.debugService.log('📱 NFC write successful! Now uploading to IPFS...', 'success');
            statusEl.className = 'nfc-status success';
            statusEl.innerHTML = '✅ <strong>NFC write successful!</strong><br>📤 Uploading to IPFS...';
            
            // Only NOW upload to IPFS after successful NFC write
            try {
                const ipfsHash = await window.storageService.uploadToIPFS(
                    messageData.encryptedAudio, 
                    messageData.messageId
                );
                
                // Update message data with IPFS hash
                messageData.ipfsHash = ipfsHash;
                delete messageData.encryptedAudio; // Remove the binary data, keep hash
                
                // Save locally for testing
                this.saveMessageLocally(messageData);
                
                window.debugService.log('☁️ IPFS upload successful!', 'success');
                statusEl.innerHTML = '✅ <strong>Complete!</strong><br>📱 NFC written ✅ IPFS uploaded';
                
                setTimeout(() => {
                    this.updateStepIndicator(3);
                    this.showSuccess();
                }, 1500);
                
            } catch (uploadError) {
                window.debugService.log(`☁️ IPFS upload failed: ${uploadError.message}`, 'error');
                statusEl.className = 'nfc-status warning';
                statusEl.innerHTML = '⚠️ <strong>NFC written but upload failed</strong><br>Message works locally only';
                
                // Still save locally even if upload fails
                messageData.ipfsHash = 'local-only';
                delete messageData.encryptedAudio;
                this.saveMessageLocally(messageData);
                
                setTimeout(() => {
                    this.updateStepIndicator(3);
                    this.showSuccess();
                }, 2000);
            }
            
        } catch (error) {
            window.debugService.log(`📱 NFC write failed: ${error.message}`, 'error');
            
            statusEl.className = 'nfc-status error';
            statusEl.innerHTML = `❌ <strong>NFC write failed:</strong> ${error.message}<br><small>💡 Try holding phone closer to tag</small>`;
            
            writeBtn.disabled = false;
            writeBtn.textContent = '🔄 Try Again';
        }
    }

    saveMessageLocally(messageData) {
        const savedMessages = JSON.parse(localStorage.getItem('peebleMessages') || '[]');
        savedMessages.push(messageData);
        localStorage.setItem('peebleMessages', JSON.stringify(savedMessages));
        window.debugService.log('💾 Message saved locally for testing');
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
                
                <button class="btn" id="createAnotherBtn">
                    Create Another Peeble
                </button>
            </div>
        `;
        
        // Add proper event listener
        const createBtn = this.querySelector('#createAnotherBtn');
        if (createBtn) {
            createBtn.addEventListener('click', () => this.createAnother());
        }
    }

    backToCreation() {
        window.debugService.log('🔄 Returning to creation mode...');
        window.nfcService.stopScanning(); // Stop any active scanning
        this.initCreationMode();
    }

    createAnother() {
        window.debugService.log('🔄 Creating another Peeble...');
        window.URLParser.clearParams();
        window.nfcService.stopScanning(); // Stop any active scanning
        this.initCreationMode();
    }

    showError(message) {
        this.innerHTML = `
            <div class="nfc-status error">
                <h3>❌ Error</h3>
                <p>${message}</p>
                <button class="btn" id="startOverBtn">
                    Start Over
                </button>
            </div>
        `;
        
        // Add proper event listener
        const startBtn = this.querySelector('#startOverBtn');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                window.location.href = window.URLParser.getBaseUrl();
            });
        }
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
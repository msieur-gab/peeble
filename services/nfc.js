// services/nfc.js

import { debugLog } from './utils.js';

/**
 * Service for handling Web NFC API interactions (reading and writing).
 * Requires browser support for NDEFReader and NDEFWriter.
 */
export class NFCService {
    constructor() {
        this.ndefReader = null;
        this.ndefWriter = null;
        this.onNfcTagScanned = () => {}; // Callback for when a tag is scanned
        this.onNfcError = () => {}; // Callback for NFC errors
        this.isScanning = false;
    }

    /**
     * Checks if Web NFC API is supported in the current browser.
     * @returns {boolean} True if supported, false otherwise.
     */
    isSupported() {
        return 'NDEFReader' in window;
    }

    /**
     * Starts scanning for NFC tags.
     * @returns {Promise<void>}
     */
    async startScanning() {
        if (!this.isSupported()) {
            debugLog('Web NFC API not supported in this browser.', 'error');
            this.onNfcError('NFC not supported on this device.');
            return;
        }
        if (this.isScanning) {
            debugLog('NFC scanning is already active.', 'warning');
            return;
        }

        debugLog('Starting NFC scanning...');
        try {
            this.ndefReader = new NDEFReader();

            this.ndefReader.onreading = (event) => {
                debugLog('NFC tag detected!', 'success');
                const message = event.message;
                let urlRecord = null;

                // Iterate through NDEF records to find a URL
                for (const record of message.records) {
                    if (record.recordType === 'url') {
                        // Decode URL record payload
                        const decoder = new TextDecoder();
                        urlRecord = decoder.decode(record.data);
                        debugLog(`Found URL record: ${urlRecord}`, 'info');
                        break;
                    }
                }
                this.onNfcTagScanned(urlRecord); // Pass the URL to the callback
            };

            this.ndefReader.onreadingerror = (event) => {
                debugLog(`NFC reading error: ${event.message}`, 'error');
                this.onNfcError(`NFC reading error: ${event.message}`);
            };

            await this.ndefReader.scan();
            this.isScanning = true;
            debugLog('NFC scanning initiated successfully. Tap a tag to scan.', 'success');
        } catch (error) {
            debugLog(`Error starting NFC scan: ${error.message}`, 'error');
            this.onNfcError(`Failed to start NFC scan: ${error.message}. Ensure permissions are granted.`);
            this.isScanning = false;
        }
    }

    /**
     * Stops scanning for NFC tags.
     */
    stopScanning() {
        // As of current Web NFC API spec, there's no explicit `stop()` method for NDEFReader.
        // Scanning typically stops when the page loses focus or is closed.
        // For persistent scanning, a service worker might be needed in a full PWA.
        debugLog('NFC scanning cannot be explicitly stopped via API once started. It will stop when page loses focus.', 'warning');
        this.isScanning = false;
    }

    /**
     * Writes a URL to an NFC tag.
     * IMPORTANT: This will *not* lock the tag in this prototype, as requested.
     * Tag locking usually requires specific NDEFRecord options or a separate operation.
     * @param {string} url - The URL to write to the NFC tag.
     * @returns {Promise<void>}
     */
    async writeUrl(url) {
        if (!this.isSupported()) {
            debugLog('Web NFC API not supported for writing.', 'error');
            throw new Error('NFC writing not supported on this device.');
        }

        debugLog(`Attempting to write URL to NFC tag: ${url}`);
        try {
            this.ndefWriter = new NDEFWriter();
            await this.ndefWriter.write({
                records: [{ recordType: "url", data: url }]
            }, {
                // Do not set `overwrite: true` or `ignoreRead: true` for blank tags
                // This is a simple write. Locking is typically a separate step or option.
            });
            debugLog('URL successfully written to NFC tag (without locking).', 'success');
        } catch (error) {
            debugLog(`Error writing to NFC tag: ${error.message}`, 'error');
            throw new Error(`Failed to write to NFC tag: ${error.message}. Ensure the tag is writable.`);
        }
    }
}

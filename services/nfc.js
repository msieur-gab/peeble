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
     * @returns {{read: boolean, write: boolean, legacyWrite: boolean}} - An object with read, new write, and legacy write support status.
     */
    isSupported() {
        return {
            read: 'NDEFReader' in window,
            write: 'NDEFWriter' in window,
            // Check for legacy NDEFReader.write() method
            legacyWrite: 'NDEFReader' in window && typeof NDEFReader.prototype.write === 'function'
        };
    }

    /**
     * Starts scanning for NFC tags.
     * @returns {Promise<void>}
     */
    async startScanning() {
        const support = this.isSupported();
        if (!support.read) {
            debugLog('Web NFC API (reading) not supported in this browser.', 'error');
            this.onNfcError('NFC reading not supported on this device.');
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
                debugLog('🔍 NFC TAG DETECTED - Raw Event Analysis:', 'info');
                
                // FIX: Comprehensive event analysis
                debugLog(`   Event type: ${event.type}`, 'info');
                debugLog(`   Event.serialNumber: ${event.serialNumber || 'UNDEFINED'}`, 'info');
                debugLog(`   Event.message: ${event.message ? 'PRESENT' : 'UNDEFINED'}`, 'info');
                
                // FIX: Extract serial number following W3C specification
                let extractedSerial = null;
                if (event.serialNumber) {
                    extractedSerial = event.serialNumber;
                    debugLog(`✅ SERIAL EXTRACTED: ${extractedSerial}`, 'success');
                } else {
                    debugLog(`❌ NO SERIAL: event.serialNumber is undefined`, 'error');
                    // Log all available properties for debugging
                    debugLog(`   Available event properties: ${Object.keys(event).join(', ')}`, 'info');
                }

                const message = event.message;
                let urlRecord = null;

                // FIX: Better URL extraction with debugging
                if (message && message.records) {
                    debugLog(`   Message has ${message.records.length} records`, 'info');
                    
                    // Iterate through NDEF records to find a URL
                    for (let i = 0; i < message.records.length; i++) {
                        const record = message.records[i];
                        debugLog(`   Record ${i}: type=${record.recordType}, dataLength=${record.data ? record.data.byteLength : 'N/A'}`, 'info');
                        
                        if (record.recordType === 'url') {
                            try {
                                // Decode URL record payload
                                const decoder = new TextDecoder();
                                urlRecord = decoder.decode(record.data);
                                debugLog(`✅ URL EXTRACTED: ${urlRecord}`, 'success');
                                break;
                            } catch (error) {
                                debugLog(`❌ URL DECODE ERROR: ${error.message}`, 'error');
                            }
                        }
                    }
                } else {
                    debugLog(`   No message or records found in event`, 'warning');
                }

                // FIX: Always provide a serial, even if we have to generate one
                const finalSerial = extractedSerial || `TEMP-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
                if (!extractedSerial) {
                    debugLog(`⚠️ GENERATED TEMPORARY SERIAL: ${finalSerial}`, 'warning');
                }

                debugLog(`🔍 FINAL SCAN RESULT:`, 'info');
                debugLog(`   Serial: ${finalSerial}`, 'info');
                debugLog(`   URL: ${urlRecord || 'NONE'}`, 'info');

                // Pass both the URL and the serial number to the callback
                this.onNfcTagScanned({ 
                    url: urlRecord, 
                    serial: finalSerial,
                    rawEvent: event // Include raw event for debugging
                });
            };

            this.ndefReader.onreadingerror = (event) => {
                debugLog(`❌ NFC READING ERROR:`, 'error');
                debugLog(`   Error: ${event.error || event.message || 'Unknown error'}`, 'error');
                this.onNfcError(`NFC reading error: ${event.error || event.message || 'Unknown error'}`);
            };

            await this.ndefReader.scan();
            this.isScanning = true;
            debugLog('✅ NFC scanning initiated successfully. Tap a tag to scan.', 'success');
        } catch (error) {
            debugLog(`❌ ERROR STARTING NFC SCAN: ${error.name}: ${error.message}`, 'error');
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
        const support = this.isSupported();
        if (!support.write && !support.legacyWrite) {
            debugLog('Web NFC API (writing) not supported.', 'error');
            throw new Error('NFC writing is not supported on this device.');
        }

        debugLog(`Attempting to write URL to NFC tag: ${url}`);
        try {
            // Prefer the modern NDEFWriter if available
            if (support.write) {
                this.ndefWriter = new NDEFWriter();
                await this.ndefWriter.write({
                    records: [{ recordType: "url", data: url }]
                });
            } else if (support.legacyWrite && this.ndefReader) {
                // Fallback to the legacy NDEFReader.write() method
                await this.ndefReader.write({
                    records: [{ recordType: "url", data: url }]
                });
            } else {
                throw new Error('No supported NFC writing interface available.');
            }
            debugLog('URL successfully written to NFC tag (without locking).', 'success');
        } catch (error) {
            debugLog(`Error writing to NFC tag: ${error.message}`, 'error');
            throw new Error(`Failed to write to NFC tag: ${error.message}. Ensure the tag is writable.`);
        }
    }
}
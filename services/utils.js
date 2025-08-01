// services/utils.js

/**
 * Global debug logging function.
 * Logs messages to both the browser console and the custom debug-console web component.
 * @param {string} message - The message to log.
 * @param {'info'|'success'|'warning'|'error'} [type='info'] - The type of log message.
 */
export function debugLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const emoji = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '📋';
    const logMessage = `[${timestamp}] ${emoji} ${message}`;

    // Always log to browser console
    console.log(logMessage);

    // Dispatch a custom event for the debug-console web component to pick up
    const event = new CustomEvent('debug-log', {
        detail: { message: logMessage, type: type }
    });
    window.dispatchEvent(event);
}

/**
 * Generates a unique message ID.
 * @returns {string} A unique message ID (e.g., PBL-ABC123XYZ).
 */
export function generateMessageId() {
    return 'PBL-' + Math.random().toString(36).substr(2, 8).toUpperCase();
}

/**
 * Utility for parsing and creating Peeble-specific URLs.
 * SECURITY: URLs now only contain messageId and ipfsHash - NO serial number!
 */
export const URLParser = {
    /**
     * Extracts Peeble parameters from the current URL's hash.
     * SECURE: Only returns messageId and ipfsHash - serial comes from NFC scan only
     * @returns {{messageId: string|null, ipfsHash: string|null}}
     */
    getParams() {
        const urlParams = new URLSearchParams(window.location.hash.substring(1));
        return {
            messageId: urlParams.get('messageId'),
            ipfsHash: urlParams.get('ipfsHash')
        };
    },

    /**
     * Creates a secure Peeble URL with only public parameters.
     * SECURITY: Serial number is NEVER included in URLs - only comes from physical NFC scan
     * @param {object} params - The parameters for the URL.
     * @param {string} params.messageId - The message ID.
     * @param {string} params.ipfsHash - The IPFS hash containing encrypted data.
     * @returns {string} The secure Peeble URL (no encryption key exposed).
     */
    createSecureNfcUrl({ messageId, ipfsHash }) {
        const baseUrl = window.location.origin + window.location.pathname;
        const url = `${baseUrl}#messageId=${messageId}&ipfsHash=${ipfsHash}`;
        debugLog(`Generated SECURE NFC URL (no serial): ${url}`);
        return url;
    }
};
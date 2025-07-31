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
 */
export const URLParser = {
    /**
     * Extracts Peeble parameters from the current URL's hash.
     * @returns {{serial: string|null, messageId: string|null, timestamp: string|null}}
     */
    getParams() {
        const urlParams = new URLSearchParams(window.location.hash.substring(1));
        return {
            serial: urlParams.get('serial'),
            messageId: urlParams.get('messageId'),
            timestamp: urlParams.get('timestamp')
        };
    },

    /**
     * Creates a Peeble URL with the given parameters.
     * @param {object} params - The parameters for the URL.
     * @param {string} params.serial - The NFC tag's serial number.
     * @param {string} params.messageId - The message ID.
     * @param {number} params.timestamp - The timestamp.
     * @returns {string} The formatted Peeble URL.
     */
    createNfcUrl({ serial, messageId, timestamp }) {
        // Use a placeholder domain for development. In production, this would be peeble.app
        const baseUrl = window.location.origin + window.location.pathname;
        const url = `${baseUrl}#serial=${serial}&messageId=${messageId}&timestamp=${timestamp}`;
        debugLog(`Generated NFC URL: ${url}`);
        return url;
    }
};

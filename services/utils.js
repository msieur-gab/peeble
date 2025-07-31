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
 * Displays a status message to the user.
 * @param {string} message - The message to display.
 * @param {'info'|'success'|'warning'|'error'} [type='info'] - The type of status message.
 * @param {number} [duration=5000] - How long the message should be displayed in milliseconds.
 */
export function showStatus(message, type = 'info', duration = 5000) {
    const statusDiv = document.getElementById('status');
    if (statusDiv) {
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`; // Apply CSS class for styling

        if (duration > 0) {
            setTimeout(() => {
                // Only clear if the current message is still the one we set
                if (statusDiv.textContent === message) {
                    statusDiv.className = 'status'; // Reset to default style
                    statusDiv.textContent = 'Ready for action'; // Default message
                }
            }, duration);
        }
    } else {
        debugLog(`Status display element not found. Message: ${message}`, 'warning');
    }
}

/**
 * Generates a unique message ID.
 * @returns {string} A unique message ID (e.g., PBL-ABC123XYZ).
 */
export function generateMessageId() {
    return 'PBL-' + Math.random().toString(36).substr(2, 8).toUpperCase();
}

/**
 * Generates a random NFC UUID.
 * @returns {string} A 32-character hexadecimal UUID string.
 */
export function generateNfcUuid() {
    const chars = '0123456789ABCDEF';
    let uuid = '';
    for (let i = 0; i < 32; i++) {
        // Optional: add spaces for readability, but NFC URLs might prefer no spaces
        // if (i > 0 && i % 4 === 0) uuid += '';
        uuid += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return uuid;
}

/**
 * Utility for parsing and creating Peeble-specific URLs.
 */
export const URLParser = {
    /**
     * Extracts Peeble parameters from the current URL's hash.
     * @returns {{uuid: string|null, messageId: string|null, timestamp: string|null}}
     */
    getParams() {
        const urlParams = new URLSearchParams(window.location.hash.substring(1));
        return {
            uuid: urlParams.get('uuid'),
            messageId: urlParams.get('messageId'),
            timestamp: urlParams.get('timestamp')
        };
    },

    /**
     * Creates a Peeble URL with the given parameters.
     * @param {object} params - The parameters for the URL.
     * @param {string} params.uuid - The NFC UUID.
     * @param {string} params.messageId - The message ID.
     * @param {number} params.timestamp - The timestamp.
     * @returns {string} The formatted Peeble URL.
     */
    createNfcUrl({ uuid, messageId, timestamp }) {
        // Use a placeholder domain for development. In production, this would be peeble.app
        const baseUrl = window.location.origin + window.location.pathname;
        const url = `${baseUrl}#uuid=${uuid}&messageId=${messageId}&timestamp=${timestamp}`;
        debugLog(`Generated NFC URL: ${url}`);
        return url;
    }
};

// URL parser utility for handling NFC URL parameters
class URLParser {
    
    // Parse URL parameters from hash
    static parseParams() {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        
        return {
            serial: params.get('serial'), // Use actual tag serial instead of random UUID
            messageId: params.get('messageId'),
            timestamp: params.get('timestamp')
        };
    }

    // Create NFC URL with parameters
    static createNfcUrl(messageData) {
        const { tagSerial, messageId, timestamp } = messageData;
        const baseUrl = window.location.origin + window.location.pathname;
        
        const params = new URLSearchParams();
        params.set('serial', tagSerial); // Use actual tag serial
        params.set('messageId', messageId);
        params.set('timestamp', timestamp.toString());
        
        return `${baseUrl}#${params.toString()}`;
    }

    // Determine app mode based on URL parameters
    static determineMode() {
        const params = this.parseParams();
        
        if (params.serial && params.messageId && params.timestamp) {
            return {
                mode: 'READING',
                params
            };
        } else {
            return {
                mode: 'CREATION',
                params: null
            };
        }
    }

    // Validate URL parameters
    static validateParams(params) {
        const { serial, messageId, timestamp } = params;
        
        const errors = [];
        
        if (!serial || serial.length < 8) {
            errors.push('Invalid tag serial number');
        }
        
        if (!messageId || !messageId.startsWith('PBL-')) {
            errors.push('Invalid Message ID');
        }
        
        if (!timestamp || isNaN(parseInt(timestamp))) {
            errors.push('Invalid timestamp');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    // Extract domain for short URLs (future use)
    static getShortDomain() {
        const hostname = window.location.hostname;
        
        // For localhost development
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return hostname + (window.location.port ? ':' + window.location.port : '');
        }
        
        // For production, could implement pbl.me or similar
        return hostname;
    }

    // Calculate URL length for NFC optimization
    static calculateUrlLength(messageData) {
        const url = this.createNfcUrl(messageData);
        return {
            url,
            length: url.length,
            fits: {
                ntag213: url.length <= 137, // ~180 bytes - NDEF overhead
                ntag215: url.length <= 880, // ~924 bytes - NDEF overhead
                ntag216: url.length <= 8100 // ~8192 bytes - NDEF overhead
            }
        };
    }

    // Update browser URL (for testing)
    static updateBrowserUrl(params) {
        const newHash = new URLSearchParams(params).toString();
        const newUrl = window.location.pathname + '#' + newHash;
        window.history.replaceState(null, '', newUrl);
    }

    // Clear URL parameters
    static clearParams() {
        window.history.replaceState(null, '', window.location.pathname);
    }

    // Get base URL without parameters
    static getBaseUrl() {
        return window.location.origin + window.location.pathname;
    }

    // Check if URL looks like a Peeble URL
    static isPeebleUrl(url) {
        try {
            const urlObj = new URL(url);
            const params = new URLSearchParams(urlObj.hash.substring(1));
            
            return !!(params.get('serial') && 
                     params.get('messageId') && 
                     params.get('timestamp'));
        } catch {
            return false;
        }
    }

    // Extract parameters from any Peeble URL
    static extractFromUrl(url) {
        try {
            const urlObj = new URL(url);
            const hash = urlObj.hash.substring(1);
            const params = new URLSearchParams(hash);
            
            return {
                serial: params.get('serial'),
                messageId: params.get('messageId'),
                timestamp: params.get('timestamp')
            };
        } catch (error) {
            window.debugService.log(`URL parsing failed: ${error.message}`, 'error');
            return null;
        }
    }
}

// Make URLParser globally available
window.URLParser = URLParser;
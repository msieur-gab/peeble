// Debug service for consistent logging across the app
class DebugService {
    constructor() {
        this.panel = null;
        this.maxEntries = 50;
    }

    init() {
        this.panel = document.getElementById('debugPanel');
    }

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const emoji = this.getEmoji(type);
        const logMessage = `[${timestamp}] ${emoji} ${message}`;
        
        // Always log to browser console
        console.log(logMessage);
        
        // Add to debug panel if available
        if (this.panel) {
            const entry = document.createElement('div');
            entry.className = `debug-entry ${type}`;
            entry.textContent = logMessage;
            
            this.panel.appendChild(entry);
            
            // Limit entries to prevent memory issues
            const entries = this.panel.querySelectorAll('.debug-entry');
            if (entries.length > this.maxEntries) {
                entries[0].remove();
            }
            
            // Auto-scroll to bottom
            this.panel.scrollTop = this.panel.scrollHeight;
        }
    }

    getEmoji(type) {
        const emojis = {
            info: '📋',
            success: '✅',
            warning: '⚠️',
            error: '❌',
            nfc: '📱'
        };
        return emojis[type] || '📋';
    }

    clear() {
        if (this.panel) {
            this.panel.innerHTML = '<div class="debug-entry">Debug console cleared...</div>';
        }
        this.log('Debug console cleared');
    }
}

// Create global debug service
window.debugService = new DebugService();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.debugService.init();
});
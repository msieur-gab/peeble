// pwa-manager.js - Simplified PWA Manager

class PWAManager {
    constructor() {
        this.deferredPrompt = null;
        this.init();
    }
    
    async init() {
        await this.registerServiceWorker();
        this.setupInstallPrompt();
        debugLog('✅ PWA Manager initialized', 'success');
    }
    
    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                debugLog('🔧 PWA: Registering service worker...', 'info');
                
                // Use GitHub Pages compatible registration if available
                if (window.GITHUB_PAGES_CONFIG?.registerServiceWorker) {
                    await window.GITHUB_PAGES_CONFIG.registerServiceWorker();
                } else {
                    await navigator.serviceWorker.register('./sw.js', { scope: './' });
                }
                
                debugLog('✅ PWA: Service worker registered', 'success');
            } catch (error) {
                debugLog(`❌ PWA: Service worker failed: ${error.message}`, 'error');
            }
        }
    }
    
    setupInstallPrompt() {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this.showInstallButton();
            debugLog('🔧 PWA: Install prompt ready', 'info');
        });
        
        window.addEventListener('appinstalled', () => {
            debugLog('✅ PWA: App installed!', 'success');
            this.hideInstallButton();
        });
    }
    
    showInstallButton() {
        if (document.getElementById('pwa-install-btn')) return;
        
        const btn = document.createElement('button');
        btn.id = 'pwa-install-btn';
        btn.innerHTML = '📱 Install Peeble App';
        btn.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; z-index: 1000;
            background: #5a67d8; color: white; border: none;
            padding: 12px 20px; border-radius: 25px; cursor: pointer;
            box-shadow: 0 4px 12px rgba(90, 103, 216, 0.3);
            font-size: 14px; font-weight: bold;
        `;
        btn.onclick = () => this.installPWA();
        document.body.appendChild(btn);
    }
    
    hideInstallButton() {
        const btn = document.getElementById('pwa-install-btn');
        if (btn) btn.remove();
    }
    
    async installPWA() {
        if (!this.deferredPrompt) return;
        
        try {
            this.deferredPrompt.prompt();
            const { outcome } = await this.deferredPrompt.userChoice;
            debugLog(`PWA install: ${outcome}`, outcome === 'accepted' ? 'success' : 'info');
            this.deferredPrompt = null;
            this.hideInstallButton();
        } catch (error) {
            debugLog(`PWA install error: ${error.message}`, 'error');
        }
    }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.pwaManager = new PWAManager();
    });
} else {
    window.pwaManager = new PWAManager();
}
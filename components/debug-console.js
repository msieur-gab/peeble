// components/debug-console.js

/**
 * A Web Component for displaying debug logs.
 * It listens for 'debug-log' custom events dispatched globally.
 */
class DebugConsole extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' }); // Use Shadow DOM for encapsulation
        this.logContainer = null; // Will hold the div where logs are appended

        this.render();
        this.addEventListeners();
    }

    /**
     * Renders the initial structure of the debug console.
     * @private
     */
    render() {
        this.shadowRoot.innerHTML = `
            <style>
                /* Styles from style.css, scoped to this component */
                :host {
                    display: block; /* Ensures the custom element behaves like a block */
                }
                div {
                    background: var(--black);
                    color: #e2e8f0;
                    padding: 15px;
                    border-radius: 10px;
                    font-family: monospace;
                    font-size: 0.8em;
                    max-height: 200px;
                    overflow-y: auto;
                }
                .debug-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                    color: var(--white);
                }
                .debug-clear-btn {
                    background: #4a5568;
                    color: white;
                    border: none;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 0.8em;
                    cursor: pointer;
                }
                .debug-log-item {
                    margin-bottom: 4px;
                    word-wrap: break-word; /* Ensure long lines wrap */
                }
                .debug-log-info { color: #e2e8f0; }
                .debug-log-success { color: #9ae6b4; }
                .debug-log-warning { color: #faf089; }
                .debug-log-error { color: #feb2b2; }
            </style>
            <div>
                <div class="debug-header">
                    <strong>🔍 Debug Console</strong>
                    <button class="debug-clear-btn">Clear</button>
                </div>
                <div class="log-container">
                    <div class="debug-log-item debug-log-info">Debug console ready - logs will appear here...</div>
                </div>
            </div>
        `;
        this.logContainer = this.shadowRoot.querySelector('.log-container');
        this.shadowRoot.querySelector('.debug-clear-btn').addEventListener('click', () => this.clearLogs());
    }

    /**
     * Adds event listeners for global debug log events.
     * @private
     */
    addEventListeners() {
        window.addEventListener('debug-log', this.handleDebugLog.bind(this));
    }

    /**
     * Handles a 'debug-log' custom event and appends the message to the console.
     * @param {CustomEvent} event - The custom event containing log details.
     * @private
     */
    handleDebugLog(event) {
        const { message, type } = event.detail;
        const logElement = document.createElement('div');
        logElement.textContent = message;
        logElement.classList.add('debug-log-item', `debug-log-${type}`);
        this.logContainer.appendChild(logElement);
        this.logContainer.scrollTop = this.logContainer.scrollHeight; // Scroll to bottom
    }

    /**
     * Clears all log messages from the console.
     * @public
     */
    clearLogs() {
        this.logContainer.innerHTML = '<div class="debug-log-item debug-log-info">Debug console cleared - logs will appear here...</div>';
        // Optionally, log this action to the browser console
        console.log('[Debug Console] Logs cleared.');
    }
}

customElements.define('debug-console', DebugConsole);

// services/state-manager.js

import { eventBus } from './pubsub.js';
import { debugLog } from './utils.js';

/**
 * A centralized, reactive State Manager for the application.
 * All shared data is stored here, and components are notified of changes
 * via the event bus.
 */
class StateManager {
    constructor() {
        this._state = {
            // Initial state values
            pinataApiKey: localStorage.getItem('pinataApiKey') || '',
            pinataSecret: localStorage.getItem('pinataSecret') || '',
            tagSerial: null,
            appMode: 'CREATOR', // 'CREATOR' or 'READER'
            // Add other global state here
        };
    }

    /**
     * Returns a copy of the current state.
     * @returns {object}
     */
    getState() {
        // Return a new object to prevent direct state mutation
        return { ...this._state };
    }

    /**
     * Updates the state with new values and publishes an event.
     * @param {object} newState - An object containing the state properties to update.
     */
    setState(newState) {
        const previousState = this._state;
        const updatedKeys = [];

        for (const key in newState) {
            if (previousState[key] !== newState[key]) {
                this._state[key] = newState[key];
                updatedKeys.push(key);
            }
        }

        if (updatedKeys.length > 0) {
            debugLog(`State updated for keys: ${updatedKeys.join(', ')}`, 'info');
            eventBus.publish('state-change', {
                ...this._state, // The full new state
                updatedKeys, // Keys that were changed
            });
        }
    }
}

// Export a singleton instance
export const stateManager = new StateManager();
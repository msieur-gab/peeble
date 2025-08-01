// services/pubsub.js

import { debugLog } from './utils.js';

/**
 * A simple, centralized Event Bus (Publish/Subscribe pattern).
 * This class provides a structured way for components to communicate without
 * direct dependencies, replacing the use of global window events.
 */
class EventBus {
    constructor() {
        this.subscribers = {};
    }

    /**
     * Subscribes a callback function to a specific event.
     * @param {string} eventName - The name of the event to subscribe to.
     * @param {function} callback - The function to be called when the event is published.
     * @returns {function} A function to unsubscribe the callback.
     */
    subscribe(eventName, callback) {
        if (!this.subscribers[eventName]) {
            this.subscribers[eventName] = [];
        }
        this.subscribers[eventName].push(callback);
        debugLog(`Component subscribed to event: ${eventName}`);

        // Return an unsubscribe function
        return () => {
            this.subscribers[eventName] = this.subscribers[eventName].filter(
                (sub) => sub !== callback
            );
            debugLog(`Component unsubscribed from event: ${eventName}`);
        };
    }

    /**
     * Publishes an event, notifying all subscribed callbacks.
     * @param {string} eventName - The name of the event to publish.
     * @param {*} data - The data to pass to the subscribed callbacks.
     */
    publish(eventName, data) {
        debugLog(`Event published: ${eventName}`, 'info');
        if (this.subscribers[eventName]) {
            this.subscribers[eventName].forEach((callback) => {
                try {
                    callback(data);
                } catch (error) {
                    debugLog(`Error in subscriber for event '${eventName}': ${error.message}`, 'error');
                }
            });
        }
    }
}

// Export a singleton instance
export const eventBus = new EventBus();
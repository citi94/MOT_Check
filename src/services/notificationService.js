// src/services/notificationService.js

/**
 * Service to handle browser notifications
 */

/**
 * Requests permission to show notifications
 * @returns {Promise<boolean>} - Whether permission was granted
 */
export const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return false;
    }
  
    if (Notification.permission === 'granted') {
      return true;
    }
  
    if (Notification.permission === 'denied') {
      console.warn('Notification permission denied');
      return false;
    }
  
    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  };
  
  /**
   * Shows a notification
   * @param {string} title - The notification title
   * @param {Object} options - Notification options (body, icon, etc.)
   * @returns {boolean} - Whether the notification was shown
   */
  export const showNotification = (title, options = {}) => {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return false;
    }
  
    if (Notification.permission !== 'granted') {
      console.warn('Notification permission not granted');
      return false;
    }
  
    try {
      // Default icon if not provided
      const completeOptions = {
        icon: '/favicon.ico', 
        ...options
      };
      
      const notification = new Notification(title, completeOptions);
      
      // Optional: Add event listeners
      notification.onclick = options.onClick || (() => {
        window.focus();
        notification.close();
      });
      
      return true;
    } catch (error) {
      console.error('Error showing notification:', error);
      return false;
    }
  };
  
  /**
   * Sets up a periodic check for MOT updates
   * @param {string} registration - The vehicle registration to check
   * @param {Function} checkFunction - Function to check for updates
   * @param {number} intervalMs - Interval in milliseconds (default: 30000 - 30 seconds)
   * @returns {number} - The interval ID (for clearing later)
   */
  export const setupPeriodicCheck = (registration, checkFunction, intervalMs = 30000) => {
    console.log(`Setting up periodic checks for ${registration} every ${intervalMs}ms`);
    
    // Immediately check once
    checkFunction(registration);
    
    // Then set up the interval
    return setInterval(() => {
      checkFunction(registration);
    }, intervalMs);
  };
  
  /**
   * Stops periodic checks for a registration
   * @param {number} intervalId - The interval ID to clear
   */
  export const stopPeriodicCheck = (intervalId) => {
    if (intervalId) {
      clearInterval(intervalId);
    }
  };
  
  /**
   * Manages all notification intervals
   */
  class NotificationManager {
    constructor() {
      this.intervals = new Map(); // Map of registration -> intervalId
    }
    
    /**
     * Start monitoring a registration
     * @param {string} registration - The vehicle registration to monitor
     * @param {Function} checkFunction - Function to check for updates
     * @param {number} intervalMs - Interval in milliseconds
     */
    startMonitoring(registration, checkFunction, intervalMs = 30000) {
      // First stop any existing monitoring for this registration
      this.stopMonitoring(registration);
      
      // Start new monitoring
      const intervalId = setupPeriodicCheck(registration, checkFunction, intervalMs);
      this.intervals.set(registration, intervalId);
      
      return intervalId;
    }
    
    /**
     * Stop monitoring a registration
     * @param {string} registration - The vehicle registration to stop monitoring
     */
    stopMonitoring(registration) {
      if (this.intervals.has(registration)) {
        stopPeriodicCheck(this.intervals.get(registration));
        this.intervals.delete(registration);
        return true;
      }
      return false;
    }
    
    /**
     * Check if a registration is being monitored
     * @param {string} registration - The vehicle registration to check
     * @returns {boolean} - Whether the registration is being monitored
     */
    isMonitoring(registration) {
      return this.intervals.has(registration);
    }
    
    /**
     * Stop monitoring all registrations
     */
    stopAll() {
      for (const intervalId of this.intervals.values()) {
        clearInterval(intervalId);
      }
      this.intervals.clear();
    }
  }
  
  // Export a singleton instance
  export const notificationManager = new NotificationManager();
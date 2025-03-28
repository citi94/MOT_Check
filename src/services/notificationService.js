// src/services/notificationService.js

/**
 * Service to handle browser notifications and server-side update checks
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
 * @returns {Notification|null} - The notification object or null if failed
 */
export const showNotification = (title, options = {}) => {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return null;
  }

  if (Notification.permission !== 'granted') {
    console.warn('Notification permission not granted');
    return null;
  }

  try {
    // Default options
    const completeOptions = {
      icon: '/favicon.ico',
      requireInteraction: true,  // Make notification persist until user interaction
      vibrate: [200, 100, 200],  // Vibration pattern for mobile devices
      ...options
    };
    
    const notification = new Notification(title, completeOptions);
    
    // Set up default click handler if not provided
    notification.onclick = options.onClick || function() {
      window.focus();
      notification.close();
    };
    
    return notification;
  } catch (error) {
    console.error('Error showing notification:', error);
    return null;
  }
};

/**
 * Checks for MOT updates for a registration
 * @param {string} registration - Vehicle registration to check
 * @returns {Promise<Object>} - Update information
 */
export const checkForUpdates = async (registration) => {
  if (!registration) return null;
  
  try {
    const formattedReg = registration.replace(/\s+/g, '').toUpperCase();
    
    // Use /api/ path which will be redirected to /.netlify/functions/ by Netlify
    const response = await fetch(`/api/getPendingNotifications?registration=${formattedReg}`, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`No monitoring set up for ${formattedReg}`);
        return null;
      }
      throw new Error(`Error status ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`Got update check response for ${formattedReg}:`, data); // Add detailed logging
    return data;
  } catch (error) {
    console.error(`Error checking for updates for ${registration}:`, error);
    return null;
  }
};

/**
 * Fetches all monitored vehicles
 * @returns {Promise<Array>} - List of monitored vehicles
 */
export const getMonitoredVehicles = async () => {
  try {
    // Use /api/ path which will be redirected to /.netlify/functions/ by Netlify
    const response = await fetch('/api/getMonitoredVehicles', {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Error status ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('Monitored vehicles fetched:', data); // Add logging
    return data.vehicles || [];
  } catch (error) {
    console.error('Error fetching monitored vehicles:', error);
    return [];
  }
};

/**
 * Manages polling for updates
 */
class UpdatePoller {
  constructor() {
    this.intervals = new Map(); // Map of registration -> intervalId
    this.handlers = new Map();  // Map of registration -> callback function
    this.lastCheckedCallbacks = new Map(); // Map of registration -> lastChecked callback
  }
  
  /**
   * Start polling for updates
   * @param {string} registration - Vehicle registration to poll for
   * @param {Function} onUpdate - Callback when an update is found
   * @param {number} intervalSeconds - Polling interval in seconds
   * @param {Function} onPollComplete - Optional callback after every poll (for updating lastChecked)
   */
  startPolling(registration, onUpdate, intervalSeconds = 60, onPollComplete = null) {
    this.stopPolling(registration);
    
    const formattedReg = registration.replace(/\s+/g, '').toUpperCase();
    this.handlers.set(formattedReg, onUpdate);
    if (onPollComplete) {
      this.lastCheckedCallbacks.set(formattedReg, onPollComplete);
    }
    
    const pollFn = async () => {
      console.log(`Polling for updates for ${formattedReg}...`); // Add logging
      const updateInfo = await checkForUpdates(formattedReg);
      
      // Always call onPollComplete if provided, to update the "Last checked" timestamp
      if (onPollComplete && updateInfo) {
        onPollComplete(formattedReg, updateInfo.lastCheckedDate);
      }
      
      if (updateInfo && updateInfo.hasUpdate) {
        console.log(`Update found for ${formattedReg}`, updateInfo);
        if (onUpdate) {
          onUpdate(updateInfo);
        }
      }
    };
    
    // Run immediately
    pollFn();
    
    // Set up interval
    const intervalId = setInterval(pollFn, intervalSeconds * 1000);
    this.intervals.set(formattedReg, intervalId);
    
    console.log(`Started polling for ${formattedReg} every ${intervalSeconds} seconds`); // Add logging
    return intervalId;
  }
  
  /**
   * Stop polling for a registration
   * @param {string} registration - Vehicle registration to stop
   */
  stopPolling(registration) {
    if (!registration) return;
    
    const formattedReg = registration.replace(/\s+/g, '').toUpperCase();
    
    if (this.intervals.has(formattedReg)) {
      clearInterval(this.intervals.get(formattedReg));
      this.intervals.delete(formattedReg);
      this.handlers.delete(formattedReg);
      this.lastCheckedCallbacks.delete(formattedReg);
      console.log(`Stopped polling for ${formattedReg}`); // Add logging
      return true;
    }
    return false;
  }
  
  /**
   * Start polling for multiple registrations
   * @param {Array<string>} registrations - List of registrations
   * @param {Function} onUpdate - Common update handler
   * @param {number} intervalSeconds - Polling interval in seconds
   * @param {Function} onPollComplete - Optional callback after every poll
   */
  startPollingMultiple(registrations, onUpdate, intervalSeconds = 60, onPollComplete = null) {
    if (!registrations || !registrations.length) return;
    
    console.log(`Starting polling for ${registrations.length} registrations every ${intervalSeconds} seconds`); // Add logging
    
    registrations.forEach(reg => {
      this.startPolling(reg, onUpdate, intervalSeconds, onPollComplete);
    });
  }
  
  /**
   * Stop all polling
   */
  stopAll() {
    for (const [reg, intervalId] of this.intervals.entries()) {
      clearInterval(intervalId);
      console.log(`Stopped polling for ${reg}`);
    }
    
    this.intervals.clear();
    this.handlers.clear();
    this.lastCheckedCallbacks.clear();
  }
  
  /**
   * Check if polling is active for a registration
   * @param {string} registration - Vehicle registration
   * @returns {boolean} - Whether polling is active
   */
  isPollingActive(registration) {
    if (!registration) return false;
    
    const formattedReg = registration.replace(/\s+/g, '').toUpperCase();
    return this.intervals.has(formattedReg);
  }
  
  /**
   * Get all registrations currently being polled
   * @returns {Array<string>} - List of registrations
   */
  getActivePolls() {
    return Array.from(this.intervals.keys());
  }
}

// Export a singleton instance
export const updatePoller = new UpdatePoller();
// src/services/pushNotificationService.js

/**
 * Web Push Notification Service for device-specific notifications
 */

// This will be set from environment or config
const VAPID_PUBLIC_KEY = process.env.REACT_APP_VAPID_PUBLIC_KEY || 'BPTmO9gBx6VRdQHnV6dDQyB7_n-et3q7enfT5ef_ZqGT7Dyoq7UTz6L5TxbaBpI7CUGcP-UfyziFoG5tQQoF3FE';

/**
 * Convert VAPID key to Uint8Array
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Check if the browser supports push notifications
 */
export const isPushSupported = () => {
  return 'serviceWorker' in navigator && 
         'PushManager' in window && 
         'Notification' in window &&
         'fetch' in window;
};

/**
 * Check if user is already subscribed to push notifications
 */
export const isUserSubscribed = async () => {
  if (!isPushSupported()) return false;
  
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch (error) {
    console.error('Error checking subscription status:', error);
    return false;
  }
};

/**
 * Get the current push subscription
 */
export const getCurrentSubscription = async () => {
  if (!isPushSupported()) return null;
  
  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch (error) {
    console.error('Error getting current subscription:', error);
    return null;
  }
};

/**
 * Subscribe to push notifications
 */
export const subscribeToPush = async () => {
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported in this browser');
  }

  try {
    // Check current permission state
    let permission = Notification.permission;
    
    // Request permission if not already granted
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    
    if (permission !== 'granted') {
      throw new Error('Notification permission denied');
    }

    // Wait for service worker to be ready
    const registration = await navigator.serviceWorker.ready;
    
    // Check if already subscribed
    let subscription = await registration.pushManager.getSubscription();
    
    if (!subscription) {
      try {
        // Subscribe to push notifications
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
      } catch (subscribeError) {
        console.error('Failed to create push subscription:', subscribeError);
        // Handle potential VAPID key issues
        if (subscribeError.name === 'InvalidStateError') {
          throw new Error('Push messaging is not supported or blocked by this browser');
        } else if (subscribeError.name === 'NotSupportedError') {
          throw new Error('Push messaging is not supported in this browser');
        } else {
          throw new Error(`Failed to create push subscription: ${subscribeError.message}`);
        }
      }
    }

    console.log('Push subscription created:', subscription);
    return subscription;
  } catch (error) {
    console.error('Error subscribing to push notifications:', error);
    throw error;
  }
};

/**
 * Unsubscribe from push notifications
 */
export const unsubscribeFromPush = async () => {
  if (!isPushSupported()) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
      const success = await subscription.unsubscribe();
      console.log('Unsubscribed from push notifications:', success);
      return success;
    }
    
    return true; // Already unsubscribed
  } catch (error) {
    console.error('Error unsubscribing from push notifications:', error);
    return false;
  }
};

/**
 * Send push subscription to server for a specific vehicle registration
 */
export const subscribeToVehicleNotifications = async (registration, pushSubscription) => {
  if (!pushSubscription) {
    throw new Error('No push subscription provided');
  }

  try {
    const response = await fetch('/api/subscribeToPushNotifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        registration: registration,
        subscription: pushSubscription,
        deviceId: generateDeviceId()
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to subscribe to vehicle notifications');
    }

    return await response.json();
  } catch (error) {
    console.error('Error subscribing to vehicle notifications:', error);
    throw error;
  }
};

/**
 * Remove push subscription from server for a specific vehicle registration
 */
export const unsubscribeFromVehicleNotifications = async (registration, pushSubscription) => {
  try {
    const response = await fetch('/api/unsubscribeFromPushNotifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        registration: registration,
        subscription: pushSubscription,
        deviceId: generateDeviceId()
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to unsubscribe from vehicle notifications');
    }

    return await response.json();
  } catch (error) {
    console.error('Error unsubscribing from vehicle notifications:', error);
    throw error;
  }
};

/**
 * Generate a unique device ID for this browser/device
 */
function generateDeviceId() {
  let deviceId = localStorage.getItem('deviceId');
  if (!deviceId) {
    deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('deviceId', deviceId);
  }
  return deviceId;
}

/**
 * Get the device ID for this browser/device
 */
export const getDeviceId = () => {
  return generateDeviceId();
};

/**
 * Test push notification (for debugging)
 */
export const testPushNotification = async () => {
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification('Test Notification', {
      body: 'This is a test notification from your MOT tracker',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      requireInteraction: true,
      vibrate: [200, 100, 200]
    });
  } catch (error) {
    console.error('Error showing test notification:', error);
    throw error;
  }
};
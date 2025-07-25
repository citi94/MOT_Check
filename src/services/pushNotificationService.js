// src/services/pushNotificationService.js

/**
 * Web Push Notification Service for device-specific notifications
 */

// Get VAPID public key from environment variable
const VAPID_PUBLIC_KEY = process.env.REACT_APP_VAPID_PUBLIC_KEY;

// Debug logging for VAPID key availability
console.log('VAPID key debug:', {
  hasKey: !!VAPID_PUBLIC_KEY,
  keyLength: VAPID_PUBLIC_KEY?.length,
  keyPreview: VAPID_PUBLIC_KEY?.substring(0, 10) + '...',
  allEnvVars: Object.keys(process.env).filter(key => key.includes('VAPID'))
});

// Validate VAPID key is available
if (!VAPID_PUBLIC_KEY) {
  console.error('REACT_APP_VAPID_PUBLIC_KEY environment variable is not set');
  console.error('To fix this:');
  console.error('1. Run: node scripts/generateVapidKeys.js');
  console.error('2. Add REACT_APP_VAPID_PUBLIC_KEY=<public_key> to your .env file');
  console.error('3. Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to Netlify environment variables');
}

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
  const hasServiceWorker = 'serviceWorker' in navigator;
  const hasPushManager = 'PushManager' in window;
  const hasNotification = 'Notification' in window;
  const hasFetch = 'fetch' in window;
  
  // Additional iOS-specific checks
  const isStandalone = window.navigator.standalone;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isIOSChrome = /CriOS/.test(navigator.userAgent);
  const isIOSFirefox = /FxiOS/.test(navigator.userAgent);
  const isIOSSafari = isIOS && !isIOSChrome && !isIOSFirefox;
  
  console.log('Detailed push support check:', {
    hasServiceWorker,
    hasPushManager,
    hasNotification,
    hasFetch,
    isStandalone,
    isIOS,
    isIOSChrome,
    isIOSFirefox,
    isIOSSafari,
    userAgent: navigator.userAgent,
    location: window.location.href
  });
  
  // Log specific missing APIs
  if (!hasServiceWorker) console.warn('Missing: serviceWorker API');
  if (!hasPushManager) console.warn('Missing: PushManager API');
  if (!hasNotification) console.warn('Missing: Notification API');
  if (!hasFetch) console.warn('Missing: fetch API');
  
  // iOS Safari specific handling
  if (isIOSSafari) {
    console.log('iOS Safari detected - checking additional requirements');
    
    // iOS Safari requires the app to be added to home screen for push notifications
    // OR to be in a secure context (HTTPS)
    const isSecureContext = window.isSecureContext;
    const isHTTPS = window.location.protocol === 'https:';
    
    console.log('iOS Safari context:', {
      isSecureContext,
      isHTTPS,
      isStandalone
    });
    
    // For iOS Safari, we need basic APIs AND secure context
    const isSupported = hasServiceWorker && hasPushManager && hasNotification && hasFetch && isSecureContext;
    
    console.log('iOS Safari push support result:', isSupported);
    return isSupported;
  }
  
  const isSupported = hasServiceWorker && hasPushManager && hasNotification && hasFetch;
  
  console.log('Push support result:', isSupported);
  return isSupported;
};

/**
 * Check if push notifications are actually ready to use
 */
export const isPushReady = async () => {
  if (!isPushSupported()) {
    console.warn('Push not supported - basic APIs missing');
    return false;
  }
  
  try {
    // Check if service worker is registered
    const registration = await navigator.serviceWorker.ready;
    console.log('Service worker ready:', registration.scope);
    
    // Check push manager
    if (!registration.pushManager) {
      console.warn('Push manager not available on registration');
      return false;
    }
    
    // Check notification permission
    const permission = await Notification.requestPermission();
    console.log('Notification permission:', permission);
    
    return permission === 'granted';
  } catch (error) {
    console.error('Error checking push readiness:', error);
    return false;
  }
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

  if (!VAPID_PUBLIC_KEY) {
    throw new Error('VAPID public key is not configured. Please check your environment variables or contact the administrator.');
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
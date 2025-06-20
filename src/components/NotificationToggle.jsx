import React, { useEffect, useState } from 'react';
import { 
  isPushSupported, 
  isUserSubscribed, 
  subscribeToPush,
  subscribeToVehicleNotifications,
  unsubscribeFromVehicleNotifications,
  getCurrentSubscription,
  getDeviceId 
} from '../services/pushNotificationService';

const NotificationToggle = ({ registration, isEnabled, onToggle }) => {
  const [notificationPermission, setNotificationPermission] = useState('default');
  const [isLoading, setIsLoading] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [deviceSubscribed, setDeviceSubscribed] = useState(false);

  useEffect(() => {
    // Check if push notifications are supported
    setPushSupported(isPushSupported());
    
    // Check notification permission status
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }

    // Check if this device is already subscribed to push notifications
    checkSubscriptionStatus();
  }, []);

  const checkSubscriptionStatus = async () => {
    try {
      const subscribed = await isUserSubscribed();
      setDeviceSubscribed(subscribed);
    } catch (error) {
      console.error('Error checking subscription status:', error);
    }
  };

  const handleToggle = async () => {
    setIsLoading(true);
    
    try {
      if (!isEnabled) {
        // Enabling notifications - subscribe to push notifications
        console.log('Enabling notifications for', registration);
        
        try {
          // Subscribe to push notifications for this device
          const pushSubscription = await subscribeToPush();
          console.log('Got push subscription:', pushSubscription);
          
          // Register this device to receive notifications for this vehicle
          await subscribeToVehicleNotifications(registration, pushSubscription);
          console.log('Successfully subscribed to vehicle notifications');
          
          // Update local state
          setDeviceSubscribed(true);
          setNotificationPermission('granted');
          
          // Call the parent onToggle to update the UI state
          await onToggle(registration, true);
        } catch (subscriptionError) {
          console.error('Failed to set up push notifications:', subscriptionError);
          // Update permission state even if push subscription failed
          if (Notification.permission === 'denied') {
            setNotificationPermission('denied');
          }
          throw new Error(`Failed to enable push notifications: ${subscriptionError.message}`);
        }
        
        // Show confirmation notification
        if ('Notification' in window && Notification.permission === 'granted') {
          setTimeout(() => {
            new Notification('MOT Notifications Enabled', {
              body: `You will now receive notifications on this device for ${registration} when new MOT tests are recorded`,
              icon: '/favicon.ico',
              requireInteraction: false,
              silent: true,
              data: { type: 'confirmation' }
            });
          }, 500);
        }
        
      } else {
        // Disabling notifications - unsubscribe from push notifications
        console.log('Disabling notifications for', registration);
        
        const pushSubscription = await getCurrentSubscription();
        if (pushSubscription) {
          // Unregister this device from receiving notifications for this vehicle
          await unsubscribeFromVehicleNotifications(registration, pushSubscription);
          console.log('Successfully unsubscribed from vehicle notifications');
        }
        
        // Call the parent onToggle to update the UI state
        await onToggle(registration, false);
      }
      
    } catch (error) {
      console.error('Error toggling notification:', error);
      alert(`Failed to ${!isEnabled ? 'enable' : 'disable'} notifications: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // If browser doesn't support push notifications, show message
  if (!pushSupported) {
    return (
      <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
        <p className="text-yellow-800 text-sm">
          Push notifications are not supported in this browser. Please use Chrome, Firefox, Edge, or Safari on a supported device.
        </p>
        <p className="text-yellow-700 text-xs mt-1">
          Note: iOS Safari requires iOS 16.4+ and macOS Safari requires macOS 13+
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-gray-50 rounded-lg border">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Device Push Notifications</h3>
          <p className="text-sm text-gray-600">
            {isEnabled 
              ? `This device will receive push notifications when ${registration} has new MOT test results` 
              : 'Get push notifications on this device when this vehicle has a new MOT test'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Device ID: {getDeviceId().substr(-8)} • {deviceSubscribed ? 'Push enabled' : 'Push disabled'}
          </p>
        </div>

        <button
          onClick={handleToggle}
          disabled={isLoading || (notificationPermission === 'denied' && !isEnabled)}
          className={`
            relative inline-flex h-6 w-11 items-center rounded-full
            ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
            ${isEnabled ? 'bg-blue-600' : 'bg-gray-300'}
            transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
          `}
        >
          <span 
            className={`
              ${isEnabled ? 'translate-x-6' : 'translate-x-1'} 
              inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease
            `}
          />
        </button>
      </div>

      {notificationPermission === 'denied' && (
        <div className="mt-2 text-xs text-red-600">
          Notification permission has been blocked. Please update your browser settings to enable notifications.
        </div>
      )}

      {isEnabled && (
        <div className="mt-2 bg-green-50 border border-green-200 rounded p-2">
          <p className="text-xs text-green-800">
            <span className="font-medium">✅ Active:</span> This device will receive push notifications for {registration} even when your browser is closed.
          </p>
        </div>
      )}
    </div>
  );
};

export default NotificationToggle;
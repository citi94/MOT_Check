import React, { useEffect, useState } from 'react';

const NotificationToggle = ({ registration, isEnabled, onToggle }) => {
  const [notificationPermission, setNotificationPermission] = useState('default');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Check notification permission status
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      alert('This browser does not support notifications');
      return false;
    }
    
    if (Notification.permission === 'granted') {
      return true;
    }
    
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      return permission === 'granted';
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  };

  const handleToggle = async () => {
    setIsLoading(true);
    
    try {
      if (!isEnabled) {
        // Request permission if trying to enable notifications
        const permissionGranted = await requestNotificationPermission();
        if (!permissionGranted) {
          alert('You need to allow notifications to use this feature');
          setIsLoading(false);
          return;
        }
      }
      
      // Call the provided onToggle function (which handles the API call)
      await onToggle(registration, !isEnabled);
      
      // Only show confirmation notification AFTER successful API call
      // and only when enabling notifications
      if (!isEnabled && 'Notification' in window && Notification.permission === 'granted') {
        // Small delay to ensure the API call completed successfully
        setTimeout(() => {
          new Notification('MOT Notifications Enabled', {
            body: `You will now receive notifications for ${registration} when new MOT tests are recorded`,
            icon: '/favicon.ico',
            requireInteraction: false, // Don't require interaction for confirmation
            silent: true // Make confirmation notification silent
          });
        }, 500);
      }
    } catch (error) {
      console.error('Error toggling notification:', error);
      alert(`Failed to ${!isEnabled ? 'enable' : 'disable'} notifications. Please try again.`);
    } finally {
      setIsLoading(false);
    }
  };

  // If browser doesn't support notifications, show message
  if (!('Notification' in window)) {
    return (
      <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
        <p className="text-yellow-800 text-sm">
          Your browser doesn't support notifications. Try using a modern browser like Chrome or Firefox.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-gray-50 rounded-lg border">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">MOT Update Notifications</h3>
          <p className="text-sm text-gray-600">
            {isEnabled 
              ? `You'll be notified when ${registration} has new MOT test results` 
              : 'Get notified when this vehicle has a new MOT test'}
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
    </div>
  );
};

export default NotificationToggle;
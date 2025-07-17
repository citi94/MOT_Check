import React, { useState, useEffect, useCallback, useRef } from 'react';
import Header from './components/Header';
import RegistrationInput from './components/RegistrationInput';
import MOTHistory from './components/MOTHistory';
import NotificationToggle from './components/NotificationToggle';
import { getDeviceId } from './services/pushNotificationService';

const App = () => {
  const [currentReg, setCurrentReg] = useState('');
  const [vehicleData, setVehicleData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [deviceNotifications, setDeviceNotifications] = useState(new Set());
  const [lastChecked, setLastChecked] = useState(null);
  const [lastMotUpdate, setLastMotUpdate] = useState(null);
  
  // Create a ref to store the fetchVehicleData function to avoid dependency cycles
  const fetchVehicleDataRef = useRef(null);
  
  // Handle service worker messages (e.g., when user clicks notification)
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data?.type === 'LOAD_REGISTRATION') {
        const registration = event.data.registration;
        console.log('Loading registration from notification click:', registration);
        if (fetchVehicleDataRef.current) {
          fetchVehicleDataRef.current(registration);
        }
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
    };
  }, []);
  
  // Extract the latest MOT test date from vehicle data
  const getLatestMotTestDate = useCallback((vehicleData) => {
    if (!vehicleData || !vehicleData.motTests || vehicleData.motTests.length === 0) {
      return null;
    }
    
    // Find the latest test by completedDate
    const sortedTests = [...vehicleData.motTests].sort(
      (a, b) => new Date(b.completedDate) - new Date(a.completedDate)
    );
    
    return sortedTests[0].completedDate;
  }, []);
  
  // Define fetchVehicleData early, but we'll refer to it through a ref to avoid dependency cycles
  const fetchVehicleData = async (registration) => {
    if (!registration) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Format registration consistently
      const formattedReg = registration.replace(/\s+/g, '').toUpperCase();
      
      // Add cache-busting query param to avoid stale data
      const timestamp = new Date().getTime();
      const response = await fetch(`/api/getMotHistory?registration=${formattedReg}&_=${timestamp}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      const data = await response.json();
      
      // Check for API error responses
      if (!response.ok) {
        let errorMessage = 'Failed to fetch vehicle data';
        
        if (data.message) {
          errorMessage = data.message;
        } else if (response.status === 404) {
          errorMessage = `No vehicle found with registration ${formattedReg}`;
        } else if (response.status === 401 || response.status === 403) {
          errorMessage = 'Authentication error - please try again later';
        } else if (response.status >= 500) {
          errorMessage = 'Server error - please try again later';
        }
        
        throw new Error(errorMessage);
      }
      
      setVehicleData(data);
      setCurrentReg(formattedReg);
      setLastChecked(new Date());
      
      // Set the last MOT update date
      const latestMotDate = getLatestMotTestDate(data);
      if (latestMotDate) {
        setLastMotUpdate(new Date(latestMotDate));
      }
      
    } catch (err) {
      console.error('Error fetching MOT data:', err);
      setError(err.message || 'An unknown error occurred');
      setVehicleData(null);
    } finally {
      setLoading(false);
    }
  };
  
  // Store the fetchVehicleData function in the ref after it's defined
  fetchVehicleDataRef.current = fetchVehicleData;
  
  // Load device notification subscriptions from localStorage
  useEffect(() => {
    try {
      const savedNotifications = localStorage.getItem(`deviceNotifications_${getDeviceId()}`);
      if (savedNotifications) {
        setDeviceNotifications(new Set(JSON.parse(savedNotifications)));
      }
    } catch (error) {
      console.error('Error loading device notifications:', error);
    }
  }, []);

  // Save device notification subscriptions to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        `deviceNotifications_${getDeviceId()}`, 
        JSON.stringify(Array.from(deviceNotifications))
      );
    } catch (error) {
      console.error('Error saving device notifications:', error);
    }
  }, [deviceNotifications]);
  
  // Handle URL parameters for direct registration loading
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const regParam = urlParams.get('registration');
    if (regParam && fetchVehicleDataRef.current) {
      fetchVehicleDataRef.current(regParam);
    }
  }, []);
  
  // Force refresh data from API
  const refreshData = () => {
    if (currentReg) {
      fetchVehicleData(currentReg);
    }
  };
  
  const toggleNotification = async (registration, enable) => {
    try {
      const formattedReg = registration.replace(/\s+/g, '').toUpperCase();
      
      if (enable) {
        // Add to device notifications
        setDeviceNotifications(prev => new Set([...prev, formattedReg]));
        console.log(`Enabled device notifications for ${formattedReg}`);
      } else {
        // Remove from device notifications
        setDeviceNotifications(prev => {
          const newSet = new Set(prev);
          newSet.delete(formattedReg);
          return newSet;
        });
        console.log(`Disabled device notifications for ${formattedReg}`);
      }
      
    } catch (err) {
      console.error(`Error ${enable ? 'enabling' : 'disabling'} notification:`, err);
      setError(`Failed to ${enable ? 'enable' : 'disable'} notification: ${err.message}`);
    }
  };
  
  const isNotificationEnabled = (registration) => {
    const formattedReg = registration.replace(/\s+/g, '').toUpperCase();
    return deviceNotifications.has(formattedReg);
  };
  

  // Format a date with both date and time
  const formatDateTime = (date) => {
    if (!date) return 'Never';
    
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden">
        <Header />
        
        <div className="p-4">
          <RegistrationInput onSubmit={fetchVehicleData} />
          
          {error && (
            <div className="mt-4 bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm">{error}</p>
                  <p className="mt-1 text-xs text-red-600">
                    Please check the registration and try again. If the problem persists, the MOT API service might be experiencing issues.
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {loading && (
            <div className="flex justify-center items-center mt-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          )}
          
          {vehicleData && !loading && (
            <div className="mt-4">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-lg font-semibold">Vehicle Information</h2>
                <div className="flex items-center">
                  <button 
                    onClick={refreshData}
                    className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 px-2 py-1 rounded flex items-center mr-2"
                  >
                    <svg className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                  </button>
                </div>
              </div>
              
              <div className="text-xs text-gray-500 mb-1">
                Last checked: {formatDateTime(lastChecked)}
              </div>
              
              {lastMotUpdate && (
                <div className="text-xs text-gray-500 mb-2">
                  Last MOT update: {formatDateTime(lastMotUpdate)}
                </div>
              )}
              
              <MOTHistory vehicleData={vehicleData} />
              
              <div className="mt-4 border-t pt-4">
                <NotificationToggle 
                  registration={currentReg}
                  isEnabled={isNotificationEnabled(currentReg)}
                  onToggle={toggleNotification}
                />
                
                {isNotificationEnabled(currentReg) && (
                  <div className="mt-2 bg-blue-50 border border-blue-200 rounded p-2">
                    <p className="text-xs text-blue-800">
                      <span className="font-medium">✅ Background monitoring active:</span> This device will receive push notifications for {currentReg} even when your browser is closed.
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      💡 Tip: Add this page to your home screen for the best experience.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {deviceNotifications.size > 0 && (
            <div className="mt-6 border-t pt-4">
              <h2 className="text-lg font-semibold mb-2">Device Notifications</h2>
              
              <div className="text-xs text-gray-600 mb-2">
                This device ({getDeviceId().substr(-8)}) will receive push notifications for:
              </div>
              
              <ul className="space-y-2">
                {Array.from(deviceNotifications).map(reg => (
                  <li key={reg} className="flex justify-between items-center bg-gray-50 p-2 rounded">
                    <button 
                      onClick={() => fetchVehicleData(reg)}
                      className="text-blue-500 hover:underline"
                    >
                      {reg}
                    </button>
                    <button 
                      onClick={() => toggleNotification(reg, false)}
                      className="text-red-500 text-sm"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              
              <div className="mt-3 p-2 border border-gray-200 rounded bg-green-50">
                <h3 className="text-sm font-medium mb-2">📱 Push Notifications Active</h3>
                <p className="text-xs text-green-700">
                  Your device will receive background notifications even when the browser is closed. 
                  The server checks for MOT updates every hour.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
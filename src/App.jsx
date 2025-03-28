import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import RegistrationInput from './components/RegistrationInput';
import MOTHistory from './components/MOTHistory';
import NotificationToggle from './components/NotificationToggle';
import { requestNotificationPermission, showNotification, updatePoller, getMonitoredVehicles } from './services/notificationService';

const App = () => {
  const [currentReg, setCurrentReg] = useState('');
  const [vehicleData, setVehicleData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notifiedRegs, setNotifiedRegs] = useState([]);
  const [lastChecked, setLastChecked] = useState(null);
  const [pollingInterval, setPollingInterval] = useState(60);
  const [statusMessage, setStatusMessage] = useState('');
  
// Handle updating the last checked timestamp
const handlePollComplete = useCallback((registration, checkTime) => {
  console.log(`Poll completed for ${registration} at ${checkTime}`);
  if (registration === currentReg) {
    console.log(`Updating lastChecked for displayed registration ${currentReg}`);
    setLastChecked(checkTime ? new Date(checkTime) : new Date());
  } else {
    console.log(`Not updating UI - current reg: ${currentReg}, poll reg: ${registration}`);
  }
}, [currentReg]);
  
  // Handle MOT update - defined early since it's used in other hooks
  const handleMotUpdate = useCallback((updateInfo) => {
    // Only handle if there's actually an update
    if (!updateInfo || !updateInfo.hasUpdate) return;
    
    const { registration, details } = updateInfo;
    
    console.log(`MOT update found for ${registration}:`, details);
    
    // If this is the currently displayed vehicle, refresh the data
    if (registration === currentReg) {
      fetchVehicleData(registration);
    }
    
    // Show a notification about the update
    const testResult = details.testResult || 'UNKNOWN';
    const make = details.vehicle?.make || '';
    const model = details.vehicle?.model || '';
    
    const title = `MOT ${testResult === 'PASSED' ? 'Passed ✅' : 'Failed ❌'} - ${registration}`;
    const body = `New MOT test recorded for your ${make} ${model}${testResult === 'PASSED' ? ' - Test passed!' : ' - Test failed!'}`;
    
    showNotification(title, {
      body,
      icon: '/favicon.ico',
      requireInteraction: true,
      vibrate: [200, 100, 200, 100, 200],
      data: { registration },
      onClick: () => {
        fetchVehicleData(registration);
        window.focus();
      }
    });
  }, [currentReg]); // currentReg is needed as dependency
  
  // Set up polling for all registrations
  const setupPollingForRegistrations = useCallback((registrations) => {
    if (!registrations || !registrations.length) return;
    
    // Stop any existing polling
    updatePoller.stopAll();
    
    // Start polling for all registrations with a common update handler
    // Pass handlePollComplete as the 4th parameter to update lastChecked
    updatePoller.startPollingMultiple(
      registrations, 
      handleMotUpdate, 
      pollingInterval,
      handlePollComplete
    );
    
    setStatusMessage(`Checking for updates every ${pollingInterval} seconds`);
  }, [pollingInterval, handleMotUpdate, handlePollComplete]);
  
  // Load monitored registrations from server on initial load
  useEffect(() => {
    const loadRegistrations = async () => {
      try {
        const vehicles = await getMonitoredVehicles();
        if (vehicles && vehicles.length > 0) {
          // Extract registrations from vehicles data
          const registrations = vehicles.map(v => v.registration);
          console.log('Loaded monitored registrations:', registrations);
          setNotifiedRegs(registrations);
          
          // Start polling for updates for each registration
          setupPollingForRegistrations(registrations);
        } else {
          console.warn('No monitored vehicles returned from server, checking localStorage');
          // If no vehicles returned, try to load from localStorage as fallback
          const savedNotifiedRegs = localStorage.getItem('notifiedRegs');
          if (savedNotifiedRegs) {
            const regs = JSON.parse(savedNotifiedRegs);
            setNotifiedRegs(regs);
            setupPollingForRegistrations(regs);
          }
        }
      } catch (err) {
        console.error('Error loading monitored vehicles:', err);
        // Try localStorage as fallback
        const savedNotifiedRegs = localStorage.getItem('notifiedRegs');
        if (savedNotifiedRegs) {
          const regs = JSON.parse(savedNotifiedRegs);
          setNotifiedRegs(regs);
          setupPollingForRegistrations(regs);
        }
      }
    };
    
    loadRegistrations();
    
    // Cleanup on unmount
    return () => {
      updatePoller.stopAll();
    };
  }, [setupPollingForRegistrations]);
  
  // Save notified registrations to localStorage as a backup
  useEffect(() => {
    localStorage.setItem('notifiedRegs', JSON.stringify(notifiedRegs));
  }, [notifiedRegs]);
  
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
    } catch (err) {
      console.error('Error fetching MOT data:', err);
      setError(err.message || 'An unknown error occurred');
      setVehicleData(null);
    } finally {
      setLoading(false);
    }
  };
  
  // Force refresh data from API
  const refreshData = () => {
    if (currentReg) {
      fetchVehicleData(currentReg);
    }
  };
  
  const toggleNotification = async (registration, enable) => {
    try {
      // Check notification permission if enabling
      if (enable) {
        const permissionGranted = await requestNotificationPermission();
        if (!permissionGranted) {
          setError('You need to allow notifications to use this feature');
          return;
        }
      }
      
      const endpoint = enable ? 'enableNotification' : 'disableNotification';
      const response = await fetch(`/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registration })
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status} - ${response.statusText}`);
      }
      
      if (enable) {
        // Add to notified registrations
        if (!notifiedRegs.includes(registration)) {
          const updatedRegs = [...notifiedRegs, registration];
          setNotifiedRegs(updatedRegs);
          
          // Start polling for this registration
          updatePoller.startPolling(
            registration, 
            handleMotUpdate, 
            pollingInterval,
            handlePollComplete
          );
          
          // Show a confirmation notification
          showNotification('MOT Notifications Enabled', {
            body: `You will now receive notifications for ${registration} when new MOT tests are recorded`,
            icon: '/favicon.ico'
          });
        }
      } else {
        // Remove from notified registrations
        setNotifiedRegs(prev => prev.filter(reg => reg !== registration));
        
        // Stop polling for this registration
        updatePoller.stopPolling(registration);
      }
      
    } catch (err) {
      console.error(`Error ${enable ? 'enabling' : 'disabling'} notification:`, err);
      setError(`Failed to ${enable ? 'enable' : 'disable'} notification: ${err.message}`);
    }
  };
  
  const isNotificationEnabled = (registration) => {
    return notifiedRegs.includes(registration);
  };
  
  // Update polling interval when changed
  const updatePollingIntervalHandler = (newInterval) => {
    // Convert to number
    const intervalValue = parseInt(newInterval, 10);
    if (isNaN(intervalValue) || intervalValue < 10) return;
    
    setPollingInterval(intervalValue);
    
    // Restart polling with new interval
    setupPollingForRegistrations(notifiedRegs);
    
    setStatusMessage(`Checking for updates every ${intervalValue} seconds`);
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
              
              {lastChecked && (
                <div className="text-xs text-gray-500 mb-2">
                  Last checked: {lastChecked.toLocaleTimeString()}
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
                      <span className="font-medium">Real-time monitoring:</span> Our server checks for MOT updates every hour
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {notifiedRegs.length > 0 && (
            <div className="mt-6 border-t pt-4">
              <h2 className="text-lg font-semibold mb-2">Monitored Registrations</h2>
              
              {statusMessage && (
                <div className="text-xs text-gray-600 mb-2">
                  {statusMessage}
                </div>
              )}
              
              <ul className="space-y-2">
                {notifiedRegs.map(reg => (
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
              
              <div className="mt-3 p-2 border border-gray-200 rounded bg-gray-50">
                <h3 className="text-sm font-medium mb-2">Client-side update checking</h3>
                <div className="flex items-center">
                  <label htmlFor="polling-interval" className="text-sm mr-2">Check every:</label>
                  <select 
                    id="polling-interval"
                    value={pollingInterval}
                    onChange={(e) => updatePollingIntervalHandler(e.target.value)}
                    className="border rounded text-sm p-1"
                  >
                    <option value="10">10 seconds</option>
                    <option value="30">30 seconds</option>
                    <option value="60">1 minute</option>
                    <option value="120">2 minutes</option>
                    <option value="300">5 minutes</option>
                  </select>
                  
                  <div className="ml-2 text-xs text-gray-500">
                    Server checks every hour
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Client-side checking allows you to get quick updates while this tab is open
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
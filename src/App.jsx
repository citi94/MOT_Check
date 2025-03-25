import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import RegistrationInput from './components/RegistrationInput';
import MOTHistory from './components/MOTHistory';
import NotificationToggle from './components/NotificationToggle';

const App = () => {
  const [currentReg, setCurrentReg] = useState('');
  const [vehicleData, setVehicleData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notifiedRegs, setNotifiedRegs] = useState([]);
  
  // Load saved registrations from localStorage on initial load
  useEffect(() => {
    const savedNotifiedRegs = localStorage.getItem('notifiedRegs');
    if (savedNotifiedRegs) {
      setNotifiedRegs(JSON.parse(savedNotifiedRegs));
    }
  }, []);
  
  // Save notified registrations to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('notifiedRegs', JSON.stringify(notifiedRegs));
  }, [notifiedRegs]);
  
  const fetchVehicleData = async (registration) => {
    if (!registration) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Format registration consistently here too
      const formattedReg = registration.replace(/\s+/g, '').toUpperCase();
      const response = await fetch(`/.netlify/functions/getMotHistory?registration=${formattedReg}`);
      
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
    } catch (err) {
      console.error('Error fetching MOT data:', err);
      setError(err.message || 'An unknown error occurred');
      setVehicleData(null);
    } finally {
      setLoading(false);
    }
  };
  
  const toggleNotification = async (registration, enable) => {
    try {
      const endpoint = enable ? 'enableNotification' : 'disableNotification';
      const response = await fetch(`/.netlify/functions/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registration })
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status} - ${response.statusText}`);
      }
      
      if (enable) {
        setNotifiedRegs(prev => [...prev.filter(reg => reg !== registration), registration]);
      } else {
        setNotifiedRegs(prev => prev.filter(reg => reg !== registration));
      }
      
    } catch (err) {
      console.error(`Error ${enable ? 'enabling' : 'disabling'} notification:`, err);
      setError(`Failed to ${enable ? 'enable' : 'disable'} notification: ${err.message}`);
    }
  };
  
  const isNotificationEnabled = (registration) => {
    return notifiedRegs.includes(registration);
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
              <MOTHistory vehicleData={vehicleData} />
              
              <div className="mt-4 border-t pt-4">
                <NotificationToggle 
                  registration={currentReg}
                  isEnabled={isNotificationEnabled(currentReg)}
                  onToggle={toggleNotification}
                />
              </div>
            </div>
          )}
          
          {notifiedRegs.length > 0 && (
            <div className="mt-6 border-t pt-4">
              <h2 className="text-lg font-semibold mb-2">Monitored Registrations</h2>
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Make sure to export the App component as default
export default App;
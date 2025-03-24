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
      const response = await fetch(`/.netlify/functions/getMotHistory?registration=${registration}`);
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status} - ${response.statusText}`);
      }
      
      const data = await response.json();
      setVehicleData(data);
      setCurrentReg(registration);
    } catch (err) {
      console.error('Error fetching MOT data:', err);
      setError(`Failed to fetch vehicle data: ${err.message}`);
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
              <p>{error}</p>
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

export default App;
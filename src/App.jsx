// Updated fetchVehicleData function with better error handling

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

// Improved error display JSX
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
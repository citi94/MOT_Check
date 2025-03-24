import { useState, useEffect } from 'react';

/**
 * Custom hook to manage MOT API authentication
 * @returns {Object} Authentication state and functions
 */
const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Check if there's a valid token in localStorage
  useEffect(() => {
    const tokenData = localStorage.getItem('motApiToken');
    
    if (tokenData) {
      try {
        const { expiry } = JSON.parse(tokenData);
        
        // Check if token is still valid
        if (expiry && new Date().getTime() < expiry) {
          setIsAuthenticated(true);
        } else {
          // Token expired, remove it
          localStorage.removeItem('motApiToken');
          setIsAuthenticated(false);
        }
      } catch (err) {
        console.error('Error parsing token data:', err);
        localStorage.removeItem('motApiToken');
        setIsAuthenticated(false);
      }
    }
  }, []);
  
  /**
   * Renews the API token
   */
  const renewToken = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/.netlify/functions/renewToken');
      
      if (!response.ok) {
        throw new Error(`Failed to renew token: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        // Calculate expiry time (subtract 5 minutes for safety)
        const expiryTime = new Date().getTime() + ((data.expiresIn - 300) * 1000);
        
        // Store token metadata in localStorage
        localStorage.setItem('motApiToken', JSON.stringify({
          expiry: expiryTime
        }));
        
        setIsAuthenticated(true);
      } else {
        throw new Error(data.message || 'Failed to renew token');
      }
    } catch (err) {
      console.error('Error renewing token:', err);
      setError(err.message);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };
  
  /**
   * Checks if authentication is valid and renews if needed
   */
  const ensureAuthenticated = async () => {
    const tokenData = localStorage.getItem('motApiToken');
    
    if (!tokenData) {
      return renewToken();
    }
    
    try {
      const { expiry } = JSON.parse(tokenData);
      
      // If token expires in less than 5 minutes, renew it
      if (expiry && new Date().getTime() > (expiry - 5 * 60 * 1000)) {
        return renewToken();
      }
      
      // Token is valid
      setIsAuthenticated(true);
    } catch (err) {
      console.error('Error parsing token data:', err);
      return renewToken();
    }
  };
  
  return {
    isAuthenticated,
    isLoading,
    error,
    renewToken,
    ensureAuthenticated
  };
};

export default useAuth;
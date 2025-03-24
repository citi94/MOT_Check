import { useState, useCallback } from 'react';
import { getMotHistory } from '../services/motApi';

/**
 * Custom hook to manage vehicle data
 * @returns {Object} Vehicle data state and functions
 */
const useVehicleData = () => {
  const [vehicleData, setVehicleData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentRegistration, setCurrentRegistration] = useState('');
  
  /**
   * Fetches MOT history for a registration
   * @param {string} registration Vehicle registration
   */
  const fetchVehicleData = useCallback(async (registration) => {
    if (!registration) return;
    
    const formattedReg = registration.replace(/\s+/g, '').toUpperCase();
    
    setLoading(true);
    setError(null);
    
    try {
      const data = await getMotHistory(formattedReg);
      setVehicleData(data);
      setCurrentRegistration(formattedReg);
      
      // Store in local cache
      const cachedVehicles = JSON.parse(localStorage.getItem('cachedVehicles') || '{}');
      cachedVehicles[formattedReg] = {
        data,
        timestamp: new Date().getTime()
      };
      localStorage.setItem('cachedVehicles', JSON.stringify(cachedVehicles));
      
    } catch (err) {
      console.error('Error fetching vehicle data:', err);
      setError(err.message || 'Failed to fetch vehicle data');
      setVehicleData(null);
    } finally {
      setLoading(false);
    }
  }, []);
  
  /**
   * Gets vehicle data from cache if available
   * @param {string} registration Vehicle registration
   * @returns {Object|null} Cached vehicle data or null
   */
  const getCachedVehicleData = useCallback((registration) => {
    if (!registration) return null;
    
    const formattedReg = registration.replace(/\s+/g, '').toUpperCase();
    
    try {
      const cachedVehicles = JSON.parse(localStorage.getItem('cachedVehicles') || '{}');
      const cachedData = cachedVehicles[formattedReg];
      
      if (!cachedData) return null;
      
      // Check if cache is fresh (less than 1 day old)
      const now = new Date().getTime();
      const cacheAge = now - cachedData.timestamp;
      const oneDayMs = 24 * 60 * 60 * 1000;
      
      if (cacheAge > oneDayMs) {
        // Cache is stale
        return null;
      }
      
      return cachedData.data;
    } catch (err) {
      console.error('Error reading from cache:', err);
      return null;
    }
  }, []);
  
  /**
   * Loads vehicle data, using cache if available
   * @param {string} registration Vehicle registration
   * @param {boolean} forceFresh Whether to force fresh data
   */
  const loadVehicleData = useCallback(async (registration, forceFresh = false) => {
    if (!registration) return;
    
    const formattedReg = registration.replace(/\s+/g, '').toUpperCase();
    
    if (!forceFresh) {
      // Try to get from cache first
      const cachedData = getCachedVehicleData(formattedReg);
      
      if (cachedData) {
        setVehicleData(cachedData);
        setCurrentRegistration(formattedReg);
        return;
      }
    }
    
    // Fetch fresh data
    await fetchVehicleData(formattedReg);
  }, [fetchVehicleData, getCachedVehicleData]);
  
  return {
    vehicleData,
    loading,
    error,
    currentRegistration,
    fetchVehicleData,
    loadVehicleData,
    getCachedVehicleData
  };
};

export default useVehicleData;
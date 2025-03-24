// src/services/motApi.js

/**
 * Service to interact with the MOT API via Netlify functions
 */

/**
 * Fetches MOT history for a specific vehicle registration
 * @param {string} registration - The vehicle registration
 * @returns {Promise<Object>} - Vehicle and MOT data
 */
export const getMotHistory = async (registration) => {
    try {
      const response = await fetch(`/.netlify/functions/getMotHistory?registration=${registration}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching MOT history:', error);
      throw error;
    }
  };
  
  /**
   * Enables notifications for a vehicle registration
   * @param {string} registration - The vehicle registration to monitor
   * @returns {Promise<Object>} - Result of the operation
   */
  export const enableNotification = async (registration) => {
    try {
      const response = await fetch('/.netlify/functions/enableNotification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registration })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error enabling notification:', error);
      throw error;
    }
  };
  
  /**
   * Disables notifications for a vehicle registration
   * @param {string} registration - The vehicle registration to stop monitoring
   * @returns {Promise<Object>} - Result of the operation
   */
  export const disableNotification = async (registration) => {
    try {
      const response = await fetch('/.netlify/functions/disableNotification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registration })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error disabling notification:', error);
      throw error;
    }
  };
// netlify/functions/utils/tokenManager.js
const axios = require('axios');

// Environment variables
const TOKEN_URL = process.env.TOKEN_URL;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const SCOPE = process.env.SCOPE;

// Global token cache
let cachedToken = null;
let tokenExpiry = null;
let tokenRenewalInProgress = false;

/**
 * Gets a valid access token with race condition protection
 * @returns {Promise<string>} - Valid access token
 */
async function getAccessToken() {
  // Check if we have a valid token
  const now = Date.now();
  if (cachedToken && tokenExpiry && now < tokenExpiry) {
    return cachedToken;
  }

  // If token renewal is already in progress, wait for it
  if (tokenRenewalInProgress) {
    console.log('Token renewal in progress, waiting...');
    
    // Wait for up to 30 seconds for the renewal to complete
    const maxWait = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (tokenRenewalInProgress && (Date.now() - startTime) < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms
    }
    
    // Check if we now have a valid token
    if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
      return cachedToken;
    }
    
    // If we're still here, the renewal failed or timed out
    throw new Error('Token renewal failed or timed out');
  }

  // Set the renewal flag to prevent concurrent renewals
  tokenRenewalInProgress = true;
  
  try {
    console.log('Requesting new access token...');
    
    // Request new token
    const response = await axios.post(TOKEN_URL, 
      `grant_type=client_credentials&scope=${encodeURIComponent(SCOPE)}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        auth: {
          username: CLIENT_ID,
          password: CLIENT_SECRET
        },
        timeout: 10000 // 10 second timeout
      }
    );

    // Update cache
    cachedToken = response.data.access_token;
    
    // Set expiry to 55 minutes from now (tokens last 60 minutes)
    // Using 55 minutes gives us a 5-minute buffer
    tokenExpiry = now + (55 * 60 * 1000);
    
    console.log('Successfully obtained new access token');
    return cachedToken;
  } catch (error) {
    console.error('Error getting access token:', error.response?.data || error.message);
    throw new Error('Failed to authenticate with MOT API');
  } finally {
    // Always clear the renewal flag
    tokenRenewalInProgress = false;
  }
}

/**
 * Clears the cached token (useful for testing or forced renewal)
 */
function clearTokenCache() {
  cachedToken = null;
  tokenExpiry = null;
  tokenRenewalInProgress = false;
}

module.exports = {
  getAccessToken,
  clearTokenCache
};
// netlify/functions/getMotHistory.js

const axios = require('axios');

// Environment variable validation
function validateEnvironmentVariables() {
  const required = ['TOKEN_URL', 'CLIENT_ID', 'CLIENT_SECRET', 'API_KEY', 'SCOPE'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Validate environment variables on module load
validateEnvironmentVariables();

// Constants for API URLs and credentials
const MOT_API_URL = 'https://history.mot.api.gov.uk';
const TOKEN_URL = process.env.TOKEN_URL;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const API_KEY = process.env.API_KEY;
const SCOPE = process.env.SCOPE;

// Cache for access token
let cachedToken = null;
let tokenExpiry = null;

/**
 * Formats a UK vehicle registration to match the API's expectations
 * @param {string} registration - The raw registration input
 * @returns {string} - Properly formatted registration
 */
function formatRegistration(registration) {
  if (!registration) return '';
  
  // Remove all spaces and convert to uppercase
  return registration.replace(/\s+/g, '').toUpperCase();
}

/**
 * Gets a valid access token, retrieving a new one if necessary
 */
async function getAccessToken() {
  // Check if we have a valid token
  const now = Date.now();
  if (cachedToken && tokenExpiry && now < tokenExpiry) {
    return cachedToken;
  }

  try {
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
        }
      }
    );

    // Update cache
    cachedToken = response.data.access_token;
    
    // Set expiry to 55 minutes from now (tokens last 60 minutes)
    // Using 55 minutes gives us a 5-minute buffer
    tokenExpiry = now + (55 * 60 * 1000);
    
    return cachedToken;
  } catch (error) {
    console.error('Error getting access token:', error.response?.data || error.message);
    throw new Error('Failed to authenticate with MOT API');
  }
}

/**
 * The Netlify Function handler
 */
exports.handler = async function(event, context) {
  // CORS headers for local development
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Handle preflight request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers
    };
  }

  try {
    // Get the registration from query parameters
    const { registration } = event.queryStringParameters || {};
    
    if (!registration) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: true,
          message: 'Registration parameter is required',
          code: 'MISSING_REGISTRATION',
          timestamp: new Date().toISOString()
        })
      };
    }

    // Format the registration for the API
    const formattedRegistration = formatRegistration(registration);
    
    if (!formattedRegistration) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: true,
          message: 'Invalid registration format',
          code: 'INVALID_REGISTRATION_FORMAT',
          timestamp: new Date().toISOString()
        })
      };
    }

    // Get access token
    const token = await getAccessToken();

    // Call MOT API with proper error handling
    try {
      const response = await axios.get(
        `${MOT_API_URL}/v1/trade/vehicles/registration/${formattedRegistration}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-API-Key': API_KEY
          },
          // Add timeout to prevent hanging requests
          timeout: 10000
        }
      );

      // Return the data
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(response.data)
      };
    } catch (apiError) {
      // Handle specific API errors
      console.error(`API error for ${formattedRegistration}:`, 
        apiError.response?.data || apiError.message);
      
      // If this is a 404, the vehicle wasn't found - provide a friendlier message
      if (apiError.response?.status === 404) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({
            error: true,
            message: `No vehicle found with registration ${formattedRegistration}`,
            code: apiError.response?.data?.errorCode || 'VEHICLE_NOT_FOUND',
            timestamp: new Date().toISOString()
          })
        };
      }
      
      // For other API errors, return the details
      if (apiError.response) {
        return {
          statusCode: apiError.response.status,
          headers,
          body: JSON.stringify({
            error: true,
            message: apiError.response.data?.errorMessage || 'Error from MOT API',
            code: apiError.response.data?.errorCode || 'MOT_API_ERROR',
            timestamp: new Date().toISOString(),
            details: {
              requestId: apiError.response.data?.requestId
            }
          })
        };
      }
      
      // If it's a timeout or other connection issue
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: true,
          message: apiError.message || 'Failed to connect to MOT API',
          code: 'CONNECTION_ERROR',
          timestamp: new Date().toISOString()
        })
      };
    }
  } catch (error) {
    console.error('Error in getMotHistory function:', error);
    
    // Handle general errors
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: true,
        message: error.message || 'Internal server error',
        code: 'INTERNAL_SERVER_ERROR',
        timestamp: new Date().toISOString()
      })
    };
  }
};
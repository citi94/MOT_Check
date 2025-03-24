// netlify/functions/getMotHistory.js

const axios = require('axios');

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
          error: 'Missing registration parameter' 
        })
      };
    }

    // Get access token
    const token = await getAccessToken();

    // Call MOT API
    const response = await axios.get(
      `${MOT_API_URL}/v1/trade/vehicles/registration/${registration}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': API_KEY
        }
      }
    );

    // Return the data
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response.data)
    };
  } catch (error) {
    console.error('Error in getMotHistory function:', error);
    
    // Handle API error responses
    if (error.response) {
      const statusCode = error.response.status;
      const errorData = error.response.data;
      
      return {
        statusCode,
        headers,
        body: JSON.stringify({
          error: true,
          message: errorData.errorMessage || 'Error from MOT API',
          code: errorData.errorCode || 'UNKNOWN_ERROR',
          requestId: errorData.requestId
        })
      };
    }

    // Handle other errors
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: true,
        message: error.message || 'Internal server error'
      })
    };
  }
};
// netlify/functions/renewToken.js

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

exports.handler = async function(event, context) {
  // CORS headers
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
    // Request a new token
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

    // Return the token info (but not the token itself, for security)
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        expiresIn: response.data.expires_in,
        tokenType: response.data.token_type
      })
    };
  } catch (error) {
    console.error('Error renewing token:', error.response?.data || error.message);
    
    // Handle API error responses
    if (error.response) {
      const statusCode = error.response.status;
      const errorData = error.response.data;
      
      return {
        statusCode,
        headers,
        body: JSON.stringify({
          error: true,
          message: errorData.error_description || 'Error renewing token',
          code: errorData.error || 'TOKEN_RENEWAL_ERROR',
          timestamp: new Date().toISOString()
        })
      };
    }

    // Handle other errors
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
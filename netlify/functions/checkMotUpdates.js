// netlify/functions/checkMotUpdates.js

const axios = require('axios');
const { connectToDatabase } = require('./utils/mongodb');
const { getAccessToken } = require('./utils/tokenManager');

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

// Token management is now handled by the shared tokenManager utility

/**
 * Fetches MOT history for a given registration
 */
async function getMotHistory(registration) {
  const token = await getAccessToken();

  try {
    const response = await axios.get(
      `${MOT_API_URL}/v1/trade/vehicles/registration/${registration}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': API_KEY
        },
        timeout: 10000 // 10 second timeout
      }
    );
    
    return response.data;
  } catch (error) {
    console.error(`Error fetching MOT history for ${registration}:`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * Gets the latest MOT test date from vehicle data
 */
function getLatestMotTestDate(vehicleData) {
  if (!vehicleData.motTests || vehicleData.motTests.length === 0) {
    return null;
  }
  
  // Find the latest test by completedDate
  return vehicleData.motTests
    .sort((a, b) => new Date(b.completedDate) - new Date(a.completedDate))[0]
    .completedDate;
}

/**
 * The Netlify Function handler
 */
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

    // Format registration
    const formattedReg = registration.replace(/\s+/g, '').toUpperCase();
    
    // Get the notification record from MongoDB
    const db = await connectToDatabase();
    const notificationsCollection = db.collection('notifications');
    
    // Look for a notification with this registration
    const notificationRecord = await notificationsCollection.findOne({ 
      registration: formattedReg 
    });
    
    if (!notificationRecord) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          error: true,
          message: `No notification subscription found for ${formattedReg}`,
          code: 'SUBSCRIPTION_NOT_FOUND',
          timestamp: new Date().toISOString()
        })
      };
    }
    
    // Get the current data
    const lastMotTestDate = notificationRecord.lastMotTestDate;
    
    // Fetch the latest MOT data
    const vehicleData = await getMotHistory(formattedReg);
    const latestMotTestDate = getLatestMotTestDate(vehicleData);
    
    // Determine if there's an update
    let hasUpdate = false;
    if (latestMotTestDate && (!lastMotTestDate || new Date(latestMotTestDate) > new Date(lastMotTestDate))) {
      hasUpdate = true;
    }
    
    // Update the record in MongoDB with the latest check time and MOT test date
    await notificationsCollection.updateOne(
      { registration: formattedReg },
      { 
        $set: {
          lastCheckedDate: new Date().toISOString(),
          lastMotTestDate: latestMotTestDate
        }
      }
    );
    
    // Return the result
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        registration: formattedReg,
        hasUpdate,
        lastMotTestDate: lastMotTestDate,
        latestMotTestDate,
        vehicleData: hasUpdate ? vehicleData : null
      })
    };
  } catch (error) {
    console.error('Error checking MOT updates:', error);
    
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
          code: errorData.errorCode || 'MOT_API_ERROR',
          timestamp: new Date().toISOString(),
          details: {
            requestId: errorData.requestId
          }
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
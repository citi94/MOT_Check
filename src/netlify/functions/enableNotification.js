// netlify/functions/enableNotification.js

const { connectToDatabase } = require('./utils/mongodb');
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

  // Only accept POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse the request body
    const { registration } = JSON.parse(event.body);
    
    if (!registration) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Registration is required' })
      };
    }

    // Format the registration (remove spaces, uppercase)
    const formattedReg = registration.replace(/\s+/g, '').toUpperCase();

    // Connect to MongoDB
    const db = await connectToDatabase();
    const notificationsCollection = db.collection('notifications');
    
    // Check if this registration is already being monitored
    const existingRecord = await notificationsCollection.findOne({ 
      registration: formattedReg 
    });

    // If the registration is already being monitored, just return success
    if (existingRecord) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: `Notifications for ${formattedReg} are already enabled`
        })
      };
    }

    // Fetch the initial MOT history to establish a baseline
    let initialMotTestDate = null;
    let vehicleInfo = {};
    
    try {
      // Get current MOT history from the API
      const vehicleData = await getMotHistory(formattedReg);
      
      // Extract the latest MOT test date (if any)
      initialMotTestDate = getLatestMotTestDate(vehicleData);
      
      // Extract basic vehicle info for reference
      vehicleInfo = {
        make: vehicleData.make || 'Unknown',
        model: vehicleData.model || 'Unknown',
        color: vehicleData.primaryColour || 'Unknown'
      };
      
      console.log(`Initialized ${formattedReg} with baseline MOT date: ${initialMotTestDate || 'None'}`);
    } catch (error) {
      // If we can't fetch the MOT history, continue but log the error
      console.error(`Could not fetch initial MOT history for ${formattedReg}:`, error);
    }

    // Store the registration in the database with baseline MOT date
    await notificationsCollection.insertOne({
      registration: formattedReg,
      lastCheckedDate: new Date().toISOString(),
      lastMotTestDate: initialMotTestDate, // Use the fetched date (or null if not found)
      vehicleInfo: vehicleInfo,  // Store basic vehicle info
      enabled: true,
      createdAt: new Date().toISOString()
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `Notifications enabled for ${formattedReg}`,
        initialState: {
          lastMotTestDate: initialMotTestDate,
          vehicleInfo: vehicleInfo
        }
      })
    };
  } catch (error) {
    console.error('Error enabling notification:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: true,
        message: 'Failed to enable notifications: ' + (error.message || 'Unknown error')
      })
    };
  }
};
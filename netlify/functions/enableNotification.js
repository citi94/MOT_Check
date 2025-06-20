// netlify/functions/enableNotification.js

const { connectToDatabase } = require('./utils/mongodb');
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

// Prevent race conditions in token renewal with a simple lock
let tokenRenewalInProgress = false;

/**
 * Gets a valid access token, retrieving a new one if necessary
 */
async function getAccessToken() {
  // Check if we have a valid token
  const now = Date.now();
  if (cachedToken && tokenExpiry && now < tokenExpiry) {
    return cachedToken;
  }

  // If token renewal is already in progress, wait for it
  if (tokenRenewalInProgress) {
    console.log('Token renewal already in progress, waiting...');
    while (tokenRenewalInProgress) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    // Check again after waiting
    if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
      return cachedToken;
    }
  }

  tokenRenewalInProgress = true;
  
  try {
    console.log('Requesting new MOT API token...');
    
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
    
    console.log('Successfully obtained new MOT API token');
    return cachedToken;
  } catch (error) {
    console.error('Error getting access token:', error.response?.data || error.message);
    throw new Error('Failed to authenticate with MOT API');
  } finally {
    tokenRenewalInProgress = false;
  }
}

/**
 * Fetches MOT history for a given registration
 */
async function getMotHistory(registration) {
  const token = await getAccessToken();

  try {
    console.log(`Fetching MOT history for ${registration}`); // Add logging
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
    
    console.log(`Successfully fetched MOT history for ${registration}`); // Add logging
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
  if (!vehicleData || !vehicleData.motTests || vehicleData.motTests.length === 0) {
    console.log('No MOT tests found in vehicle data'); // Add logging
    return null;
  }
  
  // Find the latest test by completedDate
  const sortedTests = vehicleData.motTests.sort((a, b) => new Date(b.completedDate) - new Date(a.completedDate));
  const latestTest = sortedTests[0];
  const date = latestTest.completedDate;
  
  console.log(`Latest MOT test date found: ${date}`); // Add logging
  return date;
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
      body: JSON.stringify({
        error: true,
        message: 'Method not allowed',
        code: 'METHOD_NOT_ALLOWED',
        timestamp: new Date().toISOString()
      })
    };
  }

  try {
    // Parse the request body
    let registration;
    try {
      const body = JSON.parse(event.body);
      registration = body.registration;
    } catch (parseError) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: true,
          message: 'Invalid JSON in request body',
          code: 'INVALID_JSON',
          timestamp: new Date().toISOString()
        })
      };
    }
    
    if (!registration) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: true,
          message: 'Registration is required',
          code: 'MISSING_REGISTRATION',
          timestamp: new Date().toISOString()
        })
      };
    }

    // Format the registration (remove spaces, uppercase)
    const formattedReg = registration.replace(/\s+/g, '').toUpperCase();
    console.log(`Enabling notifications for ${formattedReg}`); // Add logging

    // Connect to MongoDB
    const db = await connectToDatabase();
    const notificationsCollection = db.collection('notifications');
    
    // Check if this registration is already being monitored
    const existingRecord = await notificationsCollection.findOne({ 
      registration: formattedReg 
    });

    // If the registration is already being monitored, just return success
    if (existingRecord) {
      console.log(`Notifications for ${formattedReg} are already enabled`); // Add logging
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
    let motTests = [];
    
    try {
      // Get current MOT history from the API
      const vehicleData = await getMotHistory(formattedReg);
      
      // Extract the latest MOT test date (if any)
      initialMotTestDate = getLatestMotTestDate(vehicleData);
      
      // Store the MOT tests array if it exists
      motTests = vehicleData.motTests || [];
      
      // Extract basic vehicle info for reference
      vehicleInfo = {
        make: vehicleData.make || 'Unknown',
        model: vehicleData.model || 'Unknown',
        color: vehicleData.primaryColour || 'Unknown'
      };
      
      console.log(`Initialized ${formattedReg} with baseline MOT date: ${initialMotTestDate || 'None'}`);
    } catch (error) {
      console.error(`Could not fetch initial MOT history for ${formattedReg}:`, error);
      // Continue with null initialMotTestDate if we can't fetch the data
    }

    // Store the registration in the database with baseline MOT date
    const record = {
      registration: formattedReg,
      lastCheckedDate: new Date().toISOString(),
      lastMotTestDate: initialMotTestDate, // Use the fetched date (or null if not found)
      vehicleInfo: vehicleInfo,  // Store basic vehicle info
      motTests: motTests, // Store the actual MOT tests
      enabled: true,
      createdAt: new Date().toISOString()
    };
    
    console.log(`Storing notification record for ${formattedReg}:`, record); // Add logging
    
    await notificationsCollection.insertOne(record);

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
        message: 'Failed to enable notifications: ' + (error.message || 'Unknown error'),
        code: 'INTERNAL_SERVER_ERROR',
        timestamp: new Date().toISOString()
      })
    };
  }
};
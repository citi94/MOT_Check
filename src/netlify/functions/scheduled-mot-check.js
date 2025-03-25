// netlify/functions/scheduled-mot-check.js
const { schedule } = require('@netlify/functions');
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

/**
 * Gets the latest MOT test result from vehicle data
 */
function getLatestMotTestResult(vehicleData) {
  if (!vehicleData.motTests || vehicleData.motTests.length === 0) {
    return null;
  }
  
  // Find the latest test by completedDate
  return vehicleData.motTests
    .sort((a, b) => new Date(b.completedDate) - new Date(a.completedDate))[0];
}

/**
 * Netlify scheduled function handler
 */
const handler = async (event) => {
  try {
    console.log('Starting scheduled MOT check');
    
    // Connect to MongoDB
    const db = await connectToDatabase();
    const collection = db.collection('notifications');
    
    // Get all active registrations
    const registrations = await collection.find({ enabled: true }).toArray();
    console.log(`Found ${registrations.length} active registrations to check`);
    
    // Keep track of results
    const results = {
      total: registrations.length,
      checked: 0,
      updated: 0,
      errors: 0
    };
    
    // Process in batches to avoid rate limits (5 at a time)
    const batchSize = 5;
    
    for (let i = 0; i < registrations.length; i += batchSize) {
      const batch = registrations.slice(i, i + batchSize);
      
      // Process each batch concurrently
      await Promise.all(batch.map(async (reg) => {
        try {
          console.log(`Checking ${reg.registration}`);
          results.checked++;
          
          const vehicleData = await getMotHistory(reg.registration);
          const latestMotTest = getLatestMotTestResult(vehicleData);
          const latestMotTestDate = latestMotTest ? latestMotTest.completedDate : null;
          
          // Get the current stored MOT test date
          const lastMotTestDate = reg.lastMotTestDate;
          
          console.log(`Registration: ${reg.registration}`);
          console.log(`Last MOT test date in DB: ${lastMotTestDate || 'None'}`);
          console.log(`Latest MOT test date from API: ${latestMotTestDate || 'None'}`);
          
          // Determine if there's an update
          if (latestMotTestDate && (!lastMotTestDate || new Date(latestMotTestDate) > new Date(lastMotTestDate))) {
            console.log(`Update detected for ${reg.registration}!`);
            results.updated++;
            
            // Get test result details
            const testResult = latestMotTest ? latestMotTest.testResult : null;
            const expiryDate = latestMotTest ? latestMotTest.expiryDate : null;
            const defects = latestMotTest && latestMotTest.defects ? latestMotTest.defects : [];
            
            // Update the database record with new test data
            await collection.updateOne(
              { registration: reg.registration },
              { 
                $set: { 
                  lastMotTestDate: latestMotTestDate,
                  lastCheckedDate: new Date().toISOString(),
                  hasUpdate: true, 
                  updateDetectedAt: new Date().toISOString(),
                  updateDetails: {
                    previousDate: lastMotTestDate,
                    newDate: latestMotTestDate,
                    testResult: testResult,
                    expiryDate: expiryDate,
                    defects: defects,
                    vehicle: {
                      make: vehicleData.make,
                      model: vehicleData.model,
                      registration: vehicleData.registration,
                      color: vehicleData.primaryColour
                    }
                  }
                }
              }
            );
          } else {
            // Just update the last checked time
            await collection.updateOne(
              { registration: reg.registration },
              { 
                $set: { 
                  lastCheckedDate: new Date().toISOString()
                }
              }
            );
          }
        } catch (error) {
          console.error(`Error checking ${reg.registration}:`, error);
          results.errors++;
        }
      }));
      
      // Add a small delay between batches to avoid rate limiting
      if (i + batchSize < registrations.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log('Scheduled check completed', results);
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Scheduled check completed',
        results: results
      }),
    };
  } catch (error) {
    console.error('Error in scheduled check:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to run scheduled check' }),
    };
  }
};

// Run every minute for near real-time updates
// Note: Netlify may not support sub-minute frequency, so we're using 1 minute
module.exports.handler = schedule('* * * * *', handler);
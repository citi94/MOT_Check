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
        }
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
  }
}

/**
 * Fetches MOT history for a given registration
 */
async function getMotHistory(registration) {
  const token = await getAccessToken();

  try {
    console.log(`Fetching MOT history for ${registration}`);
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
    
    console.log(`Successfully fetched MOT history for ${registration}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching MOT history for ${registration}:`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * Gets the latest MOT test from vehicle data
 */
function getLatestMotTest(vehicleData) {
  if (!vehicleData || !vehicleData.motTests || vehicleData.motTests.length === 0) {
    console.log('No MOT tests found in vehicle data');
    return null;
  }
  
  // Find the latest test by completedDate
  const sortedTests = vehicleData.motTests.sort(
    (a, b) => new Date(b.completedDate) - new Date(a.completedDate)
  );
  
  console.log(`Found ${sortedTests.length} MOT tests, latest date: ${sortedTests[0].completedDate}`);
  return sortedTests[0];
}

/**
 * Netlify scheduled function handler
 */
const handler = async (event) => {
  try {
    console.log('Starting scheduled MOT check:', new Date().toISOString());
    
    // Connect to MongoDB
    const db = await connectToDatabase();
    const collection = db.collection('notifications');
    
    // Get all active registrations
    const registrations = await collection.find({ enabled: true }).toArray();
    console.log(`Found ${registrations.length} active registrations to check`);
    
    if (registrations.length === 0) {
      console.log('No registrations to check, exiting');
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          message: 'No registrations to check',
          timestamp: new Date().toISOString()
        }),
      };
    }
    
    // Keep track of results
    const results = {
      total: registrations.length,
      checked: 0,
      updated: 0,
      errors: 0
    };
    
    // Process in batches to avoid rate limits (3 at a time)
    const batchSize = 3;
    
    for (let i = 0; i < registrations.length; i += batchSize) {
      const batch = registrations.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(registrations.length/batchSize)}`);
      
      // Process each batch sequentially to avoid rate limits
      for (const reg of batch) {
        try {
          results.checked++;
          console.log(`[${results.checked}/${registrations.length}] Checking ${reg.registration}`);
          
          // Fetch the latest MOT data
          const vehicleData = await getMotHistory(reg.registration);
          const latestMotTest = getLatestMotTest(vehicleData);
          
          if (!latestMotTest) {
            console.log(`No MOT tests found for ${reg.registration}`);
            
            // Still update the last checked time even if no MOT tests found
            await collection.updateOne(
              { registration: reg.registration },
              { 
                $set: { 
                  lastCheckedDate: new Date().toISOString()
                }
              }
            );
            
            continue;
          }
          
          const latestMotTestDate = latestMotTest.completedDate;
          
          // Get the current stored MOT test date
          const lastMotTestDate = reg.lastMotTestDate;
          
          console.log(`Registration: ${reg.registration}`);
          console.log(`Last MOT test date in DB: ${lastMotTestDate || 'None'}`);
          console.log(`Latest MOT test date from API: ${latestMotTestDate || 'None'}`);
          
          // Determine if there's an update - handle the case where lastMotTestDate could be null
          let hasUpdate = false;
          
          if (latestMotTestDate) {
            if (!lastMotTestDate) {
              hasUpdate = true;
              console.log(`First MOT test detected for ${reg.registration}`);
            } else {
              // Convert dates to timestamps for accurate comparison
              const lastTestTime = new Date(lastMotTestDate).getTime();
              const latestTestTime = new Date(latestMotTestDate).getTime();
              
              if (latestTestTime > lastTestTime) {
                hasUpdate = true;
                console.log(`New MOT test detected for ${reg.registration}`);
              } else {
                console.log(`No new MOT tests for ${reg.registration}`);
              }
            }
          }
          
          if (hasUpdate) {
            console.log(`Update detected for ${reg.registration}!`);
            results.updated++;
            
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
                    testResult: latestMotTest.testResult,
                    expiryDate: latestMotTest.expiryDate,
                    defects: latestMotTest.defects || [],
                    vehicle: {
                      make: vehicleData.make || 'Unknown',
                      model: vehicleData.model || 'Unknown',
                      registration: vehicleData.registration,
                      color: vehicleData.primaryColour || 'Unknown'
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
          
          // Still update the last checked time even if there was an error
          try {
            await collection.updateOne(
              { registration: reg.registration },
              { 
                $set: { 
                  lastCheckedDate: new Date().toISOString(),
                  lastCheckError: error.message || 'Unknown error'
                }
              }
            );
          } catch (dbError) {
            console.error(`Failed to update last checked time for ${reg.registration}:`, dbError);
          }
        }
      }
      
      // Add a small delay between batches to avoid rate limiting
      if (i + batchSize < registrations.length) {
        const delay = 3000; // 3 seconds
        console.log(`Waiting ${delay}ms before next batch`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    console.log('Scheduled check completed:', results);
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Scheduled check completed',
        results: results,
        timestamp: new Date().toISOString()
      }),
    };
  } catch (error) {
    console.error('Error in scheduled check:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to run scheduled check',
        message: error.message,
        timestamp: new Date().toISOString()
      }),
    };
  }
};

// Run once per hour (Netlify's minimum frequency)
module.exports.handler = schedule('@hourly', handler);
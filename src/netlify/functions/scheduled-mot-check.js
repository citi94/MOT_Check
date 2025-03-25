// netlify/functions/scheduled-mot-check.js
const { schedule } = require('@netlify/functions');
const { connectToDatabase } = require('./utils/mongodb');
const axios = require('axios');

// Same token and API access code as your other functions...

const handler = async (event) => {
  try {
    // Connect to MongoDB
    const db = await connectToDatabase();
    const collection = db.collection('notifications');
    
    // Get all active registrations
    const registrations = await collection.find({ enabled: true }).toArray();
    
    for (const reg of registrations) {
      // Check each registration for updates
      try {
        const vehicleData = await getMotHistory(reg.registration);
        const latestMotTestDate = getLatestMotTestDate(vehicleData);
        
        if (latestMotTestDate && (!reg.lastMotTestDate || new Date(latestMotTestDate) > new Date(reg.lastMotTestDate))) {
          // Update the database record
          await collection.updateOne(
            { registration: reg.registration },
            { $set: { lastMotTestDate: latestMotTestDate } }
          );
          
          // Store this update to be retrieved by the client
          await collection.updateOne(
            { registration: reg.registration },
            { $set: { hasUpdate: true, updateDetectedAt: new Date().toISOString() } }
          );
        }
      } catch (error) {
        console.error(`Error checking ${reg.registration}:`, error);
      }
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Scheduled check completed' }),
    };
  } catch (error) {
    console.error('Error in scheduled check:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to run scheduled check' }),
    };
  }
};

// Run every hour
module.exports.handler = schedule('0 * * * *', handler);
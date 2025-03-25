// netlify/functions/getMonitoredVehicles.js
const { connectToDatabase } = require('./utils/mongodb');

exports.handler = async (event) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  };

  // Handle preflight request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers
    };
  }
  
  try {
    const db = await connectToDatabase();
    const collection = db.collection('notifications');
    
    // Get all monitored vehicles
    const records = await collection.find(
      { enabled: true },
      { 
        projection: {
          registration: 1,
          lastCheckedDate: 1,
          lastMotTestDate: 1,
          hasUpdate: 1,
          createdAt: 1
        }
      }
    ).toArray();
    
    // Format the response
    const vehicles = records.map(record => ({
      registration: record.registration,
      lastCheckedDate: record.lastCheckedDate,
      lastMotTestDate: record.lastMotTestDate,
      hasUpdate: !!record.hasUpdate,
      createdAt: record.createdAt
    }));
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        vehicles,
        count: vehicles.length
      })
    };
  } catch (error) {
    console.error('Error getting monitored vehicles:', error);
    
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
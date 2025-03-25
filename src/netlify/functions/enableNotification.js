// netlify/functions/enableNotification.js

const { connectToDatabase } = require('./utils/mongodb');

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

    // Store the registration in the database
    await notificationsCollection.insertOne({
      registration: formattedReg,
      lastCheckedDate: new Date().toISOString(),
      lastMotTestDate: null,
      enabled: true,
      createdAt: new Date().toISOString()
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `Notifications enabled for ${formattedReg}`
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
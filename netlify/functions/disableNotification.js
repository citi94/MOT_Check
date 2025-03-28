// netlify/functions/disableNotification.js

const { connectToDatabase } = require('../../src/netlify/functions/utils/mongodb');

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
    
    // Try to find and delete the notification
    const result = await notificationsCollection.deleteOne({ 
      registration: formattedReg 
    });
    
    // Check if a document was actually deleted
    if (result.deletedCount === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          error: true,
          message: `No notifications found for ${formattedReg}`
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `Notifications disabled for ${formattedReg}`
      })
    };
  } catch (error) {
    console.error('Error disabling notification:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: true,
        message: 'Failed to disable notifications: ' + (error.message || 'Unknown error')
      })
    };
  }
};
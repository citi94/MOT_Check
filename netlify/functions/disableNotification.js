// netlify/functions/disableNotification.js

const { connectToDatabase } = require('./utils/mongodb');

// Environment variable validation
function validateEnvironmentVariables() {
  const required = ['MONGODB_URI', 'MONGODB_DB_NAME'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Validate environment variables on module load
validateEnvironmentVariables();

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
          message: `No notifications found for ${formattedReg}`,
          code: 'NOTIFICATION_NOT_FOUND',
          timestamp: new Date().toISOString()
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
        message: 'Failed to disable notifications: ' + (error.message || 'Unknown error'),
        code: 'INTERNAL_SERVER_ERROR',
        timestamp: new Date().toISOString()
      })
    };
  }
};
// netlify/functions/unsubscribeFromPushNotifications.js

const { connectToDatabase } = require('./utils/mongodb');

// Environment variable validation
function validateEnvironmentVariables() {
  const required = ['MONGODB_URI'];
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
    let registration, subscription, deviceId;
    try {
      const body = JSON.parse(event.body);
      registration = body.registration;
      subscription = body.subscription;
      deviceId = body.deviceId;
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

    if (!deviceId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: true,
          message: 'Device ID is required',
          code: 'MISSING_DEVICE_ID',
          timestamp: new Date().toISOString()
        })
      };
    }

    // Format the registration (remove spaces, uppercase)
    const formattedReg = registration.replace(/\s+/g, '').toUpperCase();
    console.log(`Unsubscribing device ${deviceId} from push notifications for ${formattedReg}`);

    // Connect to MongoDB
    const db = await connectToDatabase();
    const subscriptionsCollection = db.collection('push_subscriptions');
    
    // Remove the subscription for this device+registration combination
    const result = await subscriptionsCollection.deleteOne({
      registration: formattedReg,
      deviceId: deviceId
    });

    if (result.deletedCount === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          error: true,
          message: `No subscription found for ${formattedReg} on this device`,
          code: 'SUBSCRIPTION_NOT_FOUND',
          timestamp: new Date().toISOString()
        })
      };
    }

    console.log(`Successfully unsubscribed device ${deviceId} from notifications for ${formattedReg}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `Successfully unsubscribed from notifications for ${formattedReg}`,
        deviceId: deviceId,
        registration: formattedReg
      })
    };
  } catch (error) {
    console.error('Error unsubscribing from push notifications:', error);
    
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
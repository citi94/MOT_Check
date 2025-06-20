// netlify/functions/subscribeToPushNotifications.js

const webpush = require('web-push');
const { connectToDatabase } = require('./utils/mongodb');

// Environment variable validation
function validateEnvironmentVariables() {
  const required = ['MONGODB_URI', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_MAILTO'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Validate environment variables on module load
validateEnvironmentVariables();

// Configure web-push with VAPID credentials
webpush.setVapidDetails(
  process.env.VAPID_MAILTO,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

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

    if (!subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: true,
          message: 'Valid push subscription with endpoint and keys is required',
          code: 'INVALID_SUBSCRIPTION',
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
    console.log(`Subscribing device ${deviceId} to push notifications for ${formattedReg}`);

    // Connect to MongoDB
    const db = await connectToDatabase();
    const subscriptionsCollection = db.collection('push_subscriptions');
    
    // Ensure indexes exist for better performance and data integrity
    try {
      await subscriptionsCollection.createIndex(
        { registration: 1, deviceId: 1 }, 
        { unique: true, background: true }
      );
      await subscriptionsCollection.createIndex(
        { subscribedAt: 1 }, 
        { background: true }
      );
    } catch (indexError) {
      console.warn('Index creation warning (may already exist):', indexError.message);
    }
    
    // Create a unique subscription record
    const subscriptionRecord = {
      registration: formattedReg,
      deviceId: deviceId,
      subscription: {
        endpoint: subscription.endpoint,
        keys: subscription.keys
      },
      subscribedAt: new Date().toISOString(),
      lastNotifiedAt: null,
      active: true,
      userAgent: event.headers['user-agent'] || 'Unknown',
      ipAddress: event.headers['x-forwarded-for'] || 'Unknown'
    };

    // Use upsert to replace existing subscription for this device+registration combination
    await subscriptionsCollection.replaceOne(
      { 
        registration: formattedReg,
        deviceId: deviceId
      },
      subscriptionRecord,
      { upsert: true }
    );

    console.log(`Successfully subscribed device ${deviceId} to notifications for ${formattedReg}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `Successfully subscribed to notifications for ${formattedReg}`,
        deviceId: deviceId,
        registration: formattedReg
      })
    };
  } catch (error) {
    console.error('Error subscribing to push notifications:', error);
    
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
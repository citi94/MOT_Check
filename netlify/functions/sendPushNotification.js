// netlify/functions/sendPushNotification.js

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

/**
 * Send push notification to specific devices subscribed to a registration
 */
async function sendPushNotificationToDevices(registration, notificationData) {
  try {
    const db = await connectToDatabase();
    const subscriptionsCollection = db.collection('push_subscriptions');
    
    // Get all active subscriptions for this registration with validation
    const subscriptions = await subscriptionsCollection.find({
      $and: [
        { registration: registration },
        { $or: [{ active: true }, { active: { $exists: false } }] }, // Default active if field missing
        { 'subscription.endpoint': { $exists: true, $ne: null, $ne: '' } },
        { 'subscription.keys.p256dh': { $exists: true, $ne: null, $ne: '' } },
        { 'subscription.keys.auth': { $exists: true, $ne: null, $ne: '' } }
      ]
    }).toArray();

    console.log(`Found ${subscriptions.length} active subscriptions for ${registration}`);

    if (subscriptions.length === 0) {
      console.log(`No active subscriptions found for ${registration}`);
      return { sent: 0, failed: 0 };
    }

    const results = {
      sent: 0,
      failed: 0,
      errors: []
    };

    // Send notification to each subscribed device
    for (const sub of subscriptions) {
      try {
        const pushSubscription = {
          endpoint: sub.subscription.endpoint,
          keys: sub.subscription.keys
        };

        console.log(`Sending push notification to device ${sub.deviceId} for ${registration}`);

        await webpush.sendNotification(
          pushSubscription,
          JSON.stringify(notificationData),
          {
            TTL: 3600, // 1 hour TTL
            urgency: 'high'
          }
        );

        results.sent++;

        // Update last notified timestamp
        await subscriptionsCollection.updateOne(
          { _id: sub._id },
          { $set: { lastNotifiedAt: new Date().toISOString() } }
        );

        console.log(`Successfully sent push notification to device ${sub.deviceId}`);

      } catch (pushError) {
        console.error(`Failed to send push notification to device ${sub.deviceId}:`, pushError);
        results.failed++;
        results.errors.push({
          deviceId: sub.deviceId,
          error: pushError.message
        });

        // If subscription is invalid, mark it as inactive
        if (pushError.statusCode === 410 || pushError.statusCode === 404) {
          console.log(`Marking subscription as inactive for device ${sub.deviceId} (invalid endpoint)`);
          await subscriptionsCollection.updateOne(
            { _id: sub._id },
            { $set: { active: false, deactivatedAt: new Date().toISOString() } }
          );
        }
      }
    }

    console.log(`Push notification results for ${registration}: ${results.sent} sent, ${results.failed} failed`);
    return results;

  } catch (error) {
    console.error('Error sending push notifications:', error);
    throw error;
  }
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
    let registration, notificationData;
    try {
      const body = JSON.parse(event.body);
      registration = body.registration;
      notificationData = body.notificationData;
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

    if (!notificationData) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: true,
          message: 'Notification data is required',
          code: 'MISSING_NOTIFICATION_DATA',
          timestamp: new Date().toISOString()
        })
      };
    }

    // Format the registration (remove spaces, uppercase)
    const formattedReg = registration.replace(/\s+/g, '').toUpperCase();

    // Send push notifications to all subscribed devices
    const results = await sendPushNotificationToDevices(formattedReg, notificationData);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        registration: formattedReg,
        results: results
      })
    };

  } catch (error) {
    console.error('Error in sendPushNotification function:', error);
    
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

// Export the sendPushNotificationToDevices function for use by other functions
module.exports = { 
  handler: exports.handler,
  sendPushNotificationToDevices
};
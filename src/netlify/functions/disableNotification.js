// netlify/functions/disableNotification.js

const faunadb = require('faunadb');
const q = faunadb.query;

// Initialize FaunaDB client
const client = new faunadb.Client({
  secret: process.env.FAUNA_SECRET_KEY
});

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

    // Find the notification record
    let existingRecord;
    try {
      existingRecord = await client.query(
        q.Get(q.Match(q.Index('notification_by_registration'), formattedReg))
      );
    } catch (e) {
      // Not found, which means there's nothing to disable
      if (e.name === 'NotFound') {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({
            error: true,
            message: `No notifications found for ${formattedReg}`
          })
        };
      }
      throw e;
    }

    // Delete the notification from the database
    await client.query(
      q.Delete(existingRecord.ref)
    );

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
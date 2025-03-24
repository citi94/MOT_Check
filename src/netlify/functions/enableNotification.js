// netlify/functions/enableNotification.js

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

    // Check if this registration is already being monitored
    let existingRecord;
    try {
      existingRecord = await client.query(
        q.Get(q.Match(q.Index('notification_by_registration'), formattedReg))
      );
    } catch (e) {
      // Not found, which is expected if this is a new registration
      if (e.name !== 'NotFound') {
        throw e;
      }
    }

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
    await client.query(
      q.Create(q.Collection('notifications'), {
        data: {
          registration: formattedReg,
          lastCheckedDate: new Date().toISOString(),
          lastMotTestDate: null,
          enabled: true,
          createdAt: new Date().toISOString()
        }
      })
    );

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
// netlify/functions/getPendingNotifications.js
const { connectToDatabase } = require('./utils/mongodb');

exports.handler = async (event) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };

  // Handle preflight request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers
    };
  }
  
  try {
    const { registration } = event.queryStringParameters || {};
    
    if (!registration) {
      return { 
        statusCode: 400, 
        headers,
        body: JSON.stringify({ error: 'Registration required' }) 
      };
    }
    
    // Format the registration (remove spaces, uppercase)
    const formattedReg = registration.replace(/\s+/g, '').toUpperCase();
    
    console.log(`Checking for pending notifications for ${formattedReg}`); // Add logging

    const db = await connectToDatabase();
    const collection = db.collection('notifications');
    
    const record = await collection.findOne({ 
      registration: formattedReg
    });
    
    if (!record) {
      console.log(`No notification record found for ${formattedReg}`);
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          error: true,
          message: `No notification subscription found for ${formattedReg}`
        })
      };
    }
    
    console.log(`Found notification record for ${formattedReg}:`, {
      hasUpdate: !!record.hasUpdate,
      lastCheckedDate: record.lastCheckedDate,
      lastMotTestDate: record.lastMotTestDate
    }); // Add detailed logging
    
    if (record.hasUpdate) {
      console.log(`Pending update found for ${formattedReg}`);
      
      // Get update details
      const updateDetails = record.updateDetails || {};
      
      // Clear the update flag so it's only notified once
      await collection.updateOne(
        { registration: formattedReg },
        { $set: { hasUpdate: false, updateAcknowledgedAt: new Date().toISOString() } }
      );
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          hasUpdate: true, 
          registration: formattedReg,
          updateDetectedAt: record.updateDetectedAt,
          details: updateDetails,
          lastCheckedDate: record.lastCheckedDate
        })
      };
    }
    
    // Return monitoring status even if no updates
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        hasUpdate: false,
        registration: formattedReg,
        isMonitored: true,
        lastCheckedDate: record.lastCheckedDate || null,
        lastMotTestDate: record.lastMotTestDate || null
      })
    };
  } catch (error) {
    console.error('Error checking pending notifications:', error);
    
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
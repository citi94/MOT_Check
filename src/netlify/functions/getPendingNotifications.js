// netlify/functions/getPendingNotifications.js
const { connectToDatabase } = require('./utils/mongodb');

exports.handler = async (event) => {
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
    
    const db = await connectToDatabase();
    const collection = db.collection('notifications');
    
    const record = await collection.findOne({ 
      registration: formattedReg, 
      hasUpdate: true 
    });
    
    if (record) {
      // Get update details
      const updateDetails = record.updateDetails || {};
      
      // Clear the update flag
      await collection.updateOne(
        { registration: formattedReg },
        { $set: { hasUpdate: false } }
      );
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          hasUpdate: true, 
          registration: formattedReg,
          updateDetectedAt: record.updateDetectedAt,
          details: updateDetails
        })
      };
    }
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ hasUpdate: false })
    };
  } catch (error) {
    console.error('Error checking pending notifications:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
// netlify/functions/getPendingNotifications.js
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
        body: JSON.stringify({
          error: true,
          message: 'Registration parameter is required',
          code: 'MISSING_REGISTRATION',
          timestamp: new Date().toISOString()
        })
      };
    }
    
    // Format the registration (remove spaces, uppercase)
    const formattedReg = registration.replace(/\s+/g, '').toUpperCase();
    
    console.log(`Checking for pending notifications for ${formattedReg}`); 

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
          message: `No notification subscription found for ${formattedReg}`,
          code: 'SUBSCRIPTION_NOT_FOUND',
          timestamp: new Date().toISOString()
        })
      };
    }
    
    console.log(`Found notification record for ${formattedReg}:`, {
      hasUpdate: !!record.hasUpdate,
      lastCheckedDate: record.lastCheckedDate,
      lastMotTestDate: record.lastMotTestDate
    });
    
    // Use atomic findOneAndUpdate to prevent race conditions
    // This ensures only ONE client gets the notification, even with simultaneous requests
    const updatedRecord = await collection.findOneAndUpdate(
      { 
        registration: formattedReg, 
        hasUpdate: true  // Only update if hasUpdate is still true
      },
      { 
        $set: { 
          hasUpdate: false, 
          updateAcknowledgedAt: new Date().toISOString(),
          acknowledgedBy: event.headers['x-client-id'] || 'unknown'
        } 
      },
      { 
        returnDocument: 'before'  // Return the document before update
      }
    );
    
    // If updatedRecord is null, another client already processed this update
    if (updatedRecord && updatedRecord.hasUpdate) {
      console.log(`Pending update found and claimed for ${formattedReg}`);
      
      // Get update details
      const updateDetails = updatedRecord.updateDetails || {};
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          hasUpdate: true, 
          registration: formattedReg,
          updateDetectedAt: updatedRecord.updateDetectedAt,
          details: updateDetails,
          lastCheckedDate: updatedRecord.lastCheckedDate
        })
      };
    }
    
    // If we reach here, either no update was pending or another client claimed it
    if (record.hasUpdate) {
      console.log(`Update for ${formattedReg} was already claimed by another client`);
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
        message: error.message || 'Internal server error',
        code: 'INTERNAL_SERVER_ERROR',
        timestamp: new Date().toISOString()
      })
    };
  }
};
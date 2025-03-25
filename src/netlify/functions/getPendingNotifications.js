// netlify/functions/getPendingNotifications.js
exports.handler = async (event) => {
    try {
      const { registration } = event.queryStringParameters || {};
      
      if (!registration) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Registration required' }) };
      }
      
      const db = await connectToDatabase();
      const collection = db.collection('notifications');
      
      const record = await collection.findOne({ 
        registration: registration.toUpperCase(), 
        hasUpdate: true 
      });
      
      if (record) {
        // Clear the update flag
        await collection.updateOne(
          { registration: registration.toUpperCase() },
          { $set: { hasUpdate: false } }
        );
        
        return {
          statusCode: 200,
          body: JSON.stringify({ 
            hasUpdate: true, 
            updateDetectedAt: record.updateDetectedAt 
          })
        };
      }
      
      return {
        statusCode: 200,
        body: JSON.stringify({ hasUpdate: false })
      };
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message })
      };
    }
  };
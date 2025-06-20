// MongoDB connection utility
const { MongoClient, ServerApiVersion } = require('mongodb');

// Connection URI - using environment variables
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'mot_tracker';

// Cache the database connection to reuse across function invocations
let cachedDb = null;
let cachedClient = null;

async function connectToDatabase(retryCount = 0) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000; // 1 second base delay
  
  if (cachedDb) {
    // Test cached connection before returning it
    try {
      await cachedDb.admin().ping();
      return cachedDb;
    } catch (error) {
      console.warn('Cached connection failed ping test, reconnecting...', error.message);
      // Clear cache and reconnect
      cachedDb = null;
      cachedClient = null;
    }
  }

  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not set');
  }

  try {
    // Connect to our MongoDB database hosted on MongoDB Atlas
    const client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
      connectTimeoutMS: 10000, // 10 second connection timeout
      socketTimeoutMS: 45000, // 45 second socket timeout
      serverSelectionTimeoutMS: 10000, // 10 second server selection timeout
      maxPoolSize: 10, // Maintain up to 10 socket connections
      minPoolSize: 5, // Maintain a minimum of 5 socket connections
      maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
      retryWrites: true,
      retryReads: true,
    });
    
    await client.connect();
    
    // Test the connection
    await client.db("admin").command({ ping: 1 });
    console.log("Successfully connected to MongoDB!");
    
    // Specify which database we want to use
    const db = client.db(dbName);
    
    cachedDb = db;
    cachedClient = client;
    return db;
  } catch (error) {
    console.error(`Database connection failed (attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`, error.message);
    
    // Clear any partial cache
    cachedDb = null;
    cachedClient = null;
    
    // Retry with exponential backoff
    if (retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAY * Math.pow(2, retryCount); // Exponential backoff
      console.log(`Retrying database connection in ${delay}ms...`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return connectToDatabase(retryCount + 1);
    }
    
    throw new Error(`Failed to connect to database after ${MAX_RETRIES + 1} attempts: ${error.message}`);
  }
}

// Graceful shutdown handler
async function closeConnection() {
  if (cachedClient) {
    await cachedClient.close();
    cachedClient = null;
    cachedDb = null;
    console.log('MongoDB connection closed');
  }
}

module.exports = { connectToDatabase, closeConnection };
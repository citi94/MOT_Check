// MongoDB connection utility
const { MongoClient } = require('mongodb');

// Connection URI - using environment variables
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'mot_tracker';

// Cache the database connection to reuse across function invocations
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) {
    return cachedDb;
  }

  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not set');
  }

  // Connect to our MongoDB database hosted on MongoDB Atlas
  const client = new MongoClient(uri);
  await client.connect();
  
  // Specify which database we want to use
  const db = client.db(dbName);
  
  cachedDb = db;
  return db;
}

module.exports = { connectToDatabase };
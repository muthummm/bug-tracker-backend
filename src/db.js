import mongoose from 'mongoose';
import { config } from './config.js';
import { models } from './models.js';

/** Connects to MongoDB Atlas and makes sure every collection and index exists. */
export async function connectDb() {
  if (!config.mongoUri) throw new Error('MONGODB_URI is not set. Copy .env.example to .env and fill it in.');
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoUri, { dbName: config.dbName, serverSelectionTimeoutMS: 15000 });
  await Promise.all(models.map(m => m.createCollection().then(() => m.syncIndexes())));
  return mongoose.connection;
}

export const disconnectDb = () => mongoose.disconnect();

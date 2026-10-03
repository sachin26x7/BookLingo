import mongoose from 'mongoose';
import { config } from './index';

let isConnected = false;

export const connectDatabase = async (): Promise<void> => {
  if (isConnected) return;

  try {
    mongoose.set('strictQuery', false);
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    isConnected = true;
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error instanceof Error ? error.name : 'unknown error');
    throw error;
  }
};

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  console.warn('⚠️  MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  isConnected = true;
  console.log('🔄 MongoDB reconnected');
});

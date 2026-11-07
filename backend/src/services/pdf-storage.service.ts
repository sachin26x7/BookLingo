import fs from 'fs';
import mongoose from 'mongoose';
import { pipeline } from 'stream/promises';

const bucketName = 'pdfs';

const getBucket = (): mongoose.mongo.GridFSBucket => {
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB is not connected');
  return new mongoose.mongo.GridFSBucket(db, { bucketName });
};

export const storePdf = async (
  filePath: string,
  filename: string,
  userId: string
): Promise<mongoose.Types.ObjectId> => {
  const uploadStream = getBucket().openUploadStream(filename, { metadata: { userId } });
  try {
    await pipeline(fs.createReadStream(filePath), uploadStream);
    return uploadStream.id;
  } catch (error) {
    try {
      await deletePdf(uploadStream.id);
    } catch (cleanupError) {
      console.error('[PDF storage] Could not clean up an incomplete upload:', cleanupError);
    }
    throw error;
  }
};

export const getStoredPdf = (fileId: mongoose.Types.ObjectId) =>
  getBucket().find({ _id: fileId }).limit(1).next();

export const openStoredPdf = (fileId: mongoose.Types.ObjectId) =>
  getBucket().openDownloadStream(fileId);

export const deletePdf = async (fileId: mongoose.Types.ObjectId): Promise<void> => {
  const bucket = getBucket();
  if (await bucket.find({ _id: fileId }).limit(1).hasNext()) {
    await bucket.delete(fileId);
  }
};

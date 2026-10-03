import mongoose, { Document, Schema } from 'mongoose';

export interface IBook extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  author?: string;
  filename: string;
  originalName: string;
  fileSize: number;
  fileHash?: string;
  totalPages: number;
  coverImage?: string;
  uploadedAt: Date;
  lastOpenedAt?: Date;
  isDeleted: boolean;
}

const BookSchema = new Schema<IBook>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    author: { type: String, trim: true },
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    fileSize: { type: Number, required: true },
    fileHash: { type: String },
    totalPages: { type: Number, default: 0 },
    coverImage: { type: String },
    uploadedAt: { type: Date, default: Date.now },
    lastOpenedAt: { type: Date },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

BookSchema.index({ userId: 1, isDeleted: 1 });
BookSchema.index({ userId: 1, lastOpenedAt: -1 });

export const Book = mongoose.model<IBook>('Book', BookSchema);

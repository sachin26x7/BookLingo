import mongoose, { Document, Schema } from 'mongoose';

export interface IBookmark extends Document {
  userId: mongoose.Types.ObjectId;
  bookId: mongoose.Types.ObjectId;
  pageNumber: number;
  label: string;
  note: string;
  createdAt: Date;
}

const BookmarkSchema = new Schema<IBookmark>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    bookId: { type: Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
    pageNumber: { type: Number, required: true, min: 1 },
    label: { type: String, trim: true, default: '' },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

BookmarkSchema.index({ userId: 1, bookId: 1 });

export const Bookmark = mongoose.model<IBookmark>('Bookmark', BookmarkSchema);

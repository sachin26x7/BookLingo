import mongoose, { Document, Schema } from 'mongoose';

export interface IReadingProgress extends Document {
  userId: mongoose.Types.ObjectId;
  bookId: mongoose.Types.ObjectId;
  currentPage: number;
  totalPages: number;
  progressPercent: number;
  timeSpentMinutes: number;
  sessionHistory: Array<{
    date: Date;
    pagesRead: number;
    minutesSpent: number;
  }>;
  lastReadAt: Date;
}

const ReadingProgressSchema = new Schema<IReadingProgress>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    bookId: { type: Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
    currentPage: { type: Number, default: 1, min: 1 },
    totalPages: { type: Number, default: 0 },
    progressPercent: { type: Number, default: 0, min: 0, max: 100 },
    timeSpentMinutes: { type: Number, default: 0 },
    sessionHistory: [
      {
        date: { type: Date, default: Date.now },
        pagesRead: { type: Number, default: 0 },
        minutesSpent: { type: Number, default: 0 },
      },
    ],
    lastReadAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

ReadingProgressSchema.index({ userId: 1, bookId: 1 }, { unique: true });
ReadingProgressSchema.index({ userId: 1, lastReadAt: -1 });

export const ReadingProgress = mongoose.model<IReadingProgress>('ReadingProgress', ReadingProgressSchema);

import mongoose from 'mongoose';
import { Response } from 'express';
import { ReadingProgress } from '../models/ReadingProgress';
import { Book } from '../models/Book';
import { AuthRequest } from '../middleware/auth.middleware';

const uniqueProgressByBook = (records: any[]) => {
  const seenBookIds = new Set<string>();
  return records.filter((record) => {
    const bookId = record.bookId?._id?.toString?.() ?? record.bookId?.toString?.();
    if (!bookId || seenBookIds.has(bookId)) return false;
    seenBookIds.add(bookId);
    return true;
  });
};

const getActiveBookIds = async (userId: string) =>
  (await Book.find({ userId, isDeleted: false }).select('_id').lean())
    .map((book) => book._id);

export const getProgress = async (req: AuthRequest, res: Response): Promise<void> => {
  const { bookId } = req.params;
  const userId = req.user!.userId;
  const book = await Book.exists({ _id: bookId, userId, isDeleted: false });
  if (!book) {
    res.status(404).json({ success: false, message: 'Book not found' });
    return;
  }

  const progress = await ReadingProgress.findOne({ userId, bookId });
  res.json({ success: true, data: progress || null });
};

export const upsertProgress = async (req: AuthRequest, res: Response): Promise<void> => {
  const { bookId } = req.params;
  const userId = req.user!.userId;
  const { currentPage, totalPages, timeSpentMinutes } = req.body;
  const book = await Book.exists({ _id: bookId, userId, isDeleted: false });
  if (!book) {
    res.status(404).json({ success: false, message: 'Book not found' });
    return;
  }

  const progressPercent = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;

  const progress = await ReadingProgress.findOneAndUpdate(
    { userId, bookId },
    {
      $set: {
        currentPage,
        totalPages,
        progressPercent,
        lastReadAt: new Date(),
      },
      $inc: { timeSpentMinutes: timeSpentMinutes || 0 },
      $push: {
        sessionHistory: {
          $each: [{ date: new Date(), pagesRead: 1, minutesSpent: timeSpentMinutes || 0 }],
          $slice: -100, // Keep only last 100 sessions
        },
      },
    },
    { upsert: true, new: true, runValidators: true }
  );

  const stillActive = await Book.exists({ _id: bookId, userId, isDeleted: false });
  if (!stillActive) {
    await ReadingProgress.deleteMany({ userId, bookId });
    res.status(404).json({ success: false, message: 'Book not found' });
    return;
  }

  res.json({ success: true, data: progress });
};

export const getReadingStats = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const activeBookIds = await getActiveBookIds(userId);

  const [booksWithProgress, recentRecords, totalMinutes] = await Promise.all([
    ReadingProgress.distinct('bookId', { userId, bookId: { $in: activeBookIds } }),
    ReadingProgress.find({ userId, bookId: { $in: activeBookIds } })
      .sort({ lastReadAt: -1 }).limit(50).populate('bookId', 'title author filename'),
    ReadingProgress.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), bookId: { $in: activeBookIds } } },
      { $group: { _id: null, total: { $sum: '$timeSpentMinutes' } } },
    ]),
  ]);
  const activeBooks = booksWithProgress.length;
  const recentActivity = uniqueProgressByBook(recentRecords).slice(0, 3);

  res.json({
    success: true,
    data: {
      totalBooks: activeBookIds.length,
      activeBooks,
      totalReadingMinutes: totalMinutes[0]?.total || 0,
      recentActivity,
    },
  });
};

export const getContinueReading = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const activeBookIds = await getActiveBookIds(userId);

  const recent = await ReadingProgress.find({
    userId,
    bookId: { $in: activeBookIds },
    progressPercent: { $lt: 100 },
  })
    .sort({ lastReadAt: -1 })
    .limit(50)
    .populate('bookId', 'title author filename originalName');

  const result = uniqueProgressByBook(recent).slice(0, 5);

  res.json({ success: true, data: result });
};

import { Response } from 'express';
import { SavedWord, ReviewStatus } from '../models/SavedWord';
import { Book } from '../models/Book';
import { AuthRequest } from '../middleware/auth.middleware';

const getNextReviewDate = (status: ReviewStatus): Date => {
  const now = new Date();
  const intervals: Record<ReviewStatus, number> = {
    new: 1,        // review in 1 day
    review: 3,     // review in 3 days
    familiar: 7,   // review in 7 days
    learned: 30,   // review in 30 days
  };
  const days = intervals[status] || 1;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const saveWord = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const {
    bookId, bookTitle, word, sentence, paragraph, pageNumber,
    contextualMeaning, simpleExplanation, translation, targetLanguage,
    partOfSpeech, pronunciation, synonyms, exampleSentence,
  } = req.body;

  const book = await Book.findOne({ _id: bookId, userId, isDeleted: false }).select('_id title').lean();
  if (!book) {
    res.status(404).json({ success: false, message: 'Book not found' });
    return;
  }

  // Prevent duplicate saves for same word in same book
  const normalizedWord = word.trim().toLowerCase();
  const existing = await SavedWord.findOne({ userId, bookId, word: normalizedWord });
  if (existing) {
    res.status(409).json({ success: false, message: 'Word already saved from this book' });
    return;
  }

  const savedWord = await SavedWord.create({
    userId,
    bookId,
    bookTitle: book.title,
    word: normalizedWord,
    sentence,
    paragraph,
    pageNumber,
    contextualMeaning,
    simpleExplanation,
    translation,
    targetLanguage,
    partOfSpeech,
    pronunciation,
    synonyms: synonyms || [],
    exampleSentence,
    reviewStatus: 'new',
    nextReviewAt: getNextReviewDate('new'),
  });

  res.status(201).json({ success: true, data: savedWord });
};

export const getVocabulary = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const page = Math.min(Math.max(parseInt(req.query.page as string) || 1, 1), 10000);
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
  const skip = (page - 1) * limit;
  const { bookId, status, language, sort = 'newest', search } = req.query;

  const filter: Record<string, any> = { userId };
  if (bookId) filter.bookId = bookId;
  if (status) filter.reviewStatus = status;
  if (language) filter.targetLanguage = language;
  if (typeof search === 'string' && search) filter.word = { $regex: escapeRegex(search), $options: 'i' };

  const sortMap: Record<string, any> = {
    newest: { savedAt: -1 },
    oldest: { savedAt: 1 },
    alphabetical: { word: 1 },
    review: { nextReviewAt: 1 },
  };

  const sortQuery = sortMap[sort as string] || sortMap.newest;

  const [words, total] = await Promise.all([
    SavedWord.find(filter).sort(sortQuery).skip(skip).limit(limit).lean(),
    SavedWord.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: {
      words,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    },
  });
};

export const getVocabularyStats = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;

  const [statusCounts, weeklyNew, recentWords] = await Promise.all([
    SavedWord.aggregate([
      { $match: { userId: userId } },
      { $group: { _id: '$reviewStatus', count: { $sum: 1 } } },
    ]),
    SavedWord.countDocuments({
      userId,
      savedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    }),
    SavedWord.find({ userId }).sort({ savedAt: -1 }).limit(5).lean(),
  ]);

  const counts: Record<string, number> = { new: 0, review: 0, familiar: 0, learned: 0 };
  statusCounts.forEach((s) => { counts[s._id] = s.count; });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  res.json({
    success: true,
    data: {
      total,
      new: counts.new,
      review: counts.review,
      familiar: counts.familiar,
      learned: counts.learned,
      weeklyNew,
      recentWords,
    },
  });
};

export const getReviewQueue = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 10, 1), 50);

  const dueWords = await SavedWord.find({
    userId,
    nextReviewAt: { $lte: new Date() },
    reviewStatus: { $ne: 'learned' },
  })
    .sort({ nextReviewAt: 1 })
    .limit(limit)
    .lean();

  res.json({ success: true, data: dueWords });
};

export const updateWordReview = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { reviewStatus, userNotes, difficultyLevel } = req.body;
  const userId = req.user!.userId;

  const updates: Record<string, any> = {
    lastReviewedAt: new Date(),
    $inc: { reviewCount: 1 },
  };

  if (reviewStatus) {
    updates.reviewStatus = reviewStatus;
    updates.nextReviewAt = getNextReviewDate(reviewStatus as ReviewStatus);
  }
  if (userNotes !== undefined) updates.userNotes = userNotes;
  if (difficultyLevel) updates.difficultyLevel = difficultyLevel;

  const word = await SavedWord.findOneAndUpdate({ _id: id, userId }, updates, { new: true, runValidators: true });

  if (!word) {
    res.status(404).json({ success: false, message: 'Word not found' });
    return;
  }

  res.json({ success: true, data: word });
};

export const deleteWord = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const deleted = await SavedWord.findOneAndDelete({ _id: id, userId: req.user!.userId });

  if (!deleted) {
    res.status(404).json({ success: false, message: 'Word not found' });
    return;
  }

  res.json({ success: true, message: 'Word deleted' });
};

export const getWordById = async (req: AuthRequest, res: Response): Promise<void> => {
  const word = await SavedWord.findOne({ _id: req.params.id, userId: req.user!.userId });

  if (!word) {
    res.status(404).json({ success: false, message: 'Word not found' });
    return;
  }

  res.json({ success: true, data: word });
};

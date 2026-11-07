import { Response } from 'express';
import { Readable } from 'stream';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Book } from '../models/Book';
import { ReadingProgress } from '../models/ReadingProgress';
import { Bookmark } from '../models/Bookmark';
import { Annotation } from '../models/Annotation';
import { AuthRequest } from '../middleware/auth.middleware';
import { config } from '../config';
import { deletePdf, getStoredPdf, openStoredPdf, storePdf } from '../services/pdf-storage.service';

const getFileHash = (filePath: string): Promise<string> => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath);
  stream.on('data', (chunk) => hash.update(chunk));
  stream.once('error', reject);
  stream.once('end', () => resolve(hash.digest('hex')));
});

export const uploadBook = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'No file uploaded' });
    return;
  }

  try {
    const { title, author } = req.body;
    const userId = req.user!.userId;
    const originalName = req.file.originalname
      .split(/[\\/]/)
      .pop()
      ?.replace(/[\x00-\x1f\x7f]/g, '')
      .slice(0, 255) || 'book.pdf';
    const fileHash = await getFileHash(req.file.path);
    const possibleDuplicates = await Book.find({
      userId,
      isDeleted: false,
      fileSize: req.file.size,
    }).select('_id filename fileHash').lean();

    for (const existingBook of possibleDuplicates) {
      let existingHash = existingBook.fileHash;
      if (!existingHash) {
        const existingPath = path.resolve(config.uploadDir, existingBook.filename);
        if (!fs.existsSync(existingPath)) continue;
        existingHash = await getFileHash(existingPath);
        await Book.updateOne({ _id: existingBook._id, userId }, { $set: { fileHash: existingHash } });
      }

      if (existingHash === fileHash) {
        res.status(409).json({
          success: false,
          message: 'This PDF is already uploaded to your library.',
        });
        return;
      }
    }

    const fileId = await storePdf(req.file.path, req.file.filename, userId);
    try {
      const book = await Book.create({
        userId,
        title: title || path.basename(originalName, path.extname(originalName)).slice(0, 200) || 'Untitled book',
        author: author || '',
        filename: req.file.filename,
        fileId,
        originalName,
        fileSize: req.file.size,
        fileHash,
        totalPages: 0, // Will be updated when first opened
        uploadedAt: new Date(),
      });

      res.status(201).json({
        success: true,
        data: book,
        message: 'Book uploaded successfully',
      });
    } catch (error) {
      await deletePdf(fileId);
      throw error;
    }
  } finally {
    await fs.promises.unlink(req.file.path).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') console.warn('Could not remove temporary PDF upload:', error.message);
    });
  }
};

export const getBooks = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;

  const [books, total] = await Promise.all([
    Book.find({ userId, isDeleted: false })
      .sort({ lastOpenedAt: -1, uploadedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Book.countDocuments({ userId, isDeleted: false }),
  ]);

  // Attach progress for each book
  const bookIds = books.map((b) => b._id);
  const progressRecords = await ReadingProgress.find({
    userId,
    bookId: { $in: bookIds },
  }).lean();

  const progressMap = new Map(progressRecords.map((p) => [p.bookId.toString(), p]));

  const booksWithProgress = books.map((book) => ({
    ...book,
    progress: progressMap.get((book._id as any).toString()) || null,
  }));

  res.json({
    success: true,
    data: {
      books: booksWithProgress,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    },
  });
};

export const getBook = async (req: AuthRequest, res: Response): Promise<void> => {
  const book = await Book.findOne({
    _id: req.params.id,
    userId: req.user!.userId,
    isDeleted: false,
  });

  if (!book) {
    res.status(404).json({ success: false, message: 'Book not found' });
    return;
  }

  // Update lastOpenedAt
  book.lastOpenedAt = new Date();
  await book.save();

  const progress = await ReadingProgress.findOne({
    userId: req.user!.userId,
    bookId: book._id,
  });

  res.json({ success: true, data: { book, progress } });
};

export const serveBookFile = async (req: AuthRequest, res: Response): Promise<void> => {
  const book = await Book.findOne({
    _id: req.params.id,
    userId: req.user!.userId,
    isDeleted: false,
  });

  if (!book) {
    res.status(404).json({ success: false, message: 'Book not found' });
    return;
  }

  let fileSize = book.fileSize;
  let fileStream: Readable;
  if (book.fileId) {
    const storedFile = await getStoredPdf(book.fileId);
    if (!storedFile) {
      res.status(404).json({ success: false, message: 'PDF data not found in storage' });
      return;
    }
    fileSize = storedFile.length;
    fileStream = openStoredPdf(book.fileId);
  } else {
    const filePath = path.resolve(config.uploadDir, book.filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ success: false, message: 'PDF data not found in storage' });
      return;
    }

    const fileId = await storePdf(filePath, book.filename, req.user!.userId);
    try {
      book.fileHash ??= await getFileHash(filePath);
      book.fileId = fileId;
      await book.save();
    } catch (error) {
      await deletePdf(fileId);
      throw error;
    }

    await fs.promises.unlink(filePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') console.warn('Could not remove migrated PDF:', error.message);
    });
    const storedFile = await getStoredPdf(fileId);
    if (!storedFile) throw new Error('Migrated PDF was not found in GridFS');
    fileSize = storedFile.length;
    fileStream = openStoredPdf(fileId);
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="book.pdf"');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Length', fileSize);
  fileStream.once('error', (error) => {
    if (res.headersSent) res.destroy(error);
    else res.status(500).end();
  });
  fileStream.pipe(res);
};

export const updateBookMetadata = async (req: AuthRequest, res: Response): Promise<void> => {
  const { title, author, totalPages } = req.body;

  const book = await Book.findOneAndUpdate(
    { _id: req.params.id, userId: req.user!.userId, isDeleted: false },
    { ...(title !== undefined && { title }), ...(author !== undefined && { author }), ...(totalPages !== undefined && { totalPages }) },
    { returnDocument: 'after', runValidators: true }
  );

  if (!book) {
    res.status(404).json({ success: false, message: 'Book not found' });
    return;
  }

  res.json({ success: true, data: book });
};

export const deleteBook = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const book = await Book.findOne({ _id: req.params.id, userId, isDeleted: false });

  if (!book) {
    res.status(404).json({ success: false, message: 'Book not found' });
    return;
  }

  const bookId = book._id;
  if (book.fileId) await deletePdf(book.fileId);
  const filePath = path.resolve(config.uploadDir, book.filename);
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  await Book.updateOne({ _id: bookId, userId }, { $set: { isDeleted: true } });
  await Promise.all([
    ReadingProgress.deleteMany({ userId, bookId }),
    Bookmark.deleteMany({ userId, bookId }),
    Annotation.deleteMany({ userId, bookId }),
  ]);

  await Book.deleteOne({ _id: bookId, userId });

  res.json({
    success: true,
    message: 'Book and reading history deleted. Saved words were kept.',
  });
};

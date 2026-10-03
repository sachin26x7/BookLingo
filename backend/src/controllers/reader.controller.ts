import { Response } from 'express';
import { Bookmark } from '../models/Bookmark';
import { Annotation } from '../models/Annotation';
import { Book } from '../models/Book';
import { AuthRequest } from '../middleware/auth.middleware';

// Bookmarks
export const createBookmark = async (req: AuthRequest, res: Response): Promise<void> => {
  const { bookId, pageNumber, label, note } = req.body;
  const userId = req.user!.userId;
  const book = await Book.exists({ _id: bookId, userId, isDeleted: false });
  if (!book) {
    res.status(404).json({ success: false, message: 'Book not found' });
    return;
  }

  const bookmark = await Bookmark.create({ userId, bookId, pageNumber, label, note });
  res.status(201).json({ success: true, data: bookmark });
};

export const getBookmarks = async (req: AuthRequest, res: Response): Promise<void> => {
  const { bookId } = req.params;
  const userId = req.user!.userId;
  const book = await Book.exists({ _id: bookId, userId, isDeleted: false });
  if (!book) {
    res.status(404).json({ success: false, message: 'Book not found' });
    return;
  }
  const bookmarks = await Bookmark.find({ userId, bookId }).sort({ pageNumber: 1 });
  res.json({ success: true, data: bookmarks });
};

export const deleteBookmark = async (req: AuthRequest, res: Response): Promise<void> => {
  const deleted = await Bookmark.findOneAndDelete({ _id: req.params.id, userId: req.user!.userId });
  if (!deleted) {
    res.status(404).json({ success: false, message: 'Bookmark not found' });
    return;
  }
  res.json({ success: true, message: 'Bookmark deleted' });
};

// Annotations
export const createAnnotation = async (req: AuthRequest, res: Response): Promise<void> => {
  const { bookId, pageNumber, selectedText, note, color, position } = req.body;
  const userId = req.user!.userId;
  const book = await Book.exists({ _id: bookId, userId, isDeleted: false });
  if (!book) {
    res.status(404).json({ success: false, message: 'Book not found' });
    return;
  }
  const annotation = await Annotation.create({
    userId,
    bookId, pageNumber, selectedText, note, color, position,
  });
  res.status(201).json({ success: true, data: annotation });
};

export const getAnnotations = async (req: AuthRequest, res: Response): Promise<void> => {
  const { bookId } = req.params;
  const userId = req.user!.userId;
  const book = await Book.exists({ _id: bookId, userId, isDeleted: false });
  if (!book) {
    res.status(404).json({ success: false, message: 'Book not found' });
    return;
  }
  const annotations = await Annotation.find({
    userId,
    bookId,
  }).sort({ pageNumber: 1 });
  res.json({ success: true, data: annotations });
};

export const updateAnnotation = async (req: AuthRequest, res: Response): Promise<void> => {
  const { note, color } = req.body;
  const annotation = await Annotation.findOneAndUpdate(
    { _id: req.params.id, userId: req.user!.userId },
    { note, color },
    { new: true }
  );
  if (!annotation) {
    res.status(404).json({ success: false, message: 'Annotation not found' });
    return;
  }
  res.json({ success: true, data: annotation });
};

export const deleteAnnotation = async (req: AuthRequest, res: Response): Promise<void> => {
  const deleted = await Annotation.findOneAndDelete({
    _id: req.params.id,
    userId: req.user!.userId,
  });
  if (!deleted) {
    res.status(404).json({ success: false, message: 'Annotation not found' });
    return;
  }
  res.json({ success: true, message: 'Annotation deleted' });
};

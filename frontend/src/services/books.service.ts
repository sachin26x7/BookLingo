import api from './api';
import type { Book, ReadingProgress, ReadingStats } from '../types';

export const booksService = {
  upload: (file: File, title?: string, author?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (title) formData.append('title', title);
    if (author) formData.append('author', author);
    return api.post<{ success: boolean; data: Book }>('/books/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  getAll: (page = 1, limit = 20) =>
    api.get<{ success: boolean; data: { books: Book[]; pagination: any } }>('/books', {
      params: { page, limit },
    }),

  getOne: (id: string) =>
    api.get<{ success: boolean; data: { book: Book; progress: ReadingProgress | null } }>(`/books/${id}`),

  getFileUrl: (id: string) => `/api/books/${id}/file`,

  updateMetadata: (id: string, data: { title?: string; author?: string; totalPages?: number }) =>
    api.put(`/books/${id}`, data),

  delete: (id: string) => api.delete(`/books/${id}`),
};

export const progressService = {
  getProgress: (bookId: string) =>
    api.get<{ success: boolean; data: ReadingProgress | null }>(`/progress/${bookId}`),

  updateProgress: (bookId: string, data: { currentPage: number; totalPages: number; timeSpentMinutes?: number }) =>
    api.put(`/progress/${bookId}`, data),

  getStats: () =>
    api.get<{ success: boolean; data: ReadingStats }>('/progress/stats'),

  getContinueReading: () =>
    api.get<{ success: boolean; data: any[] }>('/progress/continue'),
};

export const readerService = {
  // Bookmarks
  createBookmark: (data: { bookId: string; pageNumber: number; label?: string; note?: string }) =>
    api.post('/reader/bookmarks', data),

  getBookmarks: (bookId: string) =>
    api.get(`/reader/bookmarks/${bookId}`),

  deleteBookmark: (id: string) => api.delete(`/reader/bookmarks/${id}`),

  // Annotations
  createAnnotation: (data: {
    bookId: string;
    pageNumber: number;
    selectedText: string;
    note?: string;
    color?: string;
    position?: any;
  }) => api.post('/reader/annotations', data),

  getAnnotations: (bookId: string) =>
    api.get(`/reader/annotations/${bookId}`),

  updateAnnotation: (id: string, data: { note?: string; color?: string }) =>
    api.put(`/reader/annotations/${id}`, data),

  deleteAnnotation: (id: string) => api.delete(`/reader/annotations/${id}`),
};

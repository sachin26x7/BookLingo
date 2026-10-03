// Auth
export interface User {
  id: string;
  name: string;
  email: string;
  mobile?: string;
  isEmailVerified: boolean;
  isMobileVerified: boolean;
  preferredLanguage: string;
  proficiencyLevel: 'beginner' | 'elementary' | 'intermediate' | 'advanced' | 'proficient';
  theme: 'light' | 'dark' | 'sepia';
  readingPreferences: {
    fontSize: number;
    pageWidth: number;
    focusMode: boolean;
  };
  vocabularySettings: {
    showPronunciation: boolean;
    autoSave: boolean;
    reviewReminders: boolean;
  };
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// Books
export interface Book {
  _id: string;
  title: string;
  author?: string;
  filename: string;
  originalName: string;
  fileSize: number;
  totalPages: number;
  coverImage?: string;
  uploadedAt: string;
  lastOpenedAt?: string;
  progress?: ReadingProgress | null;
}

export interface ReadingProgress {
  _id: string;
  userId: string;
  bookId: string;
  currentPage: number;
  totalPages: number;
  progressPercent: number;
  timeSpentMinutes: number;
  lastReadAt: string;
}

// Vocabulary
export type ReviewStatus = 'new' | 'review' | 'familiar' | 'learned';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export interface SavedWord {
  _id: string;
  userId: string;
  bookId: string;
  bookTitle: string;
  word: string;
  sentence: string;
  paragraph: string;
  pageNumber: number;
  contextualMeaning: string;
  simpleExplanation: string;
  translation: string;
  targetLanguage: string;
  partOfSpeech: string;
  pronunciation: string;
  synonyms: string[];
  exampleSentence: string;
  userNotes: string;
  difficultyLevel: DifficultyLevel;
  reviewStatus: ReviewStatus;
  savedAt: string;
  lastReviewedAt?: string;
  nextReviewAt?: string;
  reviewCount: number;
}

export interface VocabStats {
  total: number;
  new: number;
  review: number;
  familiar: number;
  learned: number;
  weeklyNew: number;
  recentWords: SavedWord[];
}

// Bookmarks & Annotations
export interface Bookmark {
  _id: string;
  bookId: string;
  pageNumber: number;
  label: string;
  note: string;
  createdAt: string;
}

export interface Annotation {
  _id: string;
  bookId: string;
  pageNumber: number;
  selectedText: string;
  note: string;
  color: string;
  position: {
    rects: Array<{ x: number; y: number; width: number; height: number }>;
  };
  createdAt: string;
}

// AI
export interface WordExplanation {
  word: string;
  contextualMeaning: string;
  simpleExplanation: string;
  translation: string;
  partOfSpeech: string;
  pronunciation: string;
  synonyms: string[];
  exampleSentence: string;
  cached?: boolean;
}

export interface AIWordExplanation {
  word: string;
  contextualMeaning: string;
  simpleEnglish: string;
  translation: string;
  pronunciation: string;
  partOfSpeech: string;
  synonyms: string[];
  example: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

// API Responses
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Array<{ field: string; message: string }>;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// Reader State
export interface WordSelection {
  word: string;
  sentence: string;
  paragraph: string;
  previousSentence?: string;
  nextSentence?: string;
  position: { x: number; y: number };
}

export interface ReaderSettings {
  fontSize: number;
  pageWidth: number;
  zoom: number;
  theme: 'light' | 'dark' | 'sepia';
  focusMode: boolean;
}

// Reading Stats
export interface ReadingStats {
  totalBooks: number;
  activeBooks: number;
  totalReadingMinutes: number;
  recentActivity: Array<{
    _id: string;
    bookId: Book;
    currentPage: number;
    progressPercent: number;
    lastReadAt: string;
  }>;
}

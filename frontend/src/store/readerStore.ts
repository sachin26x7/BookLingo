import { create } from 'zustand';
import type { ReaderSettings, WordSelection, WordExplanation, Book, Bookmark, Annotation } from '../types';

interface ReaderStore {
  // Current book
  currentBook: Book | null;
  currentPage: number;
  totalPages: number;
  
  // Reader settings
  settings: ReaderSettings;
  
  // Word popup
  selectedWord: WordSelection | null;
  explanation: WordExplanation | null;
  isExplaining: boolean;
  popupVisible: boolean;
  
  // Bookmarks & Annotations
  bookmarks: Bookmark[];
  annotations: Annotation[];
  
  // Actions
  setCurrentBook: (book: Book | null) => void;
  clearBookState: (bookId: string) => void;
  setCurrentPage: (page: number) => void;
  setTotalPages: (total: number) => void;
  setSettings: (settings: Partial<ReaderSettings>) => void;
  showWordPopup: (selection: WordSelection) => void;
  setExplanation: (explanation: WordExplanation | null) => void;
  setIsExplaining: (loading: boolean) => void;
  hidePopup: () => void;
  setBookmarks: (bookmarks: Bookmark[]) => void;
  addBookmark: (bookmark: Bookmark) => void;
  removeBookmark: (id: string) => void;
  setAnnotations: (annotations: Annotation[]) => void;
  addAnnotation: (annotation: Annotation) => void;
  removeAnnotation: (id: string) => void;
}

export const useReaderStore = create<ReaderStore>((set) => ({
  currentBook: null,
  currentPage: 1,
  totalPages: 0,
  settings: {
    fontSize: 16,
    pageWidth: 800,
    zoom: 1.0,
    theme: 'light',
    focusMode: false,
  },
  selectedWord: null,
  explanation: null,
  isExplaining: false,
  popupVisible: false,
  bookmarks: [],
  annotations: [],

  setCurrentBook: (book) => set({ currentBook: book }),
  clearBookState: (bookId) => set((state) => {
    if (state.currentBook?._id !== bookId) return state;
    return {
      ...state,
      currentBook: null,
      currentPage: 1,
      totalPages: 0,
      selectedWord: null,
      explanation: null,
      isExplaining: false,
      popupVisible: false,
      bookmarks: [],
      annotations: [],
    };
  }),
  setCurrentPage: (page) => set({ currentPage: page }),
  setTotalPages: (total) => set({ totalPages: total }),

  setSettings: (newSettings) =>
    set((state) => ({ settings: { ...state.settings, ...newSettings } })),

  showWordPopup: (selection) =>
    set({ selectedWord: selection, popupVisible: true, explanation: null }),

  setExplanation: (explanation) => set({ explanation }),
  setIsExplaining: (loading) => set({ isExplaining: loading }),

  hidePopup: () =>
    set({ popupVisible: false, selectedWord: null, explanation: null }),

  setBookmarks: (bookmarks) => set({ bookmarks }),
  addBookmark: (bookmark) =>
    set((state) => ({ bookmarks: [...state.bookmarks, bookmark] })),
  removeBookmark: (id) =>
    set((state) => ({ bookmarks: state.bookmarks.filter((b) => b._id !== id) })),

  setAnnotations: (annotations) => set({ annotations }),
  addAnnotation: (annotation) =>
    set((state) => ({ annotations: [...state.annotations, annotation] })),
  removeAnnotation: (id) =>
    set((state) => ({ annotations: state.annotations.filter((a) => a._id !== id) })),
}));

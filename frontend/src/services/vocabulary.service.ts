import api from './api';
import type { AIWordExplanation, SavedWord, VocabStats, WordExplanation } from '../types';

export const vocabularyService = {
  saveWord: (data: Partial<SavedWord>) =>
    api.post<{ success: boolean; data: SavedWord }>('/vocabulary', data),

  getAll: (params?: {
    page?: number;
    limit?: number;
    bookId?: string;
    status?: string;
    language?: string;
    sort?: string;
    search?: string;
  }) => api.get<{ success: boolean; data: { words: SavedWord[]; pagination: any } }>('/vocabulary', { params }),

  getStats: () =>
    api.get<{ success: boolean; data: VocabStats }>('/vocabulary/stats'),

  getReviewQueue: (limit?: number) =>
    api.get<{ success: boolean; data: SavedWord[] }>('/vocabulary/review-queue', { params: { limit } }),

  getOne: (id: string) =>
    api.get<{ success: boolean; data: SavedWord }>(`/vocabulary/${id}`),

  update: (id: string, data: Partial<SavedWord>) =>
    api.put<{ success: boolean; data: SavedWord }>(`/vocabulary/${id}`, data),

  delete: (id: string) => api.delete(`/vocabulary/${id}`),
};

export const aiService = {
  explainWord: (data: {
    word: string;
    sentence: string;
    paragraph?: string;
    previousSentence?: string;
    nextSentence?: string;
    targetLanguage?: string;
    userLevel?: string;
  }) => api.post<{ success: boolean; data: AIWordExplanation }>('/ai/explain-word', data)
    .then((response) => ({
      ...response,
      data: {
        ...response.data,
        data: {
          word: response.data.data.word,
          contextualMeaning: response.data.data.contextualMeaning,
          simpleExplanation: response.data.data.simpleEnglish,
          translation: response.data.data.translation,
          pronunciation: response.data.data.pronunciation,
          partOfSpeech: response.data.data.partOfSpeech,
          synonyms: response.data.data.synonyms,
          exampleSentence: response.data.data.example,
        } satisfies WordExplanation,
      },
    })),
};

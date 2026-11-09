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
  explainContext: (data: {
    word: string;
    sentence: string;
    paragraph?: string;
    previousSentence?: string;
    nextSentence?: string;
    userLevel?: string;
  }) => api.post<{ success: boolean; data: AIWordExplanation }>('/ai/explain-context', data)
    .then((response) => mapExplanation(response.data.data)),

  translateWord: (data: { word: string; targetLanguage: string }) =>
    api.post<{ success: boolean; data: { translation: string } }>('/ai/translate-word', data),

  explainWord: async (data: {
    word: string;
    sentence: string;
    paragraph?: string;
    previousSentence?: string;
    nextSentence?: string;
    targetLanguage?: string;
    userLevel?: string;
  }) => {
    const [context, translation] = await Promise.all([
      aiService.explainContext(data),
      aiService.translateWord({
        word: data.word,
        targetLanguage: data.targetLanguage || 'Hindi',
      }),
    ]);
    return {
      data: {
        success: true,
        data: {
          ...context,
          translation: translation.data.data.translation,
        },
      },
    };
  },
};

const mapExplanation = (explanation: AIWordExplanation): WordExplanation => ({
  word: explanation.word,
  contextualMeaning: explanation.contextualMeaning,
  simpleExplanation: explanation.simpleEnglish,
  translation: explanation.translation,
  pronunciation: explanation.pronunciation,
  partOfSpeech: explanation.partOfSpeech,
  synonyms: explanation.synonyms,
  exampleSentence: explanation.example,
});

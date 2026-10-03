import mongoose, { Document, Schema } from 'mongoose';

export type ReviewStatus = 'new' | 'review' | 'familiar' | 'learned';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export interface ISavedWord extends Document {
  userId: mongoose.Types.ObjectId;
  bookId: mongoose.Types.ObjectId;
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
  savedAt: Date;
  lastReviewedAt?: Date;
  nextReviewAt?: Date;
  reviewCount: number;
}

const SavedWordSchema = new Schema<ISavedWord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    bookId: { type: Schema.Types.ObjectId, ref: 'Book', required: true },
    bookTitle: { type: String, required: true },
    word: { type: String, required: true, trim: true },
    sentence: { type: String, required: true },
    paragraph: { type: String },
    pageNumber: { type: Number, required: true },
    contextualMeaning: { type: String, required: true },
    simpleExplanation: { type: String },
    translation: { type: String },
    targetLanguage: { type: String, default: 'Hindi' },
    partOfSpeech: { type: String },
    pronunciation: { type: String },
    synonyms: [{ type: String }],
    exampleSentence: { type: String },
    userNotes: { type: String, default: '' },
    difficultyLevel: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    reviewStatus: { type: String, enum: ['new', 'review', 'familiar', 'learned'], default: 'new' },
    savedAt: { type: Date, default: Date.now },
    lastReviewedAt: { type: Date },
    nextReviewAt: { type: Date },
    reviewCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

SavedWordSchema.index({ userId: 1, savedAt: -1 });
SavedWordSchema.index({ userId: 1, bookId: 1 });
SavedWordSchema.index({ userId: 1, reviewStatus: 1 });
SavedWordSchema.index({ userId: 1, nextReviewAt: 1 });

export const SavedWord = mongoose.model<ISavedWord>('SavedWord', SavedWordSchema);

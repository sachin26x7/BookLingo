import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  name: string;
  email: string;
  mobile?: string;
  passwordHash: string;
  tokenVersion: number;
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
  createdAt: Date;
  updatedAt: Date;
  comparePassword(password: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    mobile: { type: String, sparse: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    tokenVersion: { type: Number, default: 0, select: false },
    isEmailVerified: { type: Boolean, default: false },
    isMobileVerified: { type: Boolean, default: false },
    preferredLanguage: { type: String, default: 'Hindi' },
    proficiencyLevel: {
      type: String,
      enum: ['beginner', 'elementary', 'intermediate', 'advanced', 'proficient'],
      default: 'intermediate',
    },
    theme: { type: String, enum: ['light', 'dark', 'sepia'], default: 'light' },
    readingPreferences: {
      fontSize: { type: Number, default: 16, min: 12, max: 24 },
      pageWidth: { type: Number, default: 800, min: 600, max: 1200 },
      focusMode: { type: Boolean, default: false },
    },
    vocabularySettings: {
      showPronunciation: { type: Boolean, default: true },
      autoSave: { type: Boolean, default: false },
      reviewReminders: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

UserSchema.methods.comparePassword = async function (password: string): Promise<boolean> {
  return bcrypt.compare(password, this.passwordHash);
};

UserSchema.pre('save', async function () {
  if (!this.isModified('passwordHash')) return;
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
});

export const User = mongoose.model<IUser>('User', UserSchema);

import { Response } from 'express';
import { User } from '../models/User';
import { AuthRequest } from '../middleware/auth.middleware';

export const getProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await User.findById(req.user?.userId).select('-passwordHash');
  if (!user) {
    res.status(404).json({ success: false, message: 'User not found' });
    return;
  }
  res.json({ success: true, data: user });
};

export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  const allowedFields = ['name', 'preferredLanguage', 'proficiencyLevel'];
  const updates: Record<string, any> = {};

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  const user = await User.findByIdAndUpdate(req.user?.userId, updates, {
    new: true,
    runValidators: true,
  }).select('-passwordHash');

  res.json({ success: true, data: user });
};

export const updatePreferences = async (req: AuthRequest, res: Response): Promise<void> => {
  const { theme, readingPreferences, vocabularySettings } = req.body;

  const updates: Record<string, any> = {};
  if (theme !== undefined) updates.theme = theme;

  const addAllowedSettings = (field: string, value: unknown, allowed: string[]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        updates[`${field}.${key}`] = (value as Record<string, unknown>)[key];
      }
    }
  };

  addAllowedSettings('readingPreferences', readingPreferences, ['fontSize', 'pageWidth', 'focusMode']);
  addAllowedSettings('vocabularySettings', vocabularySettings, ['showPronunciation', 'autoSave', 'reviewReminders']);

  const user = await User.findByIdAndUpdate(req.user?.userId, updates, {
    new: true,
    runValidators: true,
  }).select('-passwordHash');

  res.json({ success: true, data: user });
};

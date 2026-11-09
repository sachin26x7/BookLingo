import { Response } from 'express';
import { body } from 'express-validator';
import { explainWord, explainWordInContext, translateWord } from '../services/ai.service';
import { AuthRequest } from '../middleware/auth.middleware';

const supportedLanguages = [
  'English', 'Hindi', 'Bengali', 'Spanish', 'French', 'German', 'Arabic',
  'Portuguese', 'Russian', 'Urdu', 'Chinese', 'Japanese', 'Italian', 'Korean',
];

export const explainWordValidators = [
  body('word').trim().notEmpty().isLength({ max: 200 }).withMessage('Word is required'),
  body('sentence').trim().notEmpty().isLength({ max: 2000 }).withMessage('Sentence is required'),
  body('paragraph').optional().trim().isLength({ max: 5000 }),
  body('previousSentence').optional().trim().isLength({ max: 2000 }),
  body('nextSentence').optional().trim().isLength({ max: 2000 }),
  body('targetLanguage').optional().trim().isIn(supportedLanguages),
  body('userLevel').optional().trim().isIn(['beginner', 'elementary', 'intermediate', 'advanced', 'proficient']),
];

const getContextRequest = (req: AuthRequest) => {
  const { word, sentence, paragraph, previousSentence, nextSentence, targetLanguage, userLevel } = req.body;
  return {
    word: word.trim(),
    sentence: sentence.trim(),
    paragraph: paragraph?.trim(),
    previousSentence: previousSentence?.trim(),
    nextSentence: nextSentence?.trim(),
    targetLanguage: targetLanguage || 'Hindi',
    userLevel: userLevel || 'intermediate',
  };
};

export const explainWordController = async (req: AuthRequest, res: Response): Promise<void> => {
  const { targetLanguage } = req.body;
  const explanation = await explainWord({
    ...getContextRequest(req),
    targetLanguage: targetLanguage || 'Hindi',
  });
  res.json({ success: true, data: explanation });
};

export const explainWordInContextController = async (req: AuthRequest, res: Response): Promise<void> => {
  const explanation = await explainWordInContext(getContextRequest(req));
  res.json({ success: true, data: { ...explanation, translation: '' } });
};

export const translateWordValidators = [
  body('word').trim().notEmpty().isLength({ max: 200 }).withMessage('Word is required'),
  body('targetLanguage').trim().isIn(supportedLanguages),
];

export const translateWordController = async (req: AuthRequest, res: Response): Promise<void> => {
  const translation = await translateWord(req.body.word.trim(), req.body.targetLanguage);
  res.json({ success: true, data: { translation } });
};

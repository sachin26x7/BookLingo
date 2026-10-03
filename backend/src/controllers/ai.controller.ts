import { Response } from 'express';
import { body } from 'express-validator';
import { explainWord } from '../services/ai.service';
import { AuthRequest } from '../middleware/auth.middleware';

export const explainWordValidators = [
  body('word').trim().notEmpty().isLength({ max: 200 }).withMessage('Word is required'),
  body('sentence').trim().notEmpty().isLength({ max: 2000 }).withMessage('Sentence is required'),
  body('paragraph').optional().trim().isLength({ max: 5000 }),
  body('previousSentence').optional().trim().isLength({ max: 2000 }),
  body('nextSentence').optional().trim().isLength({ max: 2000 }),
  body('targetLanguage').optional().trim().isLength({ max: 50 }),
  body('userLevel').optional().trim().isIn(['beginner', 'elementary', 'intermediate', 'advanced', 'proficient']),
];

export const explainWordController = async (req: AuthRequest, res: Response): Promise<void> => {
  const { word, sentence, paragraph, previousSentence, nextSentence, targetLanguage, userLevel } = req.body;

  const user = req.user;
  const explanation = await explainWord({
    word: word.trim(),
    sentence: sentence.trim(),
    paragraph: paragraph?.trim(),
    previousSentence: previousSentence?.trim(),
    nextSentence: nextSentence?.trim(),
    targetLanguage: targetLanguage || 'Hindi',
    userLevel: userLevel || 'intermediate',
  });

  res.json({ success: true, data: explanation });
};

import { Router } from 'express';
import {
  saveWord, getVocabulary, getVocabularyStats,
  getReviewQueue, updateWordReview, deleteWord, getWordById,
} from '../controllers/vocabulary.controller';
import { authenticate } from '../middleware/auth.middleware';
import { body, param, query } from 'express-validator';
import { handleValidationErrors } from '../middleware/error.middleware';

const router = Router();
router.use(authenticate);

router.post('/',
  body('bookId').isMongoId(),
  body('word').isString().trim().notEmpty().isLength({ max: 200 }),
  body('sentence').isString().trim().notEmpty().isLength({ max: 2000 }),
  body('paragraph').optional().isString().isLength({ max: 10000 }),
  body('pageNumber').isInt({ min: 1, max: 100000 }),
  body('contextualMeaning').isString().trim().notEmpty().isLength({ max: 5000 }),
  body('simpleExplanation').optional().isString().isLength({ max: 5000 }),
  body('translation').optional().isString().isLength({ max: 1000 }),
  body('targetLanguage').optional().isString().isLength({ max: 50 }),
  body('partOfSpeech').optional().isString().isLength({ max: 50 }),
  body('pronunciation').optional().isString().isLength({ max: 100 }),
  body('synonyms').optional().isArray({ max: 20 }),
  body('synonyms.*').optional().isString().isLength({ max: 100 }),
  body('exampleSentence').optional().isString().isLength({ max: 1000 }),
  handleValidationErrors,
  saveWord
);
router.get('/',
  query('page').optional().isInt({ min: 1, max: 10000 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('bookId').optional().isMongoId(),
  query('status').optional().isIn(['new', 'review', 'familiar', 'learned']),
  query('language').optional().isString().isLength({ max: 50 }),
  query('sort').optional().isIn(['newest', 'oldest', 'alphabetical', 'review']),
  query('search').optional().isString().isLength({ max: 100 }),
  handleValidationErrors,
  getVocabulary
);
router.get('/stats', getVocabularyStats);
router.get('/review-queue', query('limit').optional().isInt({ min: 1, max: 50 }), handleValidationErrors, getReviewQueue);
router.get('/:id', param('id').isMongoId(), handleValidationErrors, getWordById);
router.put('/:id',
  param('id').isMongoId(),
  body('reviewStatus').optional().isIn(['new', 'review', 'familiar', 'learned']),
  body('userNotes').optional().isString().isLength({ max: 5000 }),
  body('difficultyLevel').optional().isIn(['easy', 'medium', 'hard']),
  handleValidationErrors,
  updateWordReview
);
router.delete('/:id', param('id').isMongoId(), handleValidationErrors, deleteWord);

export default router;

import { Router } from 'express';
import {
  getProgress, upsertProgress, getReadingStats, getContinueReading,
} from '../controllers/progress.controller';
import { authenticate } from '../middleware/auth.middleware';
import { body, param } from 'express-validator';
import { handleValidationErrors } from '../middleware/error.middleware';

const router = Router();
router.use(authenticate);

router.get('/stats', getReadingStats);
router.get('/continue', getContinueReading);
router.get('/:bookId', param('bookId').isMongoId(), handleValidationErrors, getProgress);
router.put('/:bookId',
  param('bookId').isMongoId(),
  body('currentPage').isInt({ min: 1, max: 100000 }),
  body('totalPages').isInt({ min: 0, max: 100000 }),
  body('currentPage').custom((currentPage, { req }) => {
    const totalPages = Number(req.body.totalPages);
    return totalPages === 0 || Number(currentPage) <= totalPages;
  }),
  body('timeSpentMinutes').optional().isInt({ min: 0, max: 1440 }),
  handleValidationErrors,
  upsertProgress
);

export default router;

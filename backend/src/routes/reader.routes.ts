import { Router } from 'express';
import {
  createBookmark, getBookmarks, deleteBookmark,
  createAnnotation, getAnnotations, updateAnnotation, deleteAnnotation,
} from '../controllers/reader.controller';
import { authenticate } from '../middleware/auth.middleware';
import { body, param } from 'express-validator';
import { handleValidationErrors } from '../middleware/error.middleware';

const router = Router();
router.use(authenticate);

// Bookmarks
router.post('/bookmarks',
  body('bookId').isMongoId(),
  body('pageNumber').isInt({ min: 1, max: 100000 }),
  body('label').optional().isString().trim().isLength({ max: 100 }),
  body('note').optional().isString().isLength({ max: 5000 }),
  handleValidationErrors,
  createBookmark
);
router.get('/bookmarks/:bookId', param('bookId').isMongoId(), handleValidationErrors, getBookmarks);
router.delete('/bookmarks/:id', param('id').isMongoId(), handleValidationErrors, deleteBookmark);

// Annotations
router.post('/annotations',
  body('bookId').isMongoId(),
  body('pageNumber').isInt({ min: 1, max: 100000 }),
  body('selectedText').isString().trim().notEmpty().isLength({ max: 10000 }),
  body('note').optional().isString().isLength({ max: 5000 }),
  body('color').optional().isString().isLength({ max: 32 }),
  body('position').optional().isObject(),
  body('position.rects').optional().isArray({ max: 100 }),
  body('position.rects.*.x').optional().isFloat({ min: 0, max: 100000 }),
  body('position.rects.*.y').optional().isFloat({ min: 0, max: 100000 }),
  body('position.rects.*.width').optional().isFloat({ min: 0, max: 100000 }),
  body('position.rects.*.height').optional().isFloat({ min: 0, max: 100000 }),
  handleValidationErrors,
  createAnnotation
);
router.get('/annotations/:bookId', param('bookId').isMongoId(), handleValidationErrors, getAnnotations);
router.put('/annotations/:id',
  param('id').isMongoId(),
  body('note').optional().isString().isLength({ max: 5000 }),
  body('color').optional().isString().isLength({ max: 32 }),
  handleValidationErrors,
  updateAnnotation
);
router.delete('/annotations/:id', param('id').isMongoId(), handleValidationErrors, deleteAnnotation);

export default router;

import { Router } from 'express';
import {
  uploadBook, getBooks, getBook, serveBookFile,
  deleteBook, updateBookMetadata,
} from '../controllers/books.controller';
import { authenticate } from '../middleware/auth.middleware';
import { cleanupRejectedUpload, uploadPDF, validatePDFSignature } from '../middleware/upload.middleware';
import { body, param, query } from 'express-validator';
import { handleValidationErrors } from '../middleware/error.middleware';

const router = Router();
router.use(authenticate);

router.post(
  '/upload',
  uploadPDF.single('file'),
  validatePDFSignature,
  body('title').optional().isString().trim().isLength({ min: 1, max: 200 }),
  body('author').optional().isString().trim().isLength({ max: 100 }),
  cleanupRejectedUpload,
  handleValidationErrors,
  uploadBook
);
router.get('/', query('page').optional().isInt({ min: 1, max: 10000 }), query('limit').optional().isInt({ min: 1, max: 100 }), handleValidationErrors, getBooks);
router.get('/:id', param('id').isMongoId(), handleValidationErrors, getBook);
router.get('/:id/file', param('id').isMongoId(), handleValidationErrors, serveBookFile);
router.put(
  '/:id',
  param('id').isMongoId(),
  body('title').optional().isString().trim().notEmpty().isLength({ max: 200 }),
  body('author').optional().isString().trim().isLength({ max: 100 }),
  body('totalPages').optional().isInt({ min: 0, max: 100000 }),
  handleValidationErrors,
  updateBookMetadata
);
router.delete('/:id', param('id').isMongoId(), handleValidationErrors, deleteBook);

export default router;

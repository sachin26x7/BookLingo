import { Router } from 'express';
import {
  explainWordController,
  explainWordInContextController,
  explainWordValidators,
  translateWordController,
  translateWordValidators,
} from '../controllers/ai.controller';
import { authenticate } from '../middleware/auth.middleware';
import { handleValidationErrors } from '../middleware/error.middleware';

const router = Router();
router.use(authenticate);

router.post('/explain-word', explainWordValidators, handleValidationErrors, explainWordController);
router.post('/explain-context', explainWordValidators, handleValidationErrors, explainWordInContextController);
router.post('/translate-word', translateWordValidators, handleValidationErrors, translateWordController);

export default router;

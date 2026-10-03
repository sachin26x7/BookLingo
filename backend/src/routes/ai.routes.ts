import { Router } from 'express';
import { explainWordController, explainWordValidators } from '../controllers/ai.controller';
import { authenticate } from '../middleware/auth.middleware';
import { handleValidationErrors } from '../middleware/error.middleware';

const router = Router();
router.use(authenticate);

router.post('/explain-word', explainWordValidators, handleValidationErrors, explainWordController);

export default router;

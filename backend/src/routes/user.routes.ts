import { Router } from 'express';
import { getProfile, updateProfile, updatePreferences } from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';
import { body } from 'express-validator';
import { handleValidationErrors } from '../middleware/error.middleware';

const router = Router();
router.use(authenticate);

router.get('/profile', getProfile);
router.put('/profile',
	body('name').optional().isString().trim().notEmpty().isLength({ max: 100 }),
	body('preferredLanguage').optional().isIn(['English', 'Hindi', 'Bengali', 'Spanish', 'French', 'German', 'Arabic', 'Portuguese', 'Russian', 'Urdu', 'Chinese', 'Japanese', 'Italian', 'Korean']),
	body('proficiencyLevel').optional().isIn(['beginner', 'elementary', 'intermediate', 'advanced', 'proficient']),
	handleValidationErrors,
	updateProfile
);
router.put('/preferences',
	body('theme').optional().isIn(['light', 'dark', 'sepia']),
	body('readingPreferences').optional().isObject(),
	body('readingPreferences.fontSize').optional().isInt({ min: 12, max: 24 }),
	body('readingPreferences.pageWidth').optional().isInt({ min: 600, max: 1200 }),
	body('readingPreferences.focusMode').optional().isBoolean(),
	body('vocabularySettings').optional().isObject(),
	body('vocabularySettings.showPronunciation').optional().isBoolean(),
	body('vocabularySettings.autoSave').optional().isBoolean(),
	body('vocabularySettings.reviewReminders').optional().isBoolean(),
	handleValidationErrors,
	updatePreferences
);

export default router;

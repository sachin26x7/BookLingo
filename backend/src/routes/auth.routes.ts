import { Router } from 'express';
import {
  register,
  verifyEmail,
  resendVerification,
  login,
  logout,
  refreshToken,
  forgotPassword,
  resetPassword,
  changePassword,
  registerValidators,
  loginValidators,
  verifyEmailValidators,
  resendVerificationValidators,
  forgotPasswordValidators,
  resetPasswordValidators,
  changePasswordValidators,
} from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { handleValidationErrors } from '../middleware/error.middleware';

const router = Router();

router.post('/register', registerValidators, handleValidationErrors, register);
router.post('/verify-email', verifyEmailValidators, handleValidationErrors, verifyEmail);
router.post('/resend-verification', resendVerificationValidators, handleValidationErrors, resendVerification);
router.post('/login', loginValidators, handleValidationErrors, login);
router.post('/refresh-token', refreshToken);
router.post('/logout', authenticate, logout);
router.post('/forgot-password', forgotPasswordValidators, handleValidationErrors, forgotPassword);
router.post('/reset-password', resetPasswordValidators, handleValidationErrors, resetPassword);
router.put('/change-password', authenticate, changePasswordValidators, handleValidationErrors, changePassword);

export default router;

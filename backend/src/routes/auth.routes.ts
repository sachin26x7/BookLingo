import { Router, type RequestHandler } from 'express';
import { performance } from 'node:perf_hooks';
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

const trackRegisterRequest: RequestHandler = (_req, res, next) => {
  const startedAt = performance.now();
  res.locals.registerStartedAt = startedAt;
  console.info('[REGISTER] Request received');
  res.once('finish', () => {
    console.info('[REGISTER] Total time:', {
      durationMs: Math.round(performance.now() - startedAt),
      statusCode: res.statusCode,
    });
  });
  next();
};

const startRegisterValidation: RequestHandler = (_req, res, next) => {
  res.locals.registerValidationStartedAt = performance.now();
  next();
};

const logRegisterValidation: RequestHandler = (_req, res, next) => {
  const startedAt = res.locals.registerValidationStartedAt as number | undefined;
  if (startedAt !== undefined) {
    console.info('[REGISTER] Validation completed:', {
      durationMs: Math.round(performance.now() - startedAt),
    });
  }
  next();
};

router.post(
  '/register',
  trackRegisterRequest,
  startRegisterValidation,
  registerValidators,
  logRegisterValidation,
  handleValidationErrors,
  register
);
router.post('/verify-email', verifyEmailValidators, handleValidationErrors, verifyEmail);
router.post('/resend-verification', resendVerificationValidators, handleValidationErrors, resendVerification);
router.post('/login', loginValidators, handleValidationErrors, login);
router.post('/refresh-token', refreshToken);
router.post('/logout', authenticate, logout);
router.post('/forgot-password', forgotPasswordValidators, handleValidationErrors, forgotPassword);
router.post('/reset-password', resetPasswordValidators, handleValidationErrors, resetPassword);
router.put('/change-password', authenticate, changePasswordValidators, handleValidationErrors, changePassword);

export default router;

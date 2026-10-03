import { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { body } from 'express-validator';
import { User } from '../models/User';
import {
  generateTokens,
  storeRefreshToken,
  verifyRefreshToken,
  getStoredRefreshToken,
  revokeRefreshToken,
} from '../services/token.service';
import {
  queueOtpEmail,
  verifyOTP,
} from '../services/email.service';
import { AuthRequest } from '../middleware/auth.middleware';
import { config } from '../config';

const emailField = () => body('email').isString().trim().isEmail().normalizeEmail();
const passwordField = (field: string) => body(field)
  .isString()
  .isLength({ min: 8, max: 72 })
  .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
  .custom((value: string) => Buffer.byteLength(value, 'utf8') <= 72)
  .withMessage('Password must be 8-72 bytes and contain uppercase, lowercase, and number');

export const registerValidators = [
  body('name').isString().trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  emailField(),
  passwordField('password'),
  body('preferredLanguage').optional().isString().isLength({ max: 50 }),
  body('proficiencyLevel').optional().isIn(['beginner', 'elementary', 'intermediate', 'advanced', 'proficient']),
];

export const loginValidators = [
  emailField(),
  body('password').isString().notEmpty().custom((value: string) => Buffer.byteLength(value, 'utf8') <= 72),
];

export const verifyEmailValidators = [emailField(), body('otp').isString().matches(/^\d{6}$/)];
export const resendVerificationValidators = [emailField()];
export const forgotPasswordValidators = [emailField()];
export const resetPasswordValidators = [emailField(), body('otp').isString().matches(/^\d{6}$/), passwordField('newPassword')];
export const changePasswordValidators = [
  body('currentPassword').isString().notEmpty().custom((value: string) => Buffer.byteLength(value, 'utf8') <= 72),
  passwordField('newPassword'),
];

const refreshCookieOptions = {
  httpOnly: true,
  secure: config.nodeEnv === 'production',
  sameSite: 'strict' as const,
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};
const dummyPasswordHash = bcrypt.hashSync(randomBytes(32).toString('hex'), 12);

const respondToEmailFailure = (res: Response, operation: string, error: unknown): void => {
  console.error(`[OTP] ${operation} failed`, {
    errorName: error instanceof Error ? error.name : 'UnknownError',
  });
  const message = error instanceof Error ? error.message : '';
  const rateLimited = message.startsWith('Too many OTP requests.') || message.startsWith('Too many requests.');
  const retryAfterSeconds = (error as { retryAfterSeconds?: number }).retryAfterSeconds || 60;
  const emailNotConfigured = message.startsWith('EMAIL_USER and EMAIL_PASS must be configured')
    || message.startsWith('EMAIL_FROM must be set to a sender address verified with Resend');

  res.status(rateLimited ? 429 : 503).json({
    success: false,
    message: rateLimited
      ? `Please wait ${retryAfterSeconds} seconds before requesting another code.`
      : emailNotConfigured
        ? 'Email is not configured on the server. Configure the backend email settings and redeploy.'
        : 'Unable to queue email right now. Please try again later.',
    ...(rateLimited && { retryAfterSeconds }),
  });
};

export const register = async (req: Request, res: Response): Promise<void> => {
  const { name, email, password, preferredLanguage, proficiencyLevel } = req.body;

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    await bcrypt.hash(password, 12);
    if (!existing.isEmailVerified) {
      try {
        await queueOtpEmail(email, existing.name, 'email_verify');
      } catch (error) {
        respondToEmailFailure(res, 'Verification email queueing', error);
        return;
      }
    }
    res.status(201).json({
      success: true,
      message: 'If registration can be completed, a verification code is on its way.',
      resendAfterSeconds: config.otp.resendCooldownSeconds,
    });
    return;
  }

  const user = new User({
    name,
    email: email.toLowerCase(),
    passwordHash: password, // will be hashed by pre-save hook
    preferredLanguage: preferredLanguage || 'Hindi',
    proficiencyLevel: proficiencyLevel || 'intermediate',
  });

  await user.save();

  try {
    await queueOtpEmail(email, name, 'email_verify');
  } catch (error) {
    respondToEmailFailure(res, 'Verification email queueing', error);
    return;
  }

  res.status(201).json({
    success: true,
    message: 'If registration can be completed, a verification code is on its way.',
    resendAfterSeconds: config.otp.resendCooldownSeconds,
  });
};

export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  const { email, otp } = req.body;

  const verification = await verifyOTP(email, otp, 'email_verify');
  if (verification !== 'valid') {
    const locked = verification === 'too_many_attempts';
    res.status(locked ? 429 : 400).json({
      success: false,
      message: locked
        ? 'Too many incorrect codes. Request a new code before trying again.'
        : verification === 'expired'
          ? 'This code has expired. Request a new code and try again.'
          : 'That code is incorrect. Please check it and try again.',
    });
    return;
  }

  await User.findOneAndUpdate(
    { email: email.toLowerCase() },
    { isEmailVerified: true }
  );

  res.json({ success: true, message: 'Email verified successfully' });
};

export const resendVerification = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() });
  if (user && !user.isEmailVerified) {
    try {
      const queued = await queueOtpEmail(email, user.name, 'email_verify');
      res.json({
        success: true,
        message: 'If the address can be verified, a code will be sent.',
        resendAfterSeconds: queued.resendAfterSeconds,
      });
      return;
    } catch (error) {
      respondToEmailFailure(res, 'Verification email queueing', error);
      return;
    }
  }

  res.json({
    success: true,
    message: 'If the address can be verified, a code will be sent.',
    resendAfterSeconds: config.otp.resendCooldownSeconds,
  });
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash +tokenVersion');
  if (!user) {
    await bcrypt.compare(password, dummyPasswordHash);
    res.status(401).json({ success: false, message: 'Invalid email or password' });
    return;
  }

  const isValid = await user.comparePassword(password);
  if (!isValid) {
    res.status(401).json({ success: false, message: 'Invalid email or password' });
    return;
  }

  if (!user.isEmailVerified) {
    res.status(403).json({ success: false, message: 'Please verify your email before signing in.', code: 'EMAIL_NOT_VERIFIED' });
    return;
  }

  const { accessToken, refreshToken } = generateTokens({
    userId: (user._id as any).toString(),
    email: user.email,
    tokenVersion: user.tokenVersion ?? 0,
  });

  await storeRefreshToken((user._id as any).toString(), refreshToken);

  // Set refresh token as httpOnly cookie
  res.cookie('refreshToken', refreshToken, refreshCookieOptions);

  res.json({
    success: true,
    data: {
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isEmailVerified: user.isEmailVerified,
        preferredLanguage: user.preferredLanguage,
        proficiencyLevel: user.proficiencyLevel,
        theme: user.theme,
        readingPreferences: user.readingPreferences,
        vocabularySettings: user.vocabularySettings,
      },
    },
  });
};

export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  const token = req.cookies?.refreshToken;

  if (!token) {
    res.status(401).json({ success: false, message: 'Refresh token required' });
    return;
  }

  try {
    const payload = verifyRefreshToken(token);
    const storedToken = await getStoredRefreshToken(payload.userId);
    const user = await User.findById(payload.userId).select('+tokenVersion');

    if (!user || !user.isEmailVerified || (payload.tokenVersion ?? 0) !== (user.tokenVersion ?? 0) || !storedToken || storedToken !== token) {
      res.status(401).json({ success: false, message: 'Invalid refresh token' });
      return;
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens({
      userId: payload.userId,
      email: user.email,
      tokenVersion: user.tokenVersion ?? 0,
    });

    await storeRefreshToken(payload.userId, newRefreshToken);

    res.cookie('refreshToken', newRefreshToken, refreshCookieOptions);

    res.json({ success: true, data: { accessToken } });
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
  }
};

export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.user) {
    await User.updateOne({ _id: req.user.userId }, { $inc: { tokenVersion: 1 } });
    await revokeRefreshToken(req.user.userId);
  }

  res.clearCookie('refreshToken', { ...refreshCookieOptions, maxAge: undefined });
  res.json({ success: true, message: 'Logged out successfully' });
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() });
  // Always return success to prevent email enumeration
  if (!user) {
    res.json({ success: true, message: 'If that email exists, a reset code has been sent.' });
    return;
  }

  if (user) {
    try {
      await queueOtpEmail(email, user.name, 'password_reset');
    } catch (error) {
      respondToEmailFailure(res, 'Password reset email queueing', error);
      return;
    }
  }

  res.json({ success: true, message: 'If that email exists, a reset code has been sent.' });
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  const { email, otp, newPassword } = req.body;

  const verification = await verifyOTP(email, otp, 'password_reset');
  if (verification !== 'valid') {
    const locked = verification === 'too_many_attempts';
    res.status(locked ? 429 : 400).json({
      success: false,
      message: locked
        ? 'Too many incorrect codes. Request a new code before trying again.'
        : verification === 'expired'
          ? 'This code has expired. Request a new code and try again.'
          : 'That code is incorrect. Please check it and try again.',
    });
    return;
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    res.status(404).json({ success: false, message: 'User not found' });
    return;
  }

  user.passwordHash = newPassword; // pre-save hook will hash it
  await user.save();
  await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });

  // Revoke all sessions
  await revokeRefreshToken((user._id as any).toString());

  res.json({ success: true, message: 'Password reset successfully' });
};

export const changePassword = async (req: AuthRequest, res: Response): Promise<void> => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user?.userId).select('+passwordHash');
  if (!user) {
    res.status(404).json({ success: false, message: 'User not found' });
    return;
  }

  const isValid = await user.comparePassword(currentPassword);
  if (!isValid) {
    res.status(400).json({ success: false, message: 'Current password is incorrect' });
    return;
  }

  user.passwordHash = newPassword;
  await user.save();
  const userId = (user._id as any).toString();
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
  await revokeRefreshToken(userId);

  const updatedUser = await User.findById(userId).select('+tokenVersion');
  if (!updatedUser) {
    res.status(404).json({ success: false, message: 'User not found' });
    return;
  }
  const tokens = generateTokens({
    userId,
    email: updatedUser.email,
    tokenVersion: updatedUser.tokenVersion ?? 0,
  });
  await storeRefreshToken(userId, tokens.refreshToken);
  res.cookie('refreshToken', tokens.refreshToken, refreshCookieOptions);

  res.json({ success: true, data: { accessToken: tokens.accessToken }, message: 'Password changed successfully' });
};

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
  sendVerificationEmail,
  sendPasswordResetEmail,
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
  console.error(`[Email] ${operation} failed:`, error);
  const message = error instanceof Error ? error.message : '';
  const rateLimited = message.startsWith('Too many OTP requests.') || message.startsWith('Too many requests.');

  res.status(rateLimited ? 429 : 503).json({
    success: false,
    message: rateLimited ? message : 'Unable to send email right now. Please try again later.',
  });
};

export const register = async (req: Request, res: Response): Promise<void> => {
  const { name, email, password, preferredLanguage, proficiencyLevel } = req.body;

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    await bcrypt.hash(password, 12);
    if (!existing.isEmailVerified) {
      try {
        await sendVerificationEmail(email, existing.name);
      } catch (error) {
        respondToEmailFailure(res, 'Verification email delivery', error);
        return;
      }
    }
    res.status(201).json({ success: true, message: 'If registration can be completed, check your email for next steps.' });
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
    await sendVerificationEmail(email, name);
  } catch (error) {
    respondToEmailFailure(res, 'Verification email delivery', error);
    return;
  }

  res.status(201).json({
    success: true,
    message: 'If registration can be completed, check your email for next steps.',
  });
};

export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  const { email, otp } = req.body;

  const isValid = await verifyOTP(email, otp, 'email_verify');
  if (!isValid) {
    res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
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
      await sendVerificationEmail(email, user.name);
    } catch (error) {
      respondToEmailFailure(res, 'Verification email delivery', error);
      return;
    }
  }

  res.json({ success: true, message: 'If the address can be verified, a code will be sent.' });
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
      await sendPasswordResetEmail(email, user.name);
    } catch (error) {
      respondToEmailFailure(res, 'Password reset email delivery', error);
      return;
    }
  }

  res.json({ success: true, message: 'If that email exists, a reset code has been sent.' });
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  const { email, otp, newPassword } = req.body;

  const isValid = await verifyOTP(email, otp, 'password_reset');
  if (!isValid) {
    res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
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

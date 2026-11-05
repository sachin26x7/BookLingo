import { Request, Response } from 'express';
import { createHash, randomBytes } from 'crypto';
import { performance } from 'node:perf_hooks';
import bcrypt from 'bcryptjs';
import { body } from 'express-validator';
import { User, type IUser } from '../models/User';
import { PasswordResetToken } from '../models/PasswordResetToken';
import {
  generateTokens,
  storeRefreshToken,
  verifyRefreshToken,
  getStoredRefreshTokenHash,
  revokeRefreshToken,
} from '../services/token.service';
import { sendPasswordResetEmail } from '../services/email.service';
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

export const forgotPasswordValidators = [emailField()];
export const resetPasswordValidators = [
  emailField(),
  body('token').isString().matches(/^[a-f\d]{64}$/i),
  passwordField('newPassword'),
];
export const changePasswordValidators = [
  body('currentPassword').isString().notEmpty().custom((value: string) => Buffer.byteLength(value, 'utf8') <= 72),
  passwordField('newPassword'),
];

const refreshCookieOptions = {
  httpOnly: true,
  secure: config.nodeEnv === 'production',
  sameSite: config.nodeEnv === 'production' ? 'none' as const : 'strict' as const,
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};
const dummyPasswordHash = bcrypt.hashSync(randomBytes(32).toString('hex'), 12);

const createSession = async (user: IUser, res: Response): Promise<void> => {
  const userId = (user._id as any).toString();
  const { accessToken, refreshToken } = generateTokens({
    userId,
    email: user.email,
    tokenVersion: user.tokenVersion ?? 0,
  });
  await storeRefreshToken(userId, refreshToken);
  res.cookie('refreshToken', refreshToken, refreshCookieOptions);
  res.json({
    success: true,
    data: {
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        preferredLanguage: user.preferredLanguage,
        proficiencyLevel: user.proficiencyLevel,
        theme: user.theme,
        readingPreferences: user.readingPreferences,
        vocabularySettings: user.vocabularySettings,
      },
    },
  });
};

export const register = async (req: Request, res: Response): Promise<void> => {
  const { name, email, password, preferredLanguage, proficiencyLevel } = req.body;

  let stepStartedAt = performance.now();
  const existing = await User.findOne({ email: email.toLowerCase() });
  console.info('[REGISTER] User lookup completed:', {
    durationMs: Math.round(performance.now() - stepStartedAt),
  });
  if (existing) {
    res.status(409).json({
      success: false,
      message: 'An account with this email already exists. Please sign in or reset your password.',
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

  stepStartedAt = performance.now();
  try {
    await user.save();
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    console.info('[REGISTER] Concurrent duplicate registration detected');
    res.status(409).json({
      success: false,
      message: 'An account with this email already exists. Please sign in or reset your password.',
    });
    return;
  }
  console.info('[REGISTER] User creation completed:', {
    durationMs: Math.round(performance.now() - stepStartedAt),
  });

  res.status(201);
  await createSession(user, res);
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

  await createSession(user, res);
};

export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  const token = req.cookies?.refreshToken;

  if (!token) {
    res.status(401).json({ success: false, message: 'Refresh token required' });
    return;
  }

  try {
    const payload = verifyRefreshToken(token);
    const storedTokenHash = await getStoredRefreshTokenHash(payload.userId);
    const user = await User.findById(payload.userId).select('+tokenVersion');

    const tokenHash = createHash('sha256').update(token).digest('hex');
    if (!user || (payload.tokenVersion ?? 0) !== (user.tokenVersion ?? 0) || !storedTokenHash || storedTokenHash !== tokenHash) {
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

  let stepStartedAt = performance.now();
  const user = await User.findOne({ email: email.toLowerCase() });
  console.info('[PASSWORD_RESET] User lookup completed:', {
    durationMs: Math.round(performance.now() - stepStartedAt),
  });
  if (!user) {
    res.json({ success: true, message: 'If that email exists, a password reset link has been sent.' });
    return;
  }

  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await PasswordResetToken.deleteMany({ email: user.email });
  await PasswordResetToken.create({
    email: user.email,
    tokenHash,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  try {
    stepStartedAt = performance.now();
    await sendPasswordResetEmail(user.email, user.name, token);
    console.info('[PASSWORD_RESET] Email sent:', {
      durationMs: Math.round(performance.now() - stepStartedAt),
    });
  } catch (error) {
    await PasswordResetToken.deleteOne({ email: user.email, tokenHash });
    console.error('[PASSWORD_RESET] Email send failed:', error instanceof Error ? error.message : 'Unknown error');
    res.status(503).json({
      success: false,
      message: 'Unable to send a password reset link right now. Please try again later.',
    });
    return;
  }

  res.json({ success: true, message: 'If that email exists, a password reset link has been sent.' });
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  const { email, token, newPassword } = req.body;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const resetToken = await PasswordResetToken.findOneAndDelete({
    email: email.toLowerCase(),
    tokenHash,
    expiresAt: { $gt: new Date() },
  });
  if (!resetToken) {
    res.status(400).json({ success: false, message: 'This password reset link is invalid or expired.' });
    return;
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    res.status(400).json({ success: false, message: 'This password reset link is invalid or expired.' });
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

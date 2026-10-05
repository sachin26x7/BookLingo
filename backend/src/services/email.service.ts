import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config';
import { OTPRecord, type OTPType } from '../models/OTPRecord';
import { OTPThrottleState } from '../models/OTPThrottleState';
import { sendEmail, verifySMTP } from '../utils/sendEmail';

interface OtpEmailPayload {
  email: string;
  name: string;
  otp: string;
  type: 'password_reset';
}

export type OTPVerificationResult = 'valid' | 'invalid' | 'expired' | 'too_many_attempts';

class OtpRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super(`Too many OTP requests. Try again in ${retryAfterSeconds} seconds.`);
    this.name = 'OtpRateLimitError';
  }
}

class EmailConfigurationError extends Error {
  constructor(message: string) {
    super(`EMAIL_CONFIGURATION_ERROR: ${message}`);
    this.name = 'EmailConfigurationError';
  }
}

const assertEmailConfiguration = (): void => {
  const errors = [
    !config.email.user && 'SMTP_USER is required.',
    !config.email.pass && 'SMTP_PASS is required.',
  ].filter(Boolean);
  if (errors.length) throw new EmailConfigurationError(errors.join(' '));
};

const generateOTP = (): string => crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!));

const reserveOtpSend = async (identifier: string, type: OTPType): Promise<void> => {
  const now = new Date();
  const windowMs = config.otp.windowMinutes * 60 * 1000;
  const windowStart = new Date(now.getTime() - windowMs);
  const cooldownStart = new Date(now.getTime() - config.otp.resendCooldownSeconds * 1000);
  const stateId = crypto.createHash('sha256')
    .update(`${type}:${identifier.toLowerCase()}`)
    .digest('hex');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const allowed = await OTPThrottleState.findOneAndUpdate(
      {
        _id: stateId,
        windowStartedAt: { $gt: windowStart },
        lastSentAt: { $lte: cooldownStart },
        sendCount: { $lt: config.otp.maxAttempts },
      },
      {
        $inc: { sendCount: 1 },
        $set: {
          lastSentAt: now,
          expiresAt: new Date(now.getTime() + windowMs),
        },
      },
      { returnDocument: 'after' }
    ).lean();
    if (allowed) return;

    const reset = await OTPThrottleState.findOneAndUpdate(
      { _id: stateId, windowStartedAt: { $lte: windowStart } },
      {
        $set: {
          sendCount: 1,
          windowStartedAt: now,
          lastSentAt: now,
          expiresAt: new Date(now.getTime() + windowMs),
        },
      },
      { returnDocument: 'after' }
    ).lean();
    if (reset) return;

    try {
      await OTPThrottleState.create({
        _id: stateId,
        sendCount: 1,
        windowStartedAt: now,
        lastSentAt: now,
        expiresAt: new Date(now.getTime() + windowMs),
      });
      return;
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
  }

  const state = await OTPThrottleState.findById(stateId).lean();
  const retryAt = state
    ? state.sendCount >= config.otp.maxAttempts
      ? new Date(state.windowStartedAt.getTime() + windowMs)
      : new Date(state.lastSentAt.getTime() + config.otp.resendCooldownSeconds * 1000)
    : new Date(now.getTime() + config.otp.resendCooldownSeconds * 1000);
  throw new OtpRateLimitError(Math.max(1, Math.ceil((retryAt.getTime() - Date.now()) / 1000)));
};

const sendResetEmail = async (payload: OtpEmailPayload): Promise<void> => {
  const escapedName = escapeHtml(payload.name);
  await sendEmail({
    to: payload.email,
    subject: 'Reset your BookLingo password',
    text: `Hello ${payload.name},\n\nYour password reset code is ${payload.otp}. It expires in ${config.otp.expiryMinutes} minutes.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;color:#2d2d2d"><h1>Password reset</h1><p>Hello ${escapedName},</p><p>Your password reset code is:</p><p style="font-size:32px;font-weight:bold;letter-spacing:8px">${payload.otp}</p><p>It expires in ${config.otp.expiryMinutes} minutes.</p></div>`,
  });
};

export const sendVerificationEmail = async (email: string, name: string): Promise<void> => {
  assertEmailConfiguration();
  const normalizedEmail = email.toLowerCase();
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const now = new Date();
  await OTPRecord.updateMany(
    { identifier: normalizedEmail, type: 'email_verify', isUsed: false },
    { $set: { isUsed: true } }
  );
  await OTPRecord.findOneAndUpdate(
    { identifier: normalizedEmail, type: 'email_verify' },
    {
      $set: {
        otpHash: tokenHash,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        attempts: 0,
        isUsed: false,
        challengeId: crypto.randomUUID(),
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true, returnDocument: 'after', sort: { updatedAt: -1 } }
  );

  const verificationUrl = new URL('/verify-email', config.clientUrl);
  verificationUrl.searchParams.set('email', normalizedEmail);
  verificationUrl.searchParams.set('token', token);
  const link = verificationUrl.toString();
  await sendEmail({
    to: normalizedEmail,
    subject: 'Verify your BookLingo account',
    text: `Hello ${name},\n\nVerify your BookLingo email address by opening this link:\n${link}\n\nThis link expires in 24 hours. If you did not create this account, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;color:#2d2d2d"><h1>Verify your BookLingo email</h1><p>Hello ${escapeHtml(name)},</p><p>Confirm your email address to finish creating your account.</p><p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 20px;background:#5c4a32;color:#fff;text-decoration:none;border-radius:6px">Verify email</a></p><p>This link expires in 24 hours. If you did not create this account, you can ignore this email.</p></div>`,
  });
};

export const verifyEmailToken = async (
  identifier: string,
  token: string
): Promise<OTPVerificationResult> => {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const now = new Date();
  const record = await OTPRecord.findOne({
    identifier: identifier.toLowerCase(),
    type: 'email_verify',
    isUsed: false,
    expiresAt: { $gt: now },
  }).select('+otpHash').sort({ updatedAt: -1 });
  if (!record) return 'expired';

  const attempt = await OTPRecord.updateOne(
    {
      _id: record._id,
      challengeId: record.challengeId,
      isUsed: false,
      attempts: { $lt: config.otp.verifyMaxAttempts },
      expiresAt: { $gt: now },
    },
    { $inc: { attempts: 1 } }
  );
  if (attempt.modifiedCount !== 1) return 'too_many_attempts';
  if (record.otpHash !== tokenHash) return 'invalid';

  const consumed = await OTPRecord.updateOne(
    {
      _id: record._id,
      challengeId: record.challengeId,
      isUsed: false,
      expiresAt: { $gt: new Date() },
    },
    { $set: { isUsed: true } }
  );
  return consumed.modifiedCount === 1 ? 'valid' : 'expired';
};

export const queueOtpEmail = async (
  email: string,
  name: string,
  type: 'password_reset'
): Promise<{ resendAfterSeconds: number }> => {
  const normalizedEmail = email.toLowerCase();
  assertEmailConfiguration();
  await reserveOtpSend(normalizedEmail, type);

  const otp = generateOTP();
  const otpHash = await bcrypt.hash(otp, 10);
  const now = new Date();
  await OTPRecord.updateMany(
    { identifier: normalizedEmail, type, isUsed: false },
    { $set: { isUsed: true } }
  );
  await OTPRecord.findOneAndUpdate(
    { identifier: normalizedEmail, type },
    {
      $set: {
        otpHash,
        expiresAt: new Date(now.getTime() + config.otp.expiryMinutes * 60 * 1000),
        attempts: 0,
        isUsed: false,
        challengeId: crypto.randomUUID(),
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true, returnDocument: 'after', sort: { updatedAt: -1 } }
  );
  await sendResetEmail({ email: normalizedEmail, name, otp, type });
  return { resendAfterSeconds: config.otp.resendCooldownSeconds };
};

export const verifyOTP = async (
  identifier: string,
  otp: string,
  type: OTPType
): Promise<OTPVerificationResult> => {
  const normalizedIdentifier = identifier.toLowerCase();
  const now = new Date();
  const record = await OTPRecord.findOne({
    identifier: normalizedIdentifier,
    type,
    isUsed: false,
    expiresAt: { $gt: now },
  }).select('+otpHash').sort({ updatedAt: -1 });

  if (!record) {
    const previousChallenge = await OTPRecord.findOne({
      identifier: normalizedIdentifier,
      type,
    }).sort({ updatedAt: -1 });
    return previousChallenge && previousChallenge.attempts >= config.otp.verifyMaxAttempts
      ? previousChallenge.expiresAt > now ? 'too_many_attempts' : 'expired'
      : 'expired';
  }

  const attempt = await OTPRecord.updateOne(
    {
      _id: record._id,
      challengeId: record.challengeId,
      isUsed: false,
      attempts: { $lt: config.otp.verifyMaxAttempts },
      expiresAt: { $gt: now },
    },
    { $inc: { attempts: 1 } }
  );
  if (attempt.modifiedCount !== 1) return 'too_many_attempts';
  if (!await bcrypt.compare(otp, record.otpHash)) return 'invalid';

  const consumed = await OTPRecord.updateOne(
    {
      _id: record._id,
      challengeId: record.challengeId,
      isUsed: false,
      expiresAt: { $gt: new Date() },
    },
    { $set: { isUsed: true } }
  );
  return consumed.modifiedCount === 1 ? 'valid' : 'expired';
};

export const initializeEmailService = async (): Promise<void> => {
  try {
    assertEmailConfiguration();
    await verifySMTP();
    console.info('SMTP ready');
  } catch (error) {
    console.error('SMTP verification failed:', error);
  }
};

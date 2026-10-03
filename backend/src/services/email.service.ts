import crypto from 'crypto';
import nodemailer from 'nodemailer';
import bcrypt from 'bcryptjs';
import { config } from '../config';
import { redisIncr, redisExpire, redisTtl } from '../config/redis';
import { OTPRecord, OTPType } from '../models/OTPRecord';

const generateOTP = (): string => {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
};

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!));

const storeOTP = async (identifier: string, type: OTPType, otpHash: string, expiresAt: Date): Promise<void> => {
  await OTPRecord.collection.updateOne(
    { identifier: identifier.toLowerCase(), type },
    { $set: { otpHash, expiresAt, attempts: 0, isUsed: false } },
    { upsert: true }
  );
};

const createTransporter = () => {
  return nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: false,
    auth: {
      user: config.email.user,
      pass: config.email.pass,
    },
  });
};

export const checkOTPRateLimit = async (identifier: string): Promise<{ allowed: boolean; remaining: number; resetIn: number }> => {
  const normalizedIdentifier = identifier.toLowerCase();
  const identifierHash = crypto.createHash('sha256').update(normalizedIdentifier).digest('hex');
  const rateLimitKey = `otp-rate:${identifierHash}`;
  const count = await redisIncr(rateLimitKey);

  if (count === 1) {
    await redisExpire(rateLimitKey, config.otp.windowMinutes * 60);
  }

  const ttl = await redisTtl(rateLimitKey);
  const remaining = Math.max(0, config.otp.maxAttempts - count);

  return {
    allowed: count <= config.otp.maxAttempts,
    remaining,
    resetIn: ttl > 0 ? ttl : 0,
  };
};

export const sendVerificationEmail = async (email: string, name: string): Promise<void> => {
  const rateCheck = await checkOTPRateLimit(`email:${email}`);
  if (!rateCheck.allowed) {
    const resetMinutes = Math.ceil(rateCheck.resetIn / 60);
    throw new Error(`Too many OTP requests. Try again in ${resetMinutes} minutes.`);
  }

  const otp = generateOTP();
  const hash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + config.otp.expiryMinutes * 60 * 1000);

  // Store in DB (as backup) and Redis
  await storeOTP(email, 'email_verify', hash, expiresAt);

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: config.email.from,
      to: email,
      subject: 'Verify your BookReader account',
      html: `
        <div style="font-family: 'Georgia', serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; background: #faf8f5; color: #2d2d2d;">
          <h1 style="font-size: 24px; color: #5c4a32; margin-bottom: 8px;">Welcome to BookReader</h1>
          <p style="color: #6b6b6b; margin-bottom: 32px;">Hello ${escapeHtml(name)}, verify your email to start reading.</p>
          <div style="background: #fff; border: 1px solid #e8e0d5; border-radius: 12px; padding: 32px; text-align: center;">
            <p style="color: #6b6b6b; font-size: 14px; margin-bottom: 16px;">Your verification code is:</p>
            <div style="font-size: 40px; font-weight: bold; letter-spacing: 12px; color: #5c4a32; font-family: monospace;">${otp}</div>
            <p style="color: #999; font-size: 13px; margin-top: 16px;">Expires in ${config.otp.expiryMinutes} minutes</p>
          </div>
          <p style="color: #aaa; font-size: 12px; margin-top: 24px; text-align: center;">If you didn't create an account, you can safely ignore this email.</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('Email send failed');
    // Don't throw — OTP is stored in DB, user can request resend
  }
};

export const sendPasswordResetEmail = async (email: string, name: string): Promise<void> => {
  const rateCheck = await checkOTPRateLimit(`email:${email}`);
  if (!rateCheck.allowed) {
    throw new Error(`Too many requests. Please try again later.`);
  }

  const otp = generateOTP();
  const hash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + config.otp.expiryMinutes * 60 * 1000);

  await storeOTP(email, 'password_reset', hash, expiresAt);

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: config.email.from,
      to: email,
      subject: 'Reset your BookReader password',
      html: `
        <div style="font-family: 'Georgia', serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; background: #faf8f5; color: #2d2d2d;">
          <h1 style="font-size: 24px; color: #5c4a32;">Password Reset</h1>
          <p style="color: #6b6b6b;">Hello ${escapeHtml(name)}, use this code to reset your password.</p>
          <div style="background: #fff; border: 1px solid #e8e0d5; border-radius: 12px; padding: 32px; text-align: center; margin: 24px 0;">
            <div style="font-size: 40px; font-weight: bold; letter-spacing: 12px; color: #5c4a32; font-family: monospace;">${otp}</div>
            <p style="color: #999; font-size: 13px; margin-top: 16px;">Expires in ${config.otp.expiryMinutes} minutes</p>
          </div>
        </div>
      `,
    });
  } catch (err) {
    console.error('Password reset email failed');
  }
};

export const verifyOTP = async (identifier: string, otp: string, type: OTPType): Promise<boolean> => {
  const normalizedIdentifier = identifier.toLowerCase();
  const now = new Date();
  const record = await OTPRecord.collection.findOne({
    identifier: normalizedIdentifier,
    type,
    isUsed: false,
    expiresAt: { $gt: now },
  });

  if (!record) return false;

  const attempt = await OTPRecord.collection.updateOne(
    { _id: record._id, isUsed: false, attempts: { $lt: 5 }, expiresAt: { $gt: now } },
    { $inc: { attempts: 1 } }
  );
  if (attempt.modifiedCount !== 1) return false;

  if (!await bcrypt.compare(otp, record.otpHash)) return false;

  const consumed = await OTPRecord.collection.updateOne(
    { _id: record._id, isUsed: false, expiresAt: { $gt: new Date() } },
    { $set: { isUsed: true } }
  );
  return consumed.modifiedCount === 1;
};

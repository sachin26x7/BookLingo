import dotenv from 'dotenv';
dotenv.config();

const loadJwtSecret = (name: string): string => {
  const value = process.env[name];
  if (!value || Buffer.byteLength(value) < 32) {
    throw new Error(`${name} must be configured with at least 32 bytes of random data`);
  }
  return value;
};

const accessSecret = loadJwtSecret('JWT_ACCESS_SECRET');
const refreshSecret = loadJwtSecret('JWT_REFRESH_SECRET');
if (accessSecret === refreshSecret) {
  throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
}

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI || '',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  jwt: {
    accessSecret,
    refreshSecret,
    accessExpire: process.env.JWT_ACCESS_EXPIRE || '15m',
    refreshExpire: process.env.JWT_REFRESH_EXPIRE || '7d',
  },
  email: {
    host: process.env.SMTP_HOST || process.env.EMAIL_HOST || '',
    port: Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || '587'),
    secure: process.env.SMTP_SECURE || process.env.EMAIL_SECURE || '',
    user: process.env.SMTP_USER || process.env.EMAIL_USER || '',
    pass: process.env.SMTP_PASS || process.env.EMAIL_PASS || '',
    from: process.env.SMTP_FROM || process.env.EMAIL_FROM
      || process.env.SMTP_USER || process.env.EMAIL_USER || '',
    resendFrom: process.env.RESEND_FROM || process.env.EMAIL_FROM || '',
    resendApiKey: process.env.RESEND_API_KEY || '',
    queueEncryptionSecret: process.env.EMAIL_QUEUE_ENCRYPTION_KEY || refreshSecret,
  },
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  frontendUrls: (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean),
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  otp: {
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS || '3', 10),
    windowMinutes: parseInt(process.env.OTP_WINDOW_MINUTES || '10', 10),
    expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES || '10', 10),
    resendCooldownSeconds: parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || '60', 10),
    verifyMaxAttempts: parseInt(process.env.OTP_VERIFY_MAX_ATTEMPTS || '5', 10),
  },
};

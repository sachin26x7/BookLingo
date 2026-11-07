import dotenv from 'dotenv';
import path from 'path';
dotenv.config();

const backendRoot = path.resolve(__dirname, '../..');

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
  jwt: {
    accessSecret,
    refreshSecret,
    accessExpire: process.env.JWT_ACCESS_EXPIRE || '15m',
    refreshExpire: process.env.JWT_REFRESH_EXPIRE || '7d',
  },
  email: {
    resendApiKey: process.env.RESEND_API_KEY || '',
    resendFrom: process.env.RESEND_FROM || '',
    host: process.env.SMTP_HOST || process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || '465'),
    secure: (process.env.SMTP_SECURE || process.env.EMAIL_SECURE || '').toLowerCase() === 'true'
      || (!(process.env.SMTP_SECURE || process.env.EMAIL_SECURE)
        && Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || '465') === 465),
    user: process.env.SMTP_USER || process.env.EMAIL_USER || '',
    pass: process.env.SMTP_PASS || process.env.EMAIL_PASS || '',
    from: process.env.RESEND_FROM || process.env.SMTP_FROM || process.env.EMAIL_FROM
      || `BookLingo <${process.env.SMTP_USER || process.env.EMAIL_USER || ''}>`,
  },
  clientUrl: (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, ''),
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  frontendUrls: (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean),
  uploadDir: path.resolve(backendRoot, process.env.UPLOAD_DIR || 'uploads'),
};

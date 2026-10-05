import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { config } from './config';
import { connectDatabase } from './config/database';
import { getRedisClient } from './config/redis';
import { errorHandler, notFound } from './middleware/error.middleware';
import { initializeEmailService } from './services/email.service';
import { sendTestEmail } from './utils/sendEmail';

// Routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import booksRoutes from './routes/books.routes';
import progressRoutes from './routes/progress.routes';
import vocabularyRoutes from './routes/vocabulary.routes';
import readerRoutes from './routes/reader.routes';
import aiRoutes from './routes/ai.routes';

const app = express();

app.set('trust proxy', 1);

// Security & performance middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(compression());
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));

const allowedOrigins = new Set([
  ...config.frontendUrls,
  'https://book-lingo-4tp7-git-main-sachin3103x5-2655.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
]);

// CORS
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && !allowedOrigins.has(origin)) {
    res.status(403).json({ success: false, message: 'Origin not allowed.' });
    return;
  }
  next();
});

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));
app.use(cookieParser());
app.use('/api/', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Global rate limiter
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api/', globalLimiter);

// Stricter rate limiter for auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts, please try again later.' },
});
app.use('/api/auth/', authLimiter);

const resendEmailLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 4,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = req.body?.email;
    return typeof email === 'string'
      ? `email:${email.trim().toLowerCase()}`
      : `ip:${req.ip || 'unknown'}`;
  },
  message: { success: false, message: 'Too many verification email requests. Try again in one minute.' },
});
app.use('/api/auth/resend-verification', resendEmailLimiter);

const recoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many verification attempts, please try again later.' },
});
app.use([
  '/api/auth/verify-email',
  '/api/auth/resend-verification',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
], recoveryLimiter);

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Upload limit reached. Please try again later.' },
});
app.use('/api/books/upload', uploadLimiter);

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'AI request limit reached. Please try again later.' },
});
app.use('/api/ai/', aiLimiter);

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/test-email', async (req, res) => {
  if (config.nodeEnv === 'production') {
    res.status(404).json({ success: false, message: 'Not found' });
    return;
  }
  const to = req.body?.email;
  if (typeof to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    res.status(400).json({ success: false, message: 'Provide a valid email address.' });
    return;
  }

  try {
    await sendTestEmail(to);
    res.json({ success: true, message: 'Test email sent.' });
  } catch (error) {
    const mailError = error as NodeJS.ErrnoException;
    console.error('[SMTP] Test email failed:', error);
    res.status(503).json({
      success: false,
      message: mailError.message || 'SMTP test email failed.',
      ...(mailError.code && { code: mailError.code }),
    });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/books', booksRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/vocabulary', vocabularyRoutes);
app.use('/api/reader', readerRoutes);
app.use('/api/ai', aiRoutes);

if (config.nodeEnv === 'production') {
  const frontendDist = path.resolve(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDist, { index: false }));
  app.get('/{*path}', (req, res, next) => {
    if (req.path.startsWith('/api/') || !req.accepts('html')) {
      next();
      return;
    }

    res.sendFile(path.join(frontendDist, 'index.html'), (error) => {
      if (error) next(error);
    });
  });
}

// Error handling
app.use(notFound);
app.use(errorHandler);

// Startup
const start = async () => {
  try {
    await connectDatabase();
    await getRedisClient(); // Connect Redis (non-fatal if fails)
    await initializeEmailService();

    app.listen(config.port, () => {
      console.log(`\n🚀 BookReader API running on port ${config.port}`);
      console.log(`   Environment: ${config.nodeEnv}`);
      console.log(`   Health: http://localhost:${config.port}/health\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error instanceof Error ? error.name : 'unknown error');
    process.exit(1);
  }
};

start();

export default app;

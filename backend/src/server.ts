import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { connectDatabase } from './config/database';
import { getRedisClient } from './config/redis';
import { errorHandler, notFound } from './middleware/error.middleware';

// Routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import booksRoutes from './routes/books.routes';
import progressRoutes from './routes/progress.routes';
import vocabularyRoutes from './routes/vocabulary.routes';
import readerRoutes from './routes/reader.routes';
import aiRoutes from './routes/ai.routes';

const app = express();

// Security & performance middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(compression());
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));

// CORS
app.use(cors({
  origin: config.nodeEnv === 'production'
    ? [config.frontendUrl]
    : [config.frontendUrl, 'http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

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

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/books', booksRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/vocabulary', vocabularyRoutes);
app.use('/api/reader', readerRoutes);
app.use('/api/ai', aiRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

// Startup
const start = async () => {
  try {
    await connectDatabase();
    await getRedisClient(); // Connect Redis (non-fatal if fails)

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

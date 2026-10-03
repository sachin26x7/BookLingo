import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';

export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map((e) => ({ field: (e as any).path, message: e.msg })),
    });
    return;
  }
  next();
};

export const errorHandler = (
  err: Error & { statusCode?: number; status?: number; code?: string; type?: string },
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (err.name === 'MulterError') {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    res.status(tooLarge ? 413 : 400).json({
      success: false,
      message: tooLarge ? 'Uploaded file exceeds the 50 MB limit.' : 'Invalid file upload.',
    });
    return;
  }

  if (err.type === 'entity.too.large') {
    res.status(413).json({ success: false, message: 'Request body is too large.' });
    return;
  }

  if (err.name === 'ValidationError') {
    res.status(400).json({ success: false, message: 'Invalid request data' });
    return;
  }

  if (err.name === 'CastError') {
    res.status(400).json({ success: false, message: 'Invalid ID format' });
    return;
  }

  if ((err as any).code === 11000) {
    res.status(409).json({ success: false, message: 'Resource already exists' });
    return;
  }

  const statusCode = err.statusCode || err.status || 500;
  if (statusCode >= 500) console.error('[API] Request failed:', err.name);
  res.status(statusCode).json({
    success: false,
    message: statusCode === 400 && err.message === 'Only PDF files are allowed'
      ? err.message
      : statusCode >= 500 ? 'Internal server error' : 'Request could not be processed',
  });
};

export const notFound = (req: Request, res: Response): void => {
  res.status(404).json({ success: false, message: `Route ${req.path} not found` });
};

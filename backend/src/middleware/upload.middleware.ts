import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { NextFunction, Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { config } from '../config';

// Ensure upload directory exists
const uploadDir = path.resolve(config.uploadDir);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, _file, cb) => {
    cb(null, `${uuidv4()}.pdf`);
  },
});

const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    const error = new Error('Only PDF files are allowed') as Error & { statusCode: number };
    error.statusCode = 400;
    cb(error);
  }
};

export const uploadPDF = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
    files: 1,
    fields: 5,
    fieldSize: 16 * 1024,
    parts: 6,
  },
});

export const cleanupRejectedUpload = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  if (validationResult(req).isEmpty()) {
    next();
    return;
  }
  if (req.file) await fs.promises.unlink(req.file.path).catch(() => undefined);
  next();
};

export const validatePDFSignature = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (!req.file) {
    next();
    return;
  }

  let fileHandle: fs.promises.FileHandle | undefined;
  try {
    fileHandle = await fs.promises.open(req.file.path, 'r');
    const header = Buffer.alloc(5);
    const { bytesRead } = await fileHandle.read(header, 0, header.length, 0);
    await fileHandle.close();
    fileHandle = undefined;

    if (bytesRead !== 5 || header.toString('ascii') !== '%PDF-') {
      await fs.promises.unlink(req.file.path).catch(() => undefined);
      res.status(400).json({ success: false, message: 'The uploaded file is not a valid PDF.' });
      return;
    }

    next();
  } catch (error) {
    await fileHandle?.close().catch(() => undefined);
    await fs.promises.unlink(req.file.path).catch(() => undefined);
    next(error);
  }
};

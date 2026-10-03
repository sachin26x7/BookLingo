import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/token.service';
import { User } from '../models/User';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    tokenVersion?: number;
  };
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({ success: false, message: 'Token expired', code: 'TOKEN_EXPIRED' });
    } else {
      res.status(401).json({ success: false, message: 'Invalid token' });
    }
    return;
  }

  const user = await User.findById(payload.userId).select('+tokenVersion').lean();
  if (!user || (payload.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
    res.status(401).json({ success: false, message: 'Invalid token' });
    return;
  }

  if (!user.isEmailVerified) {
    res.status(403).json({ success: false, message: 'Email verification required', code: 'EMAIL_NOT_VERIFIED' });
    return;
  }

  req.user = payload;
  next();
};

export const requireEmailVerified = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  const user = await User.findById(req.user.userId);
  if (!user?.isEmailVerified) {
    res.status(403).json({ success: false, message: 'Email verification required', code: 'EMAIL_NOT_VERIFIED' });
    return;
  }

  next();
};

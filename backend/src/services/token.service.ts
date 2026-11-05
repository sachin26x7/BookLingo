import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { config } from '../config';
import { User } from '../models/User';

export interface TokenPayload {
  userId: string;
  email: string;
  tokenVersion?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export const generateTokens = (payload: TokenPayload): TokenPair => {
  const accessToken = jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpire as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
  });

  const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpire as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
  });

  return { accessToken, refreshToken };
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, config.jwt.accessSecret, { algorithms: ['HS256'] }) as TokenPayload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  return jwt.verify(token, config.jwt.refreshSecret, { algorithms: ['HS256'] }) as TokenPayload;
};

export const storeRefreshToken = async (userId: string, refreshToken: string): Promise<void> => {
  const refreshTokenHash = createHash('sha256').update(refreshToken).digest('hex');
  await User.updateOne({ _id: userId }, { $set: { refreshTokenHash } });
};

export const revokeRefreshToken = async (userId: string): Promise<void> => {
  await User.updateOne({ _id: userId }, { $unset: { refreshTokenHash: 1 } });
};

export const getStoredRefreshTokenHash = async (userId: string): Promise<string | null> => {
  const user = await User.findById(userId).select('+refreshTokenHash').lean();
  return user?.refreshTokenHash ?? null;
};

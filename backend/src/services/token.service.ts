import jwt from 'jsonwebtoken';
import { config } from '../config';
import { redisSet, redisDel, redisGet } from '../config/redis';

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
  const key = `session:${userId}`;
  const ttlSeconds = 7 * 24 * 60 * 60; // 7 days
  await redisSet(key, refreshToken, ttlSeconds);
};

export const revokeRefreshToken = async (userId: string): Promise<void> => {
  const key = `session:${userId}`;
  await redisDel(key);
};

export const getStoredRefreshToken = async (userId: string): Promise<string | null> => {
  return await redisGet(`session:${userId}`);
};

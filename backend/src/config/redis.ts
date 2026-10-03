import { createClient, RedisClientType } from 'redis';
import { config } from './index';

let redisClient: RedisClientType | null = null;
let isRedisConnected = false;

export const getRedisClient = async (): Promise<RedisClientType | null> => {
  if (isRedisConnected && redisClient) return redisClient;

  try {
    redisClient = createClient({ url: config.redisUrl }) as RedisClientType;

    redisClient.on('error', (err) => {
      console.warn('⚠️  Redis error (running without cache):', err.message);
      isRedisConnected = false;
    });

    redisClient.on('connect', () => {
      console.log('✅ Redis connected');
      isRedisConnected = true;
    });

    redisClient.on('disconnect', () => {
      isRedisConnected = false;
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    console.warn('⚠️  Redis unavailable, running without cache');
    isRedisConnected = false;
    return null;
  }
};

export const redisGet = async (key: string): Promise<string | null> => {
  const client = await getRedisClient();
  if (!client) return null;
  try {
    return await client.get(key);
  } catch {
    return null;
  }
};

export const redisSet = async (key: string, value: string, ttlSeconds?: number): Promise<void> => {
  const client = await getRedisClient();
  if (!client) return;
  try {
    if (ttlSeconds) {
      await client.set(key, value, { EX: ttlSeconds });
    } else {
      await client.set(key, value);
    }
  } catch (err) {
    console.warn('Redis set failed:', err);
  }
};

export const redisDel = async (key: string): Promise<void> => {
  const client = await getRedisClient();
  if (!client) return;
  try {
    await client.del(key);
  } catch (err) {
    console.warn('Redis del failed:', err);
  }
};

export const redisIncr = async (key: string): Promise<number> => {
  const client = await getRedisClient();
  if (!client) return 0;
  try {
    return await client.incr(key);
  } catch {
    return 0;
  }
};

export const redisExpire = async (key: string, ttlSeconds: number): Promise<void> => {
  const client = await getRedisClient();
  if (!client) return;
  try {
    await client.expire(key, ttlSeconds);
  } catch (err) {
    console.warn('Redis expire failed:', err);
  }
};

export const redisTtl = async (key: string): Promise<number> => {
  const client = await getRedisClient();
  if (!client) return -1;
  try {
    return await client.ttl(key);
  } catch {
    return -1;
  }
};

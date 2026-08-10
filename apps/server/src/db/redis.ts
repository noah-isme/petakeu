import { createClient, RedisClientType } from 'redis';
import { loadEnv } from '../config/env';
import { cacheHits, cacheMisses } from '../utils/metrics';

const env = loadEnv();

let redisClient: RedisClientType | null = null;

export function getRedisClient(): RedisClientType {
  if (!redisClient) {
    redisClient = createClient({
      url: env.redisUrl || 'redis://localhost:6379',
    });

    redisClient.on('error', (err) => {
      console.error('[redis] Client error:', err);
    });

    redisClient.connect().catch((err) => {
      console.error('[redis] Connection failed:', err);
    });
  }
  return redisClient;
}

export async function shutdownRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

export interface CacheOptions {
  ttl?: number; // seconds
  keyPrefix?: string;
}

export async function getCached<T>(
  key: string,
  fetchFn: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const client = getRedisClient();
  const fullKey = `${options.keyPrefix || 'petakeu'}:${key}`;
  const ttl = options.ttl || 300; // default 5 minutes

  try {
    const cached = await client.get(fullKey);
    if (cached !== null) {
      const data = JSON.parse(cached) as T;
      cacheHits.inc({ cache_type: 'redis' });
      return data;
    }
  } catch (error) {
    console.warn('[cache] Get failed:', error);
  }

  cacheMisses.inc({ cache_type: 'redis' });
  const data = await fetchFn();

  try {
    await client.setEx(fullKey, ttl, JSON.stringify(data));
  } catch (error) {
    console.warn('[cache] Set failed:', error);
  }

  return data;
}

export async function invalidateCache(pattern: string): Promise<void> {
  const client = getRedisClient();
  const fullPattern = `petakeu:${pattern}*`;

  try {
    const keys = await client.keys(fullPattern);
    if (keys.length > 0) {
      await client.del(keys);
    }
  } catch (error) {
    console.warn('[cache] Invalidate failed:', error);
  }
}

export async function invalidateCacheByPrefix(prefix: string): Promise<void> {
  await invalidateCache(prefix);
}
import { createClient, RedisClientType } from 'redis';

import { loadEnv } from '../config/env';
import { logger } from '../utils/logger';
import { cacheHits, cacheMisses, redisOperationDuration } from '../utils/metrics';

const env = loadEnv();

let redisClient: RedisClientType | null = null;

function cacheKeyType(value: string): string {
  const knownTypes = new Set(['geo', 'region', 'fiscal', 'analytics', 'defisitwatch', 'rankfin']);
  const type = value.split(':').find((part) => knownTypes.has(part));
  return type ?? 'other';
}

async function timedRedisOperation<T>(
  operation: 'get' | 'set_ex' | 'keys' | 'delete',
  keyType: string,
  action: () => Promise<T>
): Promise<T> {
  const startedAt = process.hrtime.bigint();
  try {
    return await action();
  } finally {
    redisOperationDuration?.observe(
      { operation, key_type: keyType },
      Number(process.hrtime.bigint() - startedAt) / 1e9
    );
  }
}

export function getRedisClient(): RedisClientType {
  if (!redisClient) {
    redisClient = createClient({
      url: env.redisUrl || 'redis://localhost:6379',
    });

    redisClient.on('error', (err) => {
      logger.error({ err }, '[redis] Client error');
    });

    redisClient.connect().catch((err) => {
      logger.error({ err }, '[redis] Connection failed');
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
  const keyType = cacheKeyType(options.keyPrefix || 'petakeu');

  try {
    const cached = await timedRedisOperation('get', keyType, () => client.get(fullKey));
    if (cached !== null) {
      const data = JSON.parse(cached) as T;
      cacheHits.inc({ cache_type: 'redis' });
      return data;
    }
  } catch (error) {
    logger.warn({ err: error, key_type: keyType }, '[cache] Get failed');
  }

  cacheMisses.inc({ cache_type: 'redis' });
  const data = await fetchFn();

  try {
    await timedRedisOperation('set_ex', keyType, () => client.setEx(fullKey, ttl, JSON.stringify(data)));
  } catch (error) {
    logger.warn({ err: error, key_type: keyType }, '[cache] Set failed');
  }

  return data;
}

export async function invalidateCache(pattern: string): Promise<void> {
  const client = getRedisClient();
  const fullPattern = `petakeu:${pattern}*`;
  const keyType = cacheKeyType(pattern);

  try {
    const keys = await timedRedisOperation('keys', keyType, () => client.keys(fullPattern));
    if (keys.length > 0) {
      await timedRedisOperation('delete', keyType, () => client.del(keys));
    }
  } catch (error) {
    logger.warn({ err: error, key_type: keyType }, '[cache] Invalidate failed');
  }
}

export async function invalidateCacheByPrefix(prefix: string): Promise<void> {
  await invalidateCache(prefix);
}

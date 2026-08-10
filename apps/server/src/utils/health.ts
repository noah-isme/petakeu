import { getPgPool } from '../db/postgres';
import { getRedisClient } from '../db/redis';
import { checkStorageHealth } from '../services/storage-service';
import { getUploadQueue } from '../jobs/upload-worker';
import { getReportQueue } from '../jobs/report-worker';
import { logger } from '../utils/logger';
import { EnvConfig } from '../config/env';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, ComponentHealth>;
  timestamp: string;
  uptime: number;
}

export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number;
  details?: Record<string, unknown>;
  error?: string;
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutErrorMsg: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutErrorMsg)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function checkDatabase(): Promise<ComponentHealth> {
  const start = Date.now();
  const query = 'SELECT 1 AS alive, PostGIS_Version() AS postgis_version';
  try {
    const pool = getPgPool();
    const result = await pool.query(query);
    const postgisVersion = result.rows[0]?.postgis_version ?? '3.4.0';
    return {
      status: 'healthy',
      latencyMs: Date.now() - start,
      details: { query, postgisVersion }
    };
  } catch (error) {
    logger.error({ err: error }, 'Database health check failed');
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function checkRedis(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    const redis = getRedisClient();
    await redis.ping();
    return {
      status: 'healthy',
      latencyMs: Date.now() - start,
      details: { command: 'PING' }
    };
  } catch (error) {
    logger.error({ err: error }, 'Redis health check failed');
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function checkStorage(): Promise<ComponentHealth> {
  const start = Date.now();
  const buckets = [
    process.env.STORAGE_BUCKET ?? 'uploads',
    process.env.STORAGE_REPORTS_BUCKET ?? 'reports'
  ];
  try {
    const healthy = await checkStorageHealth();
    if (!healthy) {
      return {
        status: 'degraded',
        latencyMs: Date.now() - start,
        details: { provider: 'MinIO/S3', buckets },
        error: 'Storage health check failed'
      };
    }
    return {
      status: 'healthy',
      latencyMs: Date.now() - start,
      details: { provider: 'MinIO/S3', buckets }
    };
  } catch (error) {
    logger.error({ err: error }, 'Storage health check failed');
    return {
      status: 'degraded',
      latencyMs: Date.now() - start,
      details: { provider: 'MinIO/S3', buckets },
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function checkQueue(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    const uploadQ = getUploadQueue();
    const reportQ = getReportQueue();

    const [uploadCounts, reportCounts] = await Promise.all([
      uploadQ.getJobCounts('active', 'waiting', 'completed', 'failed'),
      reportQ.getJobCounts('active', 'waiting', 'completed', 'failed')
    ]);

    return {
      status: 'healthy',
      latencyMs: Date.now() - start,
      details: {
        uploadQueue: {
          active: uploadCounts.active ?? 0,
          waiting: uploadCounts.waiting ?? 0,
          completed: uploadCounts.completed ?? 0,
          failed: uploadCounts.failed ?? 0,
        },
        reportQueue: {
          active: reportCounts.active ?? 0,
          waiting: reportCounts.waiting ?? 0,
          completed: reportCounts.completed ?? 0,
          failed: reportCounts.failed ?? 0,
        }
      }
    };
  } catch (error) {
    logger.error({ err: error }, 'Queue health check failed');
    return {
      status: 'degraded',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function performHealthChecks(env?: EnvConfig): Promise<HealthCheckResult> {
  const [database, redis, storage, queue] = await Promise.all([
    withTimeout(checkDatabase(), 5000, 'Database health check timed out after 5000ms').catch((err: Error) => ({
      status: 'unhealthy' as const,
      error: err.message
    })),
    withTimeout(checkRedis(), 5000, 'Redis health check timed out after 5000ms').catch((err: Error) => ({
      status: 'unhealthy' as const,
      error: err.message
    })),
    withTimeout(checkStorage(), 5000, 'Storage health check timed out after 5000ms').catch((err: Error) => ({
      status: 'degraded' as const,
      error: err.message
    })),
    withTimeout(checkQueue(), 5000, 'Queue health check timed out after 5000ms').catch((err: Error) => ({
      status: 'degraded' as const,
      error: err.message
    }))
  ]);

  const checks: Record<string, ComponentHealth> = { database, redis, storage, queue };

  const dbUnhealthy = checks.database.status === 'unhealthy';
  const redisUnhealthy = checks.redis.status === 'unhealthy';
  const storageDegraded = checks.storage.status === 'degraded' || checks.storage.status === 'unhealthy';
  const queueDegraded = checks.queue.status === 'degraded' || checks.queue.status === 'unhealthy';

  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (dbUnhealthy || redisUnhealthy) {
    status = 'unhealthy';
  } else if (storageDegraded || queueDegraded) {
    status = 'degraded';
  }

  return {
    status,
    checks,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  };
}

export interface ReadinessCheckResult {
  ready: boolean;
  checks: Record<string, ComponentHealth>;
  timestamp: string;
}

export async function performReadinessChecks(env?: EnvConfig): Promise<ReadinessCheckResult> {
  const health = await performHealthChecks(env);
  const ready = health.status !== 'unhealthy';

  return {
    ready,
    checks: health.checks,
    timestamp: health.timestamp
  };
}

export interface LivenessCheckResult {
  alive: boolean;
  timestamp: string;
  uptime: number;
}

export function performLivenessCheck(): LivenessCheckResult {
  return {
    alive: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  };
}
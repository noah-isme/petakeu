import { getPgPool } from '../db/postgres';
import { getRedisClient } from '../db/redis';
import { checkStorageHealth } from '../services/storage-service';
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

export async function performHealthChecks(env: EnvConfig): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const checks: Record<string, ComponentHealth> = {};

  // Database check
  checks.database = await checkDatabase();

  // Redis check
  checks.redis = await checkRedis();

  // MinIO/Storage check
  checks.storage = await checkStorage();

  // Determine overall status
  const statuses = Object.values(checks).map(c => c.status);
  const overallStatus = statuses.includes('unhealthy') ? 'unhealthy' :
                       statuses.includes('degraded') ? 'degraded' : 'healthy';

  return {
    status: overallStatus,
    checks,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  };
}

async function checkDatabase(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    const pool = getPgPool();
    await pool.query('SELECT 1');
    return {
      status: 'healthy',
      latencyMs: Date.now() - start,
      details: { query: 'SELECT 1' }
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

async function checkRedis(): Promise<ComponentHealth> {
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

async function checkStorage(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    const healthy = await checkStorageHealth();
    return {
      status: healthy ? 'healthy' : 'degraded',
      latencyMs: Date.now() - start,
      details: { provider: 'MinIO/S3' }
    };
  } catch (error) {
    logger.error({ err: error }, 'Storage health check failed');
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export interface ReadinessCheckResult {
  ready: boolean;
  checks: Record<string, ComponentHealth>;
  timestamp: string;
}

export async function performReadinessChecks(env: EnvConfig): Promise<ReadinessCheckResult> {
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
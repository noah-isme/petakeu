import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkDatabase,
  checkRedis,
  checkStorage,
  checkQueue,
  performHealthChecks,
  performReadinessChecks,
  performLivenessCheck,
  HealthCheckResult
} from '../../apps/server/src/utils/health';
import { getPgPool } from '../../apps/server/src/db/postgres';
import { getRedisClient } from '../../apps/server/src/db/redis';
import { checkStorageHealth } from '../../apps/server/src/services/storage-service';
import { getUploadQueue } from '../../apps/server/src/jobs/upload-worker';
import { getReportQueue } from '../../apps/server/src/jobs/report-worker';
import { createApp } from '../../apps/server/src/server';
import type { Server } from 'http';

vi.mock('../../apps/server/src/db/postgres', () => {
  const mockPool = { query: vi.fn() };
  return { getPgPool: () => mockPool };
});

vi.mock('../../apps/server/src/db/redis', () => {
  const mockRedis = { ping: vi.fn() };
  return { getRedisClient: () => mockRedis };
});

vi.mock('../../apps/server/src/services/storage-service', () => ({
  checkStorageHealth: vi.fn(),
}));

vi.mock('../../apps/server/src/jobs/upload-worker', () => {
  const mockQueue = { getJobCounts: vi.fn() };
  return {
    getUploadQueue: () => mockQueue,
    uploadQueue: { add: vi.fn() },
  };
});

vi.mock('../../apps/server/src/jobs/report-worker', () => {
  const mockQueue = { getJobCounts: vi.fn() };
  return {
    getReportQueue: () => mockQueue,
    reportQueue: { add: vi.fn() },
  };
});

describe('Challenger Empirical Verification Suite for GET /healthz', () => {
  let mockPgPool: any;
  let mockRedisClient: any;
  let mockUploadQueue: any;
  let mockReportQueue: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPgPool = getPgPool();
    mockRedisClient = getRedisClient();
    mockUploadQueue = getUploadQueue();
    mockReportQueue = getReportQueue();

    mockPgPool.query.mockResolvedValue({
      rows: [{ alive: 1, postgis_version: '3.4.0 USE_GEOS=1 USE_PROJ=1' }],
    });
    mockRedisClient.ping.mockResolvedValue('PONG');
    (checkStorageHealth as any).mockResolvedValue(true);
    mockUploadQueue.getJobCounts.mockResolvedValue({ active: 0, waiting: 0, completed: 10, failed: 0 });
    mockReportQueue.getJobCounts.mockResolvedValue({ active: 0, waiting: 0, completed: 5, failed: 0 });
  });

  it('Requirement 1 & 2: Top-level fields and component sub-objects compliance', async () => {
    const result: HealthCheckResult = await performHealthChecks();
    
    // Top-level field presence and types
    expect(result).toHaveProperty('status');
    expect(['healthy', 'degraded', 'unhealthy']).toContain(result.status);

    expect(result).toHaveProperty('timestamp');
    expect(typeof result.timestamp).toBe('string');
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);

    expect(result).toHaveProperty('uptime');
    expect(typeof result.uptime).toBe('number');
    expect(result.uptime).toBeGreaterThanOrEqual(0);

    expect(result).toHaveProperty('checks');
    expect(typeof result.checks).toBe('object');
    expect(result.checks).not.toBeNull();

    // Required component sub-objects
    const checks = result.checks;
    expect(checks).toHaveProperty('database');
    expect(checks).toHaveProperty('redis');
    expect(checks).toHaveProperty('storage');
    expect(checks).toHaveProperty('queue');
  });

  it('Requirement 3: Component latencyMs and details metadata compliance', async () => {
    const result = await performHealthChecks();
    const { database, redis, storage, queue } = result.checks;

    // Database metadata
    expect(typeof database.latencyMs).toBe('number');
    expect(database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(database.details).toEqual({
      query: 'SELECT 1 AS alive, PostGIS_Version() AS postgis_version',
      postgisVersion: '3.4.0 USE_GEOS=1 USE_PROJ=1',
    });

    // Redis metadata
    expect(typeof redis.latencyMs).toBe('number');
    expect(redis.latencyMs).toBeGreaterThanOrEqual(0);
    expect(redis.details).toEqual({ command: 'PING' });

    // Storage metadata
    expect(typeof storage.latencyMs).toBe('number');
    expect(storage.latencyMs).toBeGreaterThanOrEqual(0);
    expect(storage.details).toEqual({
      provider: 'MinIO/S3',
      buckets: ['uploads', 'reports'],
    });

    // Queue metadata
    expect(typeof queue.latencyMs).toBe('number');
    expect(queue.latencyMs).toBeGreaterThanOrEqual(0);
    expect(queue.details).toEqual({
      uploadQueue: { active: 0, waiting: 0, completed: 10, failed: 0 },
      reportQueue: { active: 0, waiting: 0, completed: 5, failed: 0 },
    });
  });

  it('Requirement 4: HTTP GET /healthz response mapping and error structures under failures', async () => {
    const app = await createApp();
    const server: Server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const addr = server.address() as any;
    const baseUrl = `http://localhost:${addr.port}`;

    try {
      // 4.1 Success Mode (200 OK)
      const resOk = await fetch(`${baseUrl}/healthz`);
      expect(resOk.status).toBe(200);
      const dataOk = await resOk.json();
      expect(dataOk.status).toBe('healthy');
      expect(dataOk.checks.database.status).toBe('healthy');

      // 4.2 DB Failure Mode (503 Service Unavailable + Error Payload)
      mockPgPool.query.mockRejectedValueOnce(new Error('Fatal DB failure: connection lost'));
      const resDbFail = await fetch(`${baseUrl}/healthz`);
      expect(resDbFail.status).toBe(503);
      const dataDbFail = await resDbFail.json();
      expect(dataDbFail.status).toBe('unhealthy');
      expect(dataDbFail.checks.database.status).toBe('unhealthy');
      expect(dataDbFail.checks.database.error).toBe('Fatal DB failure: connection lost');
      expect(typeof dataDbFail.checks.database.latencyMs).toBe('number');

      // 4.3 Redis Failure Mode (503 Service Unavailable + Error Payload)
      mockRedisClient.ping.mockRejectedValueOnce(new Error('Redis connection timed out'));
      const resRedisFail = await fetch(`${baseUrl}/healthz`);
      expect(resRedisFail.status).toBe(503);
      const dataRedisFail = await resRedisFail.json();
      expect(dataRedisFail.status).toBe('unhealthy');
      expect(dataRedisFail.checks.redis.status).toBe('unhealthy');
      expect(dataRedisFail.checks.redis.error).toBe('Redis connection timed out');

      // 4.4 Storage Failure Mode (200 OK + degraded status + Error Payload)
      (checkStorageHealth as any).mockResolvedValueOnce(false);
      const resStorageFail = await fetch(`${baseUrl}/healthz`);
      expect(resStorageFail.status).toBe(200);
      const dataStorageFail = await resStorageFail.json();
      expect(dataStorageFail.status).toBe('degraded');
      expect(dataStorageFail.checks.storage.status).toBe('degraded');
      expect(dataStorageFail.checks.storage.error).toBe('Storage health check failed');

      // 4.5 Queue Failure Mode (200 OK + degraded status + Error Payload)
      mockUploadQueue.getJobCounts.mockRejectedValueOnce(new Error('BullMQ connection lost'));
      const resQueueFail = await fetch(`${baseUrl}/healthz`);
      expect(resQueueFail.status).toBe(200);
      const dataQueueFail = await resQueueFail.json();
      expect(dataQueueFail.status).toBe('degraded');
      expect(dataQueueFail.checks.queue.status).toBe('degraded');
      expect(dataQueueFail.checks.queue.error).toBe('BullMQ connection lost');

    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  checkDatabase,
  checkRedis,
  checkStorage,
  checkQueue,
  performHealthChecks,
  performReadinessChecks,
  performLivenessCheck,
  withTimeout,
} from './health';
import { getPgPool } from '../db/postgres';
import { getRedisClient } from '../db/redis';
import { checkStorageHealth } from '../services/storage-service';
import { getUploadQueue } from '../jobs/upload-worker';
import { getReportQueue } from '../jobs/report-worker';
import { createApp } from '../server';
import type { Server } from 'http';

vi.mock('../db/postgres', () => {
  const mockPool = {
    query: vi.fn(),
  };
  return {
    getPgPool: () => mockPool,
  };
});

vi.mock('../db/redis', () => {
  const mockRedis = {
    ping: vi.fn(),
  };
  return {
    getRedisClient: () => mockRedis,
  };
});

vi.mock('../services/storage-service', () => {
  return {
    checkStorageHealth: vi.fn(),
  };
});

vi.mock('../jobs/upload-worker', () => {
  const mockQueue = {
    getJobCounts: vi.fn(),
  };
  return {
    getUploadQueue: () => mockQueue,
    uploadQueue: { add: vi.fn() },
  };
});

vi.mock('../jobs/report-worker', () => {
  const mockQueue = {
    getJobCounts: vi.fn(),
  };
  return {
    getReportQueue: () => mockQueue,
    reportQueue: { add: vi.fn() },
  };
});

describe('Health Probes Unit & Integration Tests', () => {
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

    // Default healthy mock implementations
    mockPgPool.query.mockResolvedValue({
      rows: [{ alive: 1, postgis_version: '3.4.0' }],
    });
    mockRedisClient.ping.mockResolvedValue('PONG');
    (checkStorageHealth as any).mockResolvedValue(true);
    mockUploadQueue.getJobCounts.mockResolvedValue({ active: 0, waiting: 0, completed: 10, failed: 0 });
    mockReportQueue.getJobCounts.mockResolvedValue({ active: 0, waiting: 0, completed: 5, failed: 0 });
  });

  describe('checkDatabase', () => {
    it('returns healthy status with postgisVersion when query succeeds', async () => {
      const result = await checkDatabase();
      expect(result.status).toBe('healthy');
      expect(result.details).toEqual({
        query: 'SELECT 1 AS alive, PostGIS_Version() AS postgis_version',
        postgisVersion: '3.4.0',
      });
      expect(result.latencyMs).toBeTypeOf('number');
    });

    it('returns unhealthy status when database query fails', async () => {
      mockPgPool.query.mockRejectedValue(new Error('DB Connection Refused'));
      const result = await checkDatabase();
      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('DB Connection Refused');
    });
  });

  describe('checkRedis', () => {
    it('returns healthy status when ping succeeds', async () => {
      const result = await checkRedis();
      expect(result.status).toBe('healthy');
      expect(result.details).toEqual({ command: 'PING' });
    });

    it('returns unhealthy status when ping fails', async () => {
      mockRedisClient.ping.mockRejectedValue(new Error('Redis Timeout'));
      const result = await checkRedis();
      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Redis Timeout');
    });
  });

  describe('checkStorage', () => {
    it('returns healthy status when storage check returns true', async () => {
      const result = await checkStorage();
      expect(result.status).toBe('healthy');
      expect(result.details).toEqual({
        provider: 'MinIO/S3',
        buckets: ['uploads', 'reports'],
      });
    });

    it('returns degraded status when storage check returns false', async () => {
      (checkStorageHealth as any).mockResolvedValue(false);
      const result = await checkStorage();
      expect(result.status).toBe('degraded');
      expect(result.error).toBe('Storage health check failed');
    });

    it('returns degraded status when storage check throws error', async () => {
      (checkStorageHealth as any).mockRejectedValue(new Error('S3 Unreachable'));
      const result = await checkStorage();
      expect(result.status).toBe('degraded');
      expect(result.error).toBe('S3 Unreachable');
    });
  });

  describe('checkQueue', () => {
    it('returns healthy status with job counts for queues', async () => {
      const result = await checkQueue();
      expect(result.status).toBe('healthy');
      expect(result.details).toEqual({
        uploadQueue: { active: 0, waiting: 0, completed: 10, failed: 0 },
        reportQueue: { active: 0, waiting: 0, completed: 5, failed: 0 },
      });
    });

    it('returns degraded status when queue check throws error', async () => {
      mockUploadQueue.getJobCounts.mockRejectedValue(new Error('Redis Queue Connection Failed'));
      const result = await checkQueue();
      expect(result.status).toBe('degraded');
      expect(result.error).toBe('Redis Queue Connection Failed');
    });
  });

  describe('performHealthChecks', () => {
    it('returns healthy when all components are healthy', async () => {
      const result = await performHealthChecks();
      expect(result.status).toBe('healthy');
      expect(result.checks.database.status).toBe('healthy');
      expect(result.checks.redis.status).toBe('healthy');
      expect(result.checks.storage.status).toBe('healthy');
      expect(result.checks.queue.status).toBe('healthy');
      expect(result.timestamp).toBeDefined();
      expect(result.uptime).toBeTypeOf('number');
    });

    it('returns degraded when DB and Redis are healthy but storage is degraded', async () => {
      (checkStorageHealth as any).mockResolvedValue(false);
      const result = await performHealthChecks();
      expect(result.status).toBe('degraded');
      expect(result.checks.database.status).toBe('healthy');
      expect(result.checks.redis.status).toBe('healthy');
      expect(result.checks.storage.status).toBe('degraded');
    });

    it('returns degraded when DB and Redis are healthy but queue is degraded', async () => {
      mockUploadQueue.getJobCounts.mockRejectedValue(new Error('Queue Error'));
      const result = await performHealthChecks();
      expect(result.status).toBe('degraded');
      expect(result.checks.queue.status).toBe('degraded');
    });

    it('returns unhealthy when database is unhealthy', async () => {
      mockPgPool.query.mockRejectedValue(new Error('DB Failure'));
      const result = await performHealthChecks();
      expect(result.status).toBe('unhealthy');
      expect(result.checks.database.status).toBe('unhealthy');
    });

    it('returns unhealthy when redis is unhealthy', async () => {
      mockRedisClient.ping.mockRejectedValue(new Error('Redis Failure'));
      const result = await performHealthChecks();
      expect(result.status).toBe('unhealthy');
      expect(result.checks.redis.status).toBe('unhealthy');
    });
  });

  describe('withTimeout', () => {
    it('resolves with the promise result if completed before timeout', async () => {
      const fastPromise = Promise.resolve({ status: 'healthy' as const });
      const result = await withTimeout(fastPromise, 1000, 'Timed out');
      expect(result).toEqual({ status: 'healthy' });
    });

    it('rejects with error message if promise does not complete within timeout', async () => {
      const slowPromise = new Promise<{ status: 'healthy' }>((resolve) => {
        setTimeout(() => resolve({ status: 'healthy' }), 50);
      });
      await expect(withTimeout(slowPromise, 10, 'Timed out')).rejects.toThrow('Timed out');
    });
  });

  describe('performReadinessChecks & performLivenessCheck', () => {
    it('returns ready true when healthy', async () => {
      const result = await performReadinessChecks();
      expect(result.ready).toBe(true);
    });

    it('returns ready false when DB is unhealthy', async () => {
      mockPgPool.query.mockRejectedValue(new Error('DB Failure'));
      const result = await performReadinessChecks();
      expect(result.ready).toBe(false);
    });

    it('returns liveness info', () => {
      const result = performLivenessCheck();
      expect(result.alive).toBe(true);
    });
  });

  describe('HTTP Endpoints GET /healthz and GET /health', () => {
    let server: Server;
    let baseUrl: string;

    beforeEach(async () => {
      const app = await createApp();
      await new Promise<void>((resolve) => {
        server = app.listen(0, () => {
          const addr = server.address();
          const port = typeof addr === 'object' && addr ? addr.port : 0;
          baseUrl = `http://localhost:${port}`;
          resolve();
        });
      });
    });

    afterEach(async () => {
      if (server) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it('GET /healthz returns 200 when overall status is healthy', async () => {
      const res = await fetch(`${baseUrl}/healthz`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.status).toBe('healthy');
      expect(data.checks.database.status).toBe('healthy');
      expect(data.checks.redis.status).toBe('healthy');
      expect(data.checks.storage.status).toBe('healthy');
      expect(data.checks.queue.status).toBe('healthy');
    });

    it('GET /healthz returns 200 when overall status is degraded', async () => {
      (checkStorageHealth as any).mockResolvedValue(false);
      const res = await fetch(`${baseUrl}/healthz`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.status).toBe('degraded');
    });

    it('GET /healthz returns 503 when DB is unhealthy', async () => {
      mockPgPool.query.mockRejectedValue(new Error('DB Down'));
      const res = await fetch(`${baseUrl}/healthz`);
      expect(res.status).toBe(503);
      const data = (await res.json()) as any;
      expect(data.status).toBe('unhealthy');
    });

    it('GET /healthz returns 503 when Redis is unhealthy', async () => {
      mockRedisClient.ping.mockRejectedValue(new Error('Redis Down'));
      const res = await fetch(`${baseUrl}/healthz`);
      expect(res.status).toBe(503);
      const data = (await res.json()) as any;
      expect(data.status).toBe('unhealthy');
    });

    it('GET /health returns 200 when healthy', async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.status).toBe('healthy');
    });
  });
});

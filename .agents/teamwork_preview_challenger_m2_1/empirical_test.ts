import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  checkDatabase,
  checkRedis,
  checkStorage,
  checkQueue,
  performHealthChecks,
  performReadinessChecks,
} from './apps/server/src/utils/health';
import { getPgPool } from './apps/server/src/db/postgres';
import { getRedisClient } from './apps/server/src/db/redis';
import { checkStorageHealth } from './apps/server/src/services/storage-service';
import { getUploadQueue } from './apps/server/src/jobs/upload-worker';
import { getReportQueue } from './apps/server/src/jobs/report-worker';
import { createApp } from './apps/server/src/server';
import type { Server } from 'http';

vi.mock('./apps/server/src/db/postgres', () => {
  const mockPool = { query: vi.fn() };
  return { getPgPool: () => mockPool };
});

vi.mock('./apps/server/src/db/redis', () => {
  const mockRedis = { ping: vi.fn() };
  return { getRedisClient: () => mockRedis };
});

vi.mock('./apps/server/src/services/storage-service', () => ({
  checkStorageHealth: vi.fn(),
}));

vi.mock('./apps/server/src/jobs/upload-worker', () => {
  const mockQueue = { getJobCounts: vi.fn() };
  return { getUploadQueue: () => mockQueue, uploadQueue: { add: vi.fn() } };
});

vi.mock('./apps/server/src/jobs/report-worker', () => {
  const mockQueue = { getJobCounts: vi.fn() };
  return { getReportQueue: () => mockQueue, reportQueue: { add: vi.fn() } };
});

async function runEmpiricalStressTests() {
  console.log('=== EMPIRICAL STRESS TESTS FOR HEALTH READINESS PROBE ===\n');

  const mockPgPool = getPgPool();
  const mockRedisClient = getRedisClient();
  const mockUploadQueue = getUploadQueue();
  const mockReportQueue = getReportQueue();

  const app = await createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  function resetMocksToHealthy() {
    mockPgPool.query.mockReset().mockResolvedValue({
      rows: [{ alive: 1, postgis_version: '3.4.0' }],
    });
    mockRedisClient.ping.mockReset().mockResolvedValue('PONG');
    (checkStorageHealth as any).mockReset().mockResolvedValue(true);
    mockUploadQueue.getJobCounts.mockReset().mockResolvedValue({ active: 0, waiting: 0, completed: 10, failed: 0 });
    mockReportQueue.getJobCounts.mockReset().mockResolvedValue({ active: 0, waiting: 0, completed: 5, failed: 0 });
  }

  let passedCount = 0;
  let failedCount = 0;

  async function testCase(name: string, setup: () => void, expectedStatus: number, expectedHealthStatus: string) {
    resetMocksToHealthy();
    setup();
    const res = await fetch(`${baseUrl}/healthz`);
    const data = await res.json();
    const statusMatches = res.status === expectedStatus;
    const healthStatusMatches = data.status === expectedHealthStatus;

    if (statusMatches && healthStatusMatches) {
      console.log(`[PASS] ${name}`);
      console.log(`       HTTP Code: ${res.status} (expected ${expectedStatus}) | Body status: '${data.status}' (expected '${expectedHealthStatus}')`);
      passedCount++;
    } else {
      console.error(`[FAIL] ${name}`);
      console.error(`       HTTP Code: ${res.status} (expected ${expectedStatus}) | Body status: '${data.status}' (expected '${expectedHealthStatus}')`);
      console.error(`       Response body:`, JSON.stringify(data, null, 2));
      failedCount++;
    }
  }

  // 1. Fully Healthy (DB, Redis, Storage, Queue all operational) -> 200 healthy
  await testCase(
    '1. Fully Healthy (DB, Redis, Storage, Queue operational)',
    () => {},
    200,
    'healthy'
  );

  // 2a. Degraded Storage (Storage returns false) -> 200 degraded
  await testCase(
    '2a. Degraded Storage (MinIO false)',
    () => { (checkStorageHealth as any).mockResolvedValue(false); },
    200,
    'degraded'
  );

  // 2b. Degraded Storage (Storage throws error) -> 200 degraded
  await testCase(
    '2b. Degraded Storage (MinIO exception)',
    () => { (checkStorageHealth as any).mockRejectedValue(new Error('MinIO connection refused')); },
    200,
    'degraded'
  );

  // 2c. Degraded Queue (Queue throws error) -> 200 degraded
  await testCase(
    '2c. Degraded Queue (BullMQ getJobCounts exception)',
    () => { mockUploadQueue.getJobCounts.mockRejectedValue(new Error('BullMQ Redis error')); },
    200,
    'degraded'
  );

  // 2d. Degraded Storage AND Queue -> 200 degraded
  await testCase(
    '2d. Degraded Storage & Queue simultaneously',
    () => {
      (checkStorageHealth as any).mockResolvedValue(false);
      mockReportQueue.getJobCounts.mockRejectedValue(new Error('Report Queue Error'));
    },
    200,
    'degraded'
  );

  // 3a. Unhealthy DB -> 503 unhealthy
  await testCase(
    '3a. Unhealthy DB (Connection Error)',
    () => { mockPgPool.query.mockRejectedValue(new Error('PostgreSQL Connection Failed')); },
    503,
    'unhealthy'
  );

  // 3b. Unhealthy Redis -> 503 unhealthy
  await testCase(
    '3b. Unhealthy Redis (Ping Error)',
    () => { mockRedisClient.ping.mockRejectedValue(new Error('Redis Timeout')); },
    503,
    'unhealthy'
  );

  // 3c. Unhealthy DB AND Redis -> 503 unhealthy
  await testCase(
    '3c. Unhealthy DB & Redis simultaneously',
    () => {
      mockPgPool.query.mockRejectedValue(new Error('DB Down'));
      mockRedisClient.ping.mockRejectedValue(new Error('Redis Down'));
    },
    503,
    'unhealthy'
  );

  // 3d. Unhealthy DB with Degraded Storage & Queue -> 503 unhealthy
  await testCase(
    '3d. Unhealthy DB + Degraded Storage & Queue',
    () => {
      mockPgPool.query.mockRejectedValue(new Error('DB Fatal Error'));
      (checkStorageHealth as any).mockResolvedValue(false);
      mockUploadQueue.getJobCounts.mockRejectedValue(new Error('Queue Error'));
    },
    503,
    'unhealthy'
  );

  // Test /health endpoint parity
  const healthRes = await fetch(`${baseUrl}/health`);
  console.log(`\nParity check GET /health status: ${healthRes.status}`);

  server.close();

  console.log(`\n=== STRESS TEST RESULTS SUMMARY ===`);
  console.log(`Total Scenarios: ${passedCount + failedCount}`);
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${failedCount}`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

runEmpiricalStressTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});

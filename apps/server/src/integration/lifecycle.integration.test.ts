import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../server';
import { getPgPool, shutdownPg } from '../db/postgres';
import { getRedisClient, shutdownRedis } from '../db/redis';
import { getReportQueue, startReportWorker } from '../jobs/report-worker';
import { getUploadQueue, startUploadWorker } from '../jobs/upload-worker';
import {
  closeIntegrationClients,
  closeServer,
  listenApp,
  probeIntegrationInfrastructure,
  type AppServer,
  type IntegrationGate,
} from '../test-utils/integration';

describe('Empirical Lifecycle & Connection Teardown Challenge', () => {
  let gate: IntegrationGate = { available: false };

  beforeAll(async () => {
    gate = await probeIntegrationInfrastructure();
  });

  afterAll(async () => {
    await closeIntegrationClients();
  });

  it('verifies idempotent double-shutdown of PostgreSQL pool and Redis client', async () => {
    if (!gate.available) return;

    // 1. Ensure connections are active
    const pool = getPgPool();
    const redis = getRedisClient();
    const pgRes = await pool.query('SELECT 1 AS num');
    expect(pgRes.rows[0].num).toBe(1);
    const pingRes = await redis.ping();
    expect(pingRes).toBe('PONG');

    // 2. First shutdown
    await shutdownPg();
    await shutdownRedis();

    // 3. Second shutdown (must be idempotent, not throw or hang)
    await expect(shutdownPg()).resolves.toBeUndefined();
    await expect(shutdownRedis()).resolves.toBeUndefined();

    // 4. Verify re-instantiation works cleanly without stale reference
    const newPool = getPgPool();
    const newRedis = getRedisClient();
    const newPgRes = await newPool.query('SELECT 2 AS num');
    expect(newPgRes.rows[0].num).toBe(2);
    const newPingRes = await newRedis.ping();
    expect(newPingRes).toBe('PONG');

    // Clean up
    await shutdownPg();
    await shutdownRedis();
  });

  it('verifies HTTP server listener lifecycle and socket release', async () => {
    if (!gate.available) return;

    const app = await createApp();
    const appServer: AppServer = await listenApp(app);
    expect(appServer.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

    // Make an active HTTP request
    const response = await fetch(`${appServer.baseUrl}/health`);
    expect(response.status).toBe(200);

    // Close server
    await closeServer(appServer.server);

    // Verify port is no longer accepting connections
    await expect(fetch(`${appServer.baseUrl}/health`)).rejects.toThrow();
  });

  it('verifies BullMQ worker and queue instance clean teardown without lingering Redis handles', async () => {
    if (!gate.available) return;

    // Start workers
    const uploadWorker = startUploadWorker();
    const reportWorker = startReportWorker();

    const uploadQueue = getUploadQueue();
    const reportQueue = getReportQueue();

    // Verify workers are running and queues are ready
    expect(uploadWorker.isRunning()).toBe(true);
    expect(reportWorker.isRunning()).toBe(true);

    // Close workers
    await uploadWorker.close();
    await reportWorker.close();

    expect(uploadWorker.isRunning()).toBe(false);
    expect(reportWorker.isRunning()).toBe(false);

    // Close queues
    await uploadQueue.close();
    await reportQueue.close();

    // Closing already closed queues/workers must not hang or throw
    await expect(uploadWorker.close()).resolves.toBeUndefined();
    await expect(reportWorker.close()).resolves.toBeUndefined();
    await expect(uploadQueue.close()).resolves.toBeUndefined();
    await expect(reportQueue.close()).resolves.toBeUndefined();
  });

  it('verifies rapid sequential worker start/stop cycles do not leak event listeners or connections', async () => {
    if (!gate.available) return;

    for (let i = 0; i < 5; i++) {
      const uWorker = startUploadWorker();
      const rWorker = startReportWorker();
      expect(uWorker.isRunning()).toBe(true);
      expect(rWorker.isRunning()).toBe(true);
      await uWorker.close();
      await rWorker.close();
      expect(uWorker.isRunning()).toBe(false);
      expect(rWorker.isRunning()).toBe(false);
    }
  });

  it('verifies process active handles after full lifecycle cleanup', async () => {
    if (!gate.available) return;

    // 1. Spin up everything
    const app = await createApp();
    const appServer = await listenApp(app);
    const pool = getPgPool();
    const redis = getRedisClient();
    const uploadWorker = startUploadWorker();
    const reportWorker = startReportWorker();
    const uploadQueue = getUploadQueue();
    const reportQueue = getReportQueue();

    // Perform operations
    await pool.query('SELECT 1');
    await redis.ping();
    const res = await fetch(`${appServer.baseUrl}/health`);
    expect(res.status).toBe(200);

    // 2. Tear down everything in the proper order
    await closeServer(appServer.server);
    await uploadWorker.close();
    await reportWorker.close();
    await uploadQueue.close();
    await reportQueue.close();
    await shutdownRedis();
    await shutdownPg();

    // Give a short grace period for TCP FIN/RST packet exchange
    await new Promise((r) => setTimeout(r, 100));

    // 3. Inspect active handles in Node.js runtime if process._getActiveHandles is available
    if (typeof (process as unknown as { _getActiveHandles?: () => unknown[] })._getActiveHandles === 'function') {
      const handles = (process as unknown as { _getActiveHandles: () => unknown[] })._getActiveHandles();

      const tcpSockets = handles.filter((h: unknown) => {
        if (!h || typeof h !== 'object') return false;
        const name = (h as { constructor?: { name?: string } }).constructor?.name;
        return name === 'Socket' || name === 'TCP';
      });

      const activeTcpSockets = tcpSockets.filter((s: unknown) => {
        const socket = s as { destroyed?: boolean; _handle?: unknown; remotePort?: number };
        return socket.destroyed === false && socket._handle !== null;
      });

      expect(activeTcpSockets.length).toBe(0);
    }
  });
});

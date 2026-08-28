import { randomUUID } from 'node:crypto';


import { Queue } from 'bullmq';
import jwt from 'jsonwebtoken';
import ExcelJS from 'exceljs';
import { ListBucketsCommand } from '@aws-sdk/client-s3';


import { getS3Client } from '../db/minio';
import { getPgPool, shutdownPg } from '../db/postgres';
import { getRedisClient, shutdownRedis } from '../db/redis';

import type { Pool } from 'pg';
import type { Express } from 'express';
import type { Server } from 'node:http';

export interface IntegrationGate {
  available: boolean;
  reason?: string;
}

export interface AppServer {
  server: Server;
  baseUrl: string;
}

export interface HttpResult<T = unknown> {
  status: number;
  body: T;
  response: Response;
}

const INTEGRATION_ENABLED_VALUES = new Set(['1', 'true']);

export function isIntegrationRequested(): boolean {
  return INTEGRATION_ENABLED_VALUES.has(process.env.PETAKEU_INTEGRATION ?? '');
}

export function integrationSkipReason(): string | undefined {
  if (!isIntegrationRequested()) {
    return 'set PETAKEU_INTEGRATION=1 to enable real PostgreSQL/Redis/MinIO integration tests';
  }

  const required = ['DATABASE_URL', 'REDIS_URL', 'STORAGE_ENDPOINT', 'AUTH_SECRET'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    return `missing required environment variables: ${missing.join(', ')}`;
  }

  if (process.env.AUTH_DISABLED === 'true') {
    return 'AUTH_DISABLED=true disables the JWT permission checks exercised by these tests';
  }

  return undefined;
}

export async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    operation.then(
      (value) => {
        if (timer) clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (timer) clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function probeIntegrationInfrastructure(): Promise<IntegrationGate> {
  const configuredReason = integrationSkipReason();
  if (configuredReason) {
    return { available: false, reason: configuredReason };
  }

  try {
    const pool = getPgPool();
    const schemaResult = await withTimeout(
      pool.query(`
        SELECT
          to_regclass('public.regions') AS regions_table,
          to_regclass('public.payments') AS payments_table,
          to_regclass('public.uploads') AS uploads_table,
          to_regclass('public.report_jobs') AS report_jobs_table,
          to_regclass('public.report_templates') AS report_templates_table,
          to_regclass('public.mv_payments_with_cut') AS payments_view
      `),
      2_000,
      'PostgreSQL schema probe',
    );

    const schema = schemaResult.rows[0] as Record<string, unknown> | undefined;
    const missingTables = [
      'regions_table',
      'payments_table',
      'uploads_table',
      'report_jobs_table',
      'report_templates_table',
      'payments_view',
    ].filter((name) => !schema?.[name]);
    if (missingTables.length > 0) {
      return {
        available: false,
        reason: `PostgreSQL is reachable but migrations are incomplete: ${missingTables.join(', ')}`,
      };
    }

    const regionResult = await withTimeout(
      pool.query('SELECT 1 FROM regions WHERE level = 2 AND geom IS NOT NULL LIMIT 1'),
      2_000,
      'seeded region probe',
    );
    if (regionResult.rows.length === 0) {
      return {
        available: false,
        reason: 'PostgreSQL is reachable but no level-2 region with geometry is seeded',
      };
    }

    const redis = getRedisClient();
    await withTimeout(redis.ping(), 2_000, 'Redis probe');
    await withTimeout(getS3Client().send(new ListBucketsCommand({})), 2_000, 'MinIO/S3 probe');

    return { available: true };
  } catch (error) {
    await closeIntegrationClients();
    const message = error instanceof Error ? error.message : String(error);
    return {
      available: false,
      reason: `integration services are unavailable (PostgreSQL, Redis, and MinIO are required): ${message}`,
    };
  }
}

export async function closeIntegrationClients(): Promise<void> {
  try {
    await withTimeout(shutdownRedis(), 1_000, 'Redis shutdown');
  } catch {
    // A failed preflight may leave the redis client unopened or already closed.
  }

  try {
    await withTimeout(shutdownPg(), 1_000, 'PostgreSQL shutdown');
  } catch {
    // A failed preflight may leave the pool without an established connection.
  }
}

export async function listenApp(app: Express): Promise<AppServer> {
  const server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    await closeServer(server);
    throw new Error('Unable to determine the integration test HTTP server address');
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

export async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

export async function requestJson<T = unknown>(
  baseUrl: string,
  path: string,
  init: Parameters<typeof fetch>[1] = {},
): Promise<HttpResult<T>> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let body: unknown = text;

  if (text.length > 0) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      // Keep non-JSON responses available to the assertion as text.
    }
  }

  return { status: response.status, body: body as T, response };
}

export async function postExcelMultipart<T = unknown>(
  baseUrl: string,
  path: string,
  token: string,
  filename: string,
  buffer: Buffer,
): Promise<HttpResult<T>> {
  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(buffer)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename,
  );

  return requestJson<T>(baseUrl, path, {
    method: 'POST',
    headers: { Authorization: token },
    body: form,
  });
}

export function authHeader(role: 'public' | 'viewer' | 'operator' | 'admin', subject = randomUUID()): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is required to create an integration-test token');
  }

  return `Bearer ${jwt.sign({ sub: subject, role }, secret, { expiresIn: '10m' })}`;
}

export function uniqueLabel(prefix: string): string {
  return `${prefix}-${process.pid}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

export function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function findUnlockedPeriod(pool: Pool): Promise<string> {
  const result = await pool.query(`
    SELECT to_char(candidate.period, 'YYYY-MM') AS period
      FROM (
        SELECT date_trunc('month', CURRENT_DATE) - (month_offset * INTERVAL '1 month') AS period
          FROM generate_series(0, 24) AS offsets(month_offset)
      ) AS candidate
     WHERE NOT EXISTS (
       SELECT 1 FROM fiscal_period_locks lock WHERE lock.period = candidate.period::date
     )
     ORDER BY candidate.period DESC
     LIMIT 1
  `);

  const period = result.rows[0]?.period;
  if (typeof period !== 'string') {
    throw new Error('No unlocked fiscal period is available for integration tests');
  }

  return period;
}

export async function createExcelBuffer(rows: string[][]): Promise<Buffer> {
  // Keep spreadsheet construction lazy so suites skipped before setup do not
  // initialize any external-service clients.
  const headers = ['kode_bps', 'nama_wilayah', 'periode', 'nominal', 'sumber'];
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Data');
  worksheet.addRows([headers, ...rows]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function waitFor<T>(
  operation: () => Promise<T>,
  predicate: (value: T) => boolean,
  options: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const intervalMs = options.intervalMs ?? 200;
  const label = options.label ?? 'condition';
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const value = await operation();
      if (predicate(value)) return value;
    } catch (error) {
      lastError = error;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
  }

  const detail = lastError instanceof Error ? `: ${lastError.message}` : '';
  throw new Error(`Timed out waiting for ${label}${detail}`);
}

export async function cleanupBullMqJobs(
  queueName: string,
  predicate: (data: unknown) => boolean,
): Promise<void> {
  const queue = new Queue(queueName, {
    connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
  });

  try {
    const jobs = await queue.getJobs();
    for (const job of jobs) {
      if (predicate(job.data)) {
        try {
          await job.remove();
        } catch {
          // A completed/active job may have been removed by the worker already.
        }
      }
    }
  } finally {
    await queue.close();
  }
}

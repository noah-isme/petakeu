import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../server';
import { getS3Client } from '../db/minio';
import { getPgPool } from '../db/postgres';
import { getRedisClient } from '../db/redis';
import { buildChoropleth } from '../services/geo-service';
import { initStorage } from '../services/storage-service';
import { getUploadQueue, startUploadWorker } from '../jobs/upload-worker';
import {
  authHeader,
  closeIntegrationClients,
  closeServer,
  cleanupBullMqJobs,
  createExcelBuffer,
  findUnlockedPeriod,
  listenApp,
  postExcelMultipart,
  probeIntegrationInfrastructure,
  requestJson,
  uniqueLabel,
  waitFor,
  type AppServer,
  type HttpResult,
  type IntegrationGate,
} from '../test-utils/integration';

import type { UploadRecord } from '../types/upload';

const UPLOADS_BUCKET = process.env.STORAGE_BUCKET ?? 'uploads';

interface EnqueueUploadResponse {
  uploadId: string;
  status: string;
  hash: string;
}

interface UploadDetailsResponse {
  data: UploadRecord;
}

function featureValue(feature: unknown): number {
  const properties = (feature as { properties?: { value?: number } } | undefined)?.properties;
  return Number(properties?.value ?? 0);
}

async function bestEffort(label: string, operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[integration cleanup] ${label} failed: ${message}`);
  }
}

describe('POST /api/uploads -> upload worker pipeline', () => {
  let gate: IntegrationGate = { available: false };
  let appServer: AppServer | undefined;
  let worker: ReturnType<typeof startUploadWorker> | undefined;
  let queueCreated = false;
  let uploadId: string | undefined;
  let storageKey: string | undefined;
  let source: string | undefined;
  let period: string | undefined;
  let cacheKey: string | undefined;

  beforeAll(async () => {
    gate = await probeIntegrationInfrastructure();
    if (!gate.available) {
      console.info(`[integration] upload pipeline skipped: ${gate.reason}`);
      return;
    }

    try {
      await initStorage();
      worker = startUploadWorker();
      appServer = await listenApp(await createApp());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      gate = {
        available: false,
        reason: `integration setup failed while starting the app, worker, or storage: ${message}`,
      };
      console.info(`[integration] upload pipeline skipped: ${gate.reason}`);
    }
  });

  beforeEach((context) => {
    if (!gate.available) context.skip();
  });

  afterAll(async () => {
    if (appServer) {
      await bestEffort('HTTP server shutdown', () => closeServer(appServer!.server));
    }
    if (worker) {
      await bestEffort('upload worker shutdown', () => worker!.close());
    }
    if (uploadId) {
      await bestEffort('upload queue cleanup', () =>
        cleanupBullMqJobs('upload-processing', (data) => {
          return Boolean(data && typeof data === 'object' && 'uploadId' in data && data.uploadId === uploadId);
        }),
      );
    }
    if (queueCreated) {
      await bestEffort('upload queue client shutdown', () => getUploadQueue().close());
    }

    const hasDatabaseCleanup = Boolean(uploadId || source);
    const pool = hasDatabaseCleanup ? getPgPool() : undefined;
    if (pool && uploadId && !storageKey) {
      await bestEffort('lookup uploaded object key', async () => {
        const result = await pool.query('SELECT storage_path FROM uploads WHERE id = $1', [uploadId]);
        storageKey = result.rows[0]?.storage_path as string | undefined;
      });
    }
    if (storageKey) {
      await bestEffort('uploaded object cleanup', async () => {
        await getS3Client().send(new DeleteObjectCommand({ Bucket: UPLOADS_BUCKET, Key: storageKey }));
      });
    }
    if (pool && source) {
      await bestEffort('payment cleanup and materialized-view refresh', async () => {
        await pool.query('DELETE FROM payments WHERE source = $1', [source]);
        await pool.query('SELECT refresh_mv_payments_with_cut()');
      });
    }
    if (pool && uploadId) {
      await bestEffort('upload record cleanup', async () => {
        await pool.query('DELETE FROM uploads WHERE id = $1', [uploadId]);
      });
    }
    if (cacheKey) {
      await bestEffort('test cache cleanup', async () => {
        await getRedisClient().del(cacheKey!);
      });
    }

    await closeIntegrationClients();
  });

  it('rejects a viewer from creating an upload', async () => {
    const response = await requestJson<{ error?: string }>(appServer!.baseUrl, '/api/uploads', {
      method: 'POST',
      headers: { Authorization: authHeader('viewer') },
    });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/Insufficient permissions/i);
  });

  it('queues an Excel upload and persists payments, the materialized view, and invalidated cache state', async () => {
    const pool = getPgPool();
    const regionResult = await pool.query(`
      SELECT id::text AS id, code_bps, name
        FROM regions
       WHERE level = 2 AND geom IS NOT NULL
       ORDER BY code_bps
       LIMIT 1
    `);
    const region = regionResult.rows[0] as { id: string; code_bps: string; name: string } | undefined;
    expect(region).toBeDefined();

    period = await findUnlockedPeriod(pool);
    source = uniqueLabel('integration-upload');
    cacheKey = `petakeu:geo:choropleth:${period}`;
    const amount = 987_654;

    const before = await buildChoropleth(period);
    const beforeFeature = before.features.find((feature) => String(feature.id) === region!.id);
    const beforeValue = featureValue(beforeFeature);
    expect(await getRedisClient().get(cacheKey)).not.toBeNull();

    const filename = `${source}.xlsx`;
    const workbook = await createExcelBuffer([[region!.code_bps, region!.name, period, String(amount), source]]);
    queueCreated = true;
    const enqueue = await postExcelMultipart<EnqueueUploadResponse>(
      appServer!.baseUrl,
      '/api/uploads',
      authHeader('operator'),
      filename,
      workbook,
    );

    expect(enqueue.status).toBe(202);
    expect(enqueue.body.status).toBe('queued');
    uploadId = enqueue.body.uploadId;

    const finalUpload = await waitFor<HttpResult<UploadDetailsResponse>>(
      () => requestJson<UploadDetailsResponse>(appServer!.baseUrl, `/api/uploads/${uploadId}`, {
        headers: { Authorization: authHeader('operator') },
      }),
      (result) => result.status === 200 && ['persisted', 'failed'].includes(result.body.data?.status),
      { label: `upload ${uploadId} to reach a terminal status` },
    );

    expect(finalUpload.body.data.status).toBe('persisted');
    expect(finalUpload.body.data.summary).toMatchObject({
      totalRows: 1,
      validRows: 1,
      totalAmount: amount,
      periodRange: { from: period, to: period },
    });
    storageKey = finalUpload.body.data.storagePath;

    const paymentResult = await pool.query(`
      SELECT amount::text AS amount,
             to_char(period, 'YYYY-MM') AS period,
             source,
             meta
        FROM payments
       WHERE region_id = $1
         AND period = ($2 || '-01')::date
         AND source = $3
    `, [region!.id, period, source]);
    expect(paymentResult.rows).toHaveLength(1);
    expect(Number(paymentResult.rows[0].amount)).toBe(amount);
    expect(paymentResult.rows[0].period).toBe(period);
    expect(paymentResult.rows[0].source).toBe(source);

    const viewResult = await pool.query(`
      SELECT amount::text AS amount
        FROM mv_payments_with_cut
       WHERE region_id = $1
         AND period = ($2 || '-01')::date
    `, [region!.id, period]);
    expect(viewResult.rows).toHaveLength(1);
    expect(Number(viewResult.rows[0].amount)).toBe(beforeValue + amount);

    expect(await getRedisClient().get(cacheKey)).toBeNull();
    const after = await buildChoropleth(period);
    const afterFeature = after.features.find((feature) => String(feature.id) === region!.id);
    expect(featureValue(afterFeature)).toBe(beforeValue + amount);
  });
});

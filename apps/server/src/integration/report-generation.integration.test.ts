import { DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../server';
import { getS3Client } from '../db/minio';
import { getPgPool } from '../db/postgres';
import { getReportQueue, startReportWorker } from '../jobs/report-worker';
import { initStorage } from '../services/storage-service';
import {
  authHeader,
  closeIntegrationClients,
  closeServer,
  cleanupBullMqJobs,
  findUnlockedPeriod,
  listenApp,
  probeIntegrationInfrastructure,
  requestJson,
  waitFor,
  type AppServer,
  type HttpResult,
  type IntegrationGate,
} from '../test-utils/integration';

import type { ReportJob } from '../types/report';

const REPORTS_BUCKET = process.env.STORAGE_REPORTS_BUCKET ?? 'reports';

interface EnqueueReportResponse {
  data: ReportJob;
}

interface ReportDetailsResponse {
  data: ReportJob;
}

async function bestEffort(label: string, operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[integration cleanup] ${label} failed: ${message}`);
  }
}

describe('POST /api/reports/export -> report worker pipeline', () => {
  let gate: IntegrationGate = { available: false };
  let appServer: AppServer | undefined;
  let worker: ReturnType<typeof startReportWorker> | undefined;
  let queueCreated = false;
  let jobId: string | undefined;
  let period: string | undefined;

  beforeAll(async () => {
    gate = await probeIntegrationInfrastructure();
    if (!gate.available) {
      console.info(`[integration] report generation skipped: ${gate.reason}`);
      return;
    }

    try {
      await initStorage();
      worker = startReportWorker();
      appServer = await listenApp(await createApp());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      gate = {
        available: false,
        reason: `integration setup failed while starting the app, worker, or storage: ${message}`,
      };
      console.info(`[integration] report generation skipped: ${gate.reason}`);
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
      await bestEffort('report worker shutdown', () => worker!.close());
    }
    if (jobId) {
      await bestEffort('report queue cleanup', () =>
        cleanupBullMqJobs('report-generation', (data) => {
          return Boolean(data && typeof data === 'object' && 'jobId' in data && data.jobId === jobId);
        }),
      );
    }
    if (queueCreated) {
      await bestEffort('report queue client shutdown', () => getReportQueue().close());
    }
    if (jobId) {
      await bestEffort('report object cleanup', async () => {
        await getS3Client().send(new DeleteObjectCommand({
          Bucket: REPORTS_BUCKET,
          Key: `${jobId}.xlsx`,
        }));
      });
      await bestEffort('report job cleanup', async () => {
        await getPgPool().query('DELETE FROM report_jobs WHERE id = $1', [jobId]);
      });
    }

    await closeIntegrationClients();
  });

  it('rejects a public token from requesting an export', async () => {
    const response = await requestJson<{ error?: string }>(appServer!.baseUrl, '/api/reports/export', {
      method: 'POST',
      headers: {
        Authorization: authHeader('public'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ period: '2020-01', regionIds: ['00000000-0000-0000-0000-000000000000'], format: 'excel' }),
    });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/Insufficient permissions/i);
  });

  it('queues an Excel export, persists it in MinIO, and exposes a completed presigned URL', async () => {
    const pool = getPgPool();
    const regionResult = await pool.query(`
      SELECT id::text AS id
        FROM regions
       WHERE level = 2 AND geom IS NOT NULL
       ORDER BY code_bps
       LIMIT 1
    `);
    const regionId = regionResult.rows[0]?.id as string | undefined;
    expect(regionId).toBeDefined();
    period = await findUnlockedPeriod(pool);

    queueCreated = true;
    const enqueue = await requestJson<EnqueueReportResponse>(appServer!.baseUrl, '/api/reports/export', {
      method: 'POST',
      headers: {
        Authorization: authHeader('viewer'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ period, regionIds: [regionId], format: 'excel' }),
    });

    expect(enqueue.status).toBe(201);
    expect(enqueue.body.data.status).toBe('queued');
    jobId = enqueue.body.data.jobId;

    const completed = await waitFor<HttpResult<ReportDetailsResponse>>(
      () => requestJson<ReportDetailsResponse>(appServer!.baseUrl, `/api/reports/${jobId}`, {
        headers: { Authorization: authHeader('viewer') },
      }),
      (result) => result.status === 200 && ['completed', 'failed'].includes(result.body.data?.status),
      { label: `report ${jobId} to reach a terminal status` },
    );

    expect(completed.body.data.status).toBe('completed');
    expect(completed.body.data.downloadUrl).toBeTruthy();

    const downloadUrl = new URL(completed.body.data.downloadUrl!);
    expect(downloadUrl.searchParams.get('X-Amz-Signature')).toBeTruthy();
    expect(downloadUrl.searchParams.get('X-Amz-Expires')).toBe('86400');

    const head = await getS3Client().send(new HeadObjectCommand({
      Bucket: REPORTS_BUCKET,
      Key: `${jobId}.xlsx`,
    }));
    expect(Number(head.ContentLength)).toBeGreaterThan(0);

    const download = await fetch(completed.body.data.downloadUrl!);
    expect(download.ok).toBe(true);
    const reportBytes = Buffer.from(await download.arrayBuffer());
    expect(reportBytes.length).toBeGreaterThan(0);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(reportBytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(
      expect.arrayContaining([`Setoran ${period}`, 'Top 10 Peringkat']),
    );

    const persisted = await pool.query(
      'SELECT status, download_url, summary FROM report_jobs WHERE id = $1',
      [jobId],
    );
    expect(persisted.rows).toHaveLength(1);
    expect(persisted.rows[0].status).toBe('completed');
    expect(persisted.rows[0].download_url).toBe(completed.body.data.downloadUrl);
    expect(persisted.rows[0].summary).toBeTruthy();
  });
});

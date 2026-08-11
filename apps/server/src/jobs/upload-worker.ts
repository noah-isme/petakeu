import { Queue, Worker, Job } from 'bullmq';
import { read, utils } from 'xlsx';

import { getPgPool } from '../db/postgres';
import { invalidateChoroplethCache } from '../services/geo-service';
import { invalidateRegionCache } from '../services/region-service';
import { invalidateFiscalCache } from '../services/fiscal-service';
import { invalidateDefisitwatchCache } from '../services/defisitwatch-service';
import { invalidateRankfinCache } from '../services/rankfin-service';
import { logger } from '../utils/logger';
import {
  workerJobsTotal,
  workerJobDuration,
  uploadsTotal,
  uploadParseErrorsTotal,
} from '../utils/metrics';

const QUEUE_NAME = 'upload-processing';

let _queue: Queue | undefined;
export function getUploadQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, {
      connection: {
        url: process.env.REDIS_URL ?? 'redis://localhost:6379',
      },
    });
  }
  return _queue;
}
export const uploadQueue = {
  add: (...args: Parameters<Queue['add']>) => getUploadQueue().add(...args),
};

const EXPECTED_HEADERS = ['kode_bps', 'nama_wilayah', 'periode', 'nominal', 'sumber'];
const PERIOD_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isFuturePeriod(period: string, referenceDate: Date = new Date()): boolean {
  if (!period || !PERIOD_REGEX.test(period)) {
    return false;
  }
  const [yearStr, monthStr] = period.split('-');
  const targetYear = parseInt(yearStr, 10);
  const targetMonth = parseInt(monthStr, 10);

  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth() + 1;

  if (targetYear > refYear) return true;
  if (targetYear < refYear) return false;
  return targetMonth > refMonth;
}

function normalizeHeader(v: string) {
  return v.trim().toLowerCase().replace(/\s+/g, '_');
}

class UploadParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadParseError';
  }
}

function parseRows(buffer: Buffer) {
  let workbook;
  try {
    workbook = read(buffer, { type: 'buffer' });
  } catch (error) {
    throw new UploadParseError(error instanceof Error ? error.message : 'File tidak dapat dibaca');
  }
  const [firstSheet] = workbook.SheetNames;
  if (!firstSheet) throw new UploadParseError('File tidak memiliki sheet');
  const sheet = workbook.Sheets[firstSheet];
  return utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' }) as string[][];
}

export async function processUpload(job: Job): Promise<void> {
  const startTime = Date.now();
  const { uploadId, buffer: bufferB64 } = job.data;
  const pool = getPgPool();
  let workerStatus: 'success' | 'failed' = 'success';
  let observedPeriod: string | undefined;

  // Mark as processing
  await pool.query(
    `UPDATE uploads SET status = 'processing', updated_at = NOW() WHERE id = $1`,
    [uploadId]
  );

  try {
    const buffer = Buffer.from(bufferB64, 'base64');
    const rows = parseRows(buffer);

    if (rows.length <= 1) {
      await pool.query(
        `UPDATE uploads SET status = 'parsed', summary = $2, updated_at = NOW() WHERE id = $1`,
        [uploadId, JSON.stringify({ totalRows: 0, validRows: 0, totalAmount: 0, periodRange: {} })]
      );
      uploadsTotal.inc({ status: 'parsed' });
      workerJobsTotal.inc({ worker: 'upload', status: 'success' });
      return;
    }

    const [rawHeaders, ...dataRows] = rows;
    const headers = rawHeaders.map(normalizeHeader);
    const missing = EXPECTED_HEADERS.filter((h) => !headers.includes(h));
    if (missing.length) {
      throw new UploadParseError(`Header tidak valid. Kolom wajib: ${missing.join(', ')}`);
    }

    const errors: Array<{ row: number; column: string; message: string }> = [];
    let validRows = 0;
    let totalAmount = 0;
    let minPeriod: string | undefined;
    let maxPeriod: string | undefined;
    const validPayments: Array<{
      regionId: string;
      period: string;
      amount: number;
      source: string;
      meta: Record<string, unknown>;
    }> = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNum = i + 2;
      const [kodeBps, , periodeRaw, nominalRaw, sumber] = row;

      const code = kodeBps?.trim();
      const period = periodeRaw?.trim();
      const nominal = Number(nominalRaw);
      const source = sumber?.trim();

      let rowHasError = false;

      if (!code) {
        errors.push({ row: rowNum, column: 'kode_bps', message: 'Kode BPS wajib diisi' });
        rowHasError = true;
      }
      if (!period || !PERIOD_REGEX.test(period)) {
        errors.push({ row: rowNum, column: 'periode', message: 'Format periode harus YYYY-MM' });
        rowHasError = true;
      }
      if (!Number.isFinite(nominal) || nominal < 0) {
        errors.push({ row: rowNum, column: 'nominal', message: 'Nominal harus berupa angka positif' });
        rowHasError = true;
      }
      if (!source) {
        errors.push({ row: rowNum, column: 'sumber', message: 'Sumber wajib diisi' });
        rowHasError = true;
      }

      if (rowHasError) continue;

      // Resolve region_id from code_bps
      const regionRes = await pool.query(
        'SELECT id::text FROM regions WHERE code_bps = $1',
        [code]
      );
      if (regionRes.rows.length === 0) {
        errors.push({ row: rowNum, column: 'kode_bps', message: `Wilayah dengan kode BPS '${code}' tidak ditemukan` });
        continue;
      }

      const isFuture = isFuturePeriod(period);
      const meta = isFuture ? { forecast: false } : {};

      validPayments.push({
        regionId: regionRes.rows[0].id,
        period,
        amount: nominal,
        source,
        meta,
      });

      observedPeriod ??= period;

      if (!minPeriod || period < minPeriod) minPeriod = period;
      if (!maxPeriod || period > maxPeriod) maxPeriod = period;
      totalAmount += nominal;
      validRows++;
    }

    if (errors.length > 0) {
      uploadParseErrorsTotal?.inc(errors.length);
    }

    // Bulk upsert payments
    if (validPayments.length > 0) {
      for (const payment of validPayments) {
        await pool.query(
          `INSERT INTO payments(id, region_id, period, amount, source, meta)
           VALUES(gen_random_uuid(), $1, ($2 || '-01')::date, $3, $4, $5::jsonb)
           ON CONFLICT (region_id, period, source) DO UPDATE SET amount = EXCLUDED.amount, meta = EXCLUDED.meta, updated_at = NOW()`,
          [payment.regionId, payment.period, payment.amount, payment.source, JSON.stringify(payment.meta)]
        );
      }
      // Refresh materialized view
      try {
        await pool.query('SELECT refresh_mv_payments_with_cut()');
      } catch (mvErr) {
        logger.warn({ err: mvErr }, '[upload-worker] MV refresh failed (non-fatal)');
      }

      // Invalidate caches after successful data update
      await invalidateChoroplethCache();
      await invalidateRegionCache();
      await invalidateFiscalCache();
      await invalidateDefisitwatchCache();
      await invalidateRankfinCache();
    }

    const summary = {
      totalRows: dataRows.length,
      validRows,
      totalAmount,
      periodRange: { from: minPeriod, to: maxPeriod },
    };

    const finalStatus = errors.length > 0 ? (validRows > 0 ? 'persisted' : 'failed') : 'persisted';

    await pool.query(
      `UPDATE uploads
       SET status = $2, summary = $3, errors = $4, error_count = $5, updated_at = NOW()
       WHERE id = $1`,
      [uploadId, finalStatus, JSON.stringify(summary), JSON.stringify(errors), errors.length]
    );

    uploadsTotal.inc({ status: finalStatus });
    workerJobsTotal.inc({ worker: 'upload', status: 'success' });
  } catch (err) {
    workerStatus = 'failed';
    if (err instanceof UploadParseError) {
      uploadParseErrorsTotal?.inc();
    }
    const errMsg = err instanceof Error ? err.message : 'Gagal memproses file';
    await pool.query(
      `UPDATE uploads
       SET status = 'failed', errors = $2, error_count = 1, updated_at = NOW()
       WHERE id = $1`,
      [uploadId, JSON.stringify([{ row: 0, column: 'file', message: errMsg }])]
    );
    uploadsTotal.inc({ status: 'failed' });
    workerJobsTotal.inc({ worker: 'upload', status: 'failed' });
    throw err; // BullMQ will retry
  } finally {
    const durationMs = Date.now() - startTime;
    workerJobDuration.observe({ worker: 'upload', job_type: 'process_upload' }, durationMs / 1000);
    logger.info(
      { jobId: job.id, uploadId, period: observedPeriod, status: workerStatus, duration_ms: durationMs },
      '[upload-worker] Job finished'
    );
  }
}

export function startUploadWorker() {
  const worker = new Worker(QUEUE_NAME, processUpload, {
    connection: {
      url: process.env.REDIS_URL ?? 'redis://localhost:6379',
    },
    concurrency: 2,
  });

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, '[upload-worker] Job completed');
  });
  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, '[upload-worker] Job failed');
  });

  logger.info('[upload-worker] Started');
  return worker;
}

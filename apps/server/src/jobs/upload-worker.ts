import { Queue, Worker, Job } from 'bullmq';
import { read, utils } from 'xlsx';

import { getPgPool } from '../db/postgres';
import { invalidateChoroplethCache } from '../services/geo-service';
import { logger } from '../utils/logger';
import { workerJobsTotal, workerJobDuration, uploadsTotal } from '../utils/metrics';

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

function normalizeHeader(v: string) {
  return v.trim().toLowerCase().replace(/\s+/g, '_');
}

function parseRows(buffer: Buffer) {
  const workbook = read(buffer, { type: 'buffer' });
  const [firstSheet] = workbook.SheetNames;
  if (!firstSheet) throw new Error('File tidak memiliki sheet');
  const sheet = workbook.Sheets[firstSheet];
  return utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' }) as string[][];
}

async function processUpload(job: Job): Promise<void> {
  const startTime = Date.now();
  const { uploadId, buffer: bufferB64 } = job.data;
  const pool = getPgPool();

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
      return;
    }

    const [rawHeaders, ...dataRows] = rows;
    const headers = rawHeaders.map(normalizeHeader);
    const missing = EXPECTED_HEADERS.filter((h) => !headers.includes(h));
    if (missing.length) {
      throw new Error(`Header tidak valid. Kolom wajib: ${missing.join(', ')}`);
    }

    const errors: Array<{ row: number; column: string; message: string }> = [];
    let validRows = 0;
    let totalAmount = 0;
    let minPeriod: string | undefined;
    let maxPeriod: string | undefined;
    const validPayments: Array<{ regionId: string; period: string; amount: number; source: string }> = [];

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

      validPayments.push({
        regionId: regionRes.rows[0].id,
        period,
        amount: nominal,
        source,
      });

      if (!minPeriod || period < minPeriod) minPeriod = period;
      if (!maxPeriod || period > maxPeriod) maxPeriod = period;
      totalAmount += nominal;
      validRows++;
    }

    // Bulk upsert payments
    if (validPayments.length > 0) {
      for (const payment of validPayments) {
        await pool.query(
          `INSERT INTO payments(id, region_id, period, amount, source)
           VALUES(gen_random_uuid(), $1, ($2 || '-01')::date, $3, $4)
           ON CONFLICT (region_id, period, source) DO UPDATE SET amount = EXCLUDED.amount, updated_at = NOW()`,
          [payment.regionId, payment.period, payment.amount, payment.source]
        );
      }
      // Refresh materialized view
      try {
        await pool.query('SELECT refresh_mv_payments_with_cut()');
      } catch (mvErr) {
        logger.warn({ err: mvErr }, '[upload-worker] MV refresh failed (non-fatal)');
      }

      // Invalidate choropleth cache after successful data update
      await invalidateChoroplethCache();
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
    workerJobDuration.observe({ worker: 'upload', job_type: 'process_upload' }, (Date.now() - startTime) / 1000);
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
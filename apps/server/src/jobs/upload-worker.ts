import { Queue, Worker, Job } from 'bullmq';
import ExcelJS from 'exceljs';

import { getPgPool } from '../db/postgres';
import { invalidateChoroplethCache } from '../services/geo-service';
import { invalidateRegionCache } from '../services/region-service';
import { invalidateFiscalCache } from '../services/fiscal-service';
import { invalidateDefisitwatchCache } from '../services/defisitwatch-service';
import { invalidateRankfinCache } from '../services/rankfin-service';
import {
  parseSheetRows,
  validateUploadRow,
  type ParsedUploadRow,
  type ValidatedUploadRow,
} from '../services/upload-validation';
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

function requiresUploadConfirmation(): boolean {
  return process.env.UPLOAD_REQUIRE_CONFIRMATION === 'true';
}

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

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value);

  const cell = value as Record<string, unknown>;
  if ('result' in cell) return cellText(cell.result);
  if (typeof cell.text === 'string') return cell.text;
  if (Array.isArray(cell.richText)) {
    return cell.richText
      .map((part) => (part && typeof part === 'object' && 'text' in part ? String(part.text) : ''))
      .join('');
  }
  return String(value);
}

async function parseRows(buffer: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch (error) {
    throw new UploadParseError(error instanceof Error ? error.message : 'File tidak dapat dibaca');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new UploadParseError('File tidak memiliki sheet');

  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    rows.push(values.map(cellText));
  });
  return rows;
}

function findingToError(rowNumber: number, finding: ValidatedUploadRow['findings'][number]) {
  return {
    row: rowNumber,
    column: finding.column,
    code: finding.code,
    severity: finding.severity,
    message: finding.message,
    details: finding.details,
  };
}

async function stageUpload(
  pool: ReturnType<typeof getPgPool>,
  uploadId: string,
  rows: ParsedUploadRow[],
): Promise<void> {
  let totalAmount = 0;
  let validRows = 0;
  let errorCount = 0;
  let warningCount = 0;
  let minPeriod: string | undefined;
  let maxPeriod: string | undefined;
  const allErrors: ReturnType<typeof findingToError>[] = [];

  await pool.query(
    `UPDATE uploads SET status = 'parsing', row_count = $2, updated_at = NOW() WHERE id = $1`,
    [uploadId, rows.length],
  );

  for (const input of rows) {
    const validated = await validateUploadRow(pool, input);
    const errors = validated.findings.filter((finding) => finding.severity === 'error');
    const warnings = validated.findings.filter((finding) => finding.severity === 'warning');
    errorCount += errors.length;
    warningCount += warnings.length;
    if (errors.length === 0) {
      validRows += 1;
      if (validated.grossAmount !== null) totalAmount += validated.grossAmount;
      if (validated.period && (!minPeriod || validated.period < minPeriod)) minPeriod = validated.period;
      if (validated.period && (!maxPeriod || validated.period > maxPeriod)) maxPeriod = validated.period;
    }
    allErrors.push(...validated.findings.map((finding) => findingToError(input.rowNumber, finding)));

    const staged = await pool.query<{ id: string; revision: number }>(
      `INSERT INTO staged_upload_rows(
         upload_id, row_number, revision, raw_values,
         province_raw, region_raw, code_bps_raw, source_raw,
         region_id, region_level, region_code, region_name, province_region_id,
         period, gross_amount, share_amount, net_amount, target_amount,
         status, error_count, warning_count, acknowledged_warning_ids, updated_at
       ) VALUES($1, $2, 1, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                ($13 || '-01')::date, $14, $15, $16, $17, $18, $19, $20, ARRAY[]::uuid[], NOW())
       ON CONFLICT(upload_id, row_number) DO UPDATE SET
         revision = staged_upload_rows.revision + 1,
         raw_values = EXCLUDED.raw_values,
         province_raw = EXCLUDED.province_raw,
         region_raw = EXCLUDED.region_raw,
         code_bps_raw = EXCLUDED.code_bps_raw,
         source_raw = EXCLUDED.source_raw,
         region_id = EXCLUDED.region_id,
         region_level = EXCLUDED.region_level,
         region_code = EXCLUDED.region_code,
         region_name = EXCLUDED.region_name,
         province_region_id = EXCLUDED.province_region_id,
         period = EXCLUDED.period,
         gross_amount = EXCLUDED.gross_amount,
         share_amount = EXCLUDED.share_amount,
         net_amount = EXCLUDED.net_amount,
         target_amount = EXCLUDED.target_amount,
         status = EXCLUDED.status,
         error_count = EXCLUDED.error_count,
         warning_count = EXCLUDED.warning_count,
         acknowledged_warning_ids = ARRAY[]::uuid[],
         updated_at = NOW()
       RETURNING id::text, revision`,
      [
        uploadId,
        input.rowNumber,
        JSON.stringify(input.rawValues),
        input.provinceRaw || null,
        input.regionRaw || null,
        input.codeBpsRaw || null,
        input.sourceRaw || null,
        validated.regionId,
        validated.regionLevel,
        validated.regionCode,
        validated.regionName,
        validated.provinceRegionId,
        validated.period,
        validated.grossAmount,
        validated.shareAmount,
        validated.netAmount,
        validated.targetAmount,
        errors.length === 0 ? 'valid' : 'invalid',
        errors.length,
        warnings.length,
      ],
    );
    const stagedRow = staged.rows[0];
    if (!stagedRow) continue;
    for (const finding of validated.findings) {
      await pool.query(
        `INSERT INTO upload_validation_findings(
           upload_id, staged_row_id, revision, severity, code, column_name,
           message, details, created_by
         ) VALUES($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
        [
          uploadId,
          stagedRow.id,
          stagedRow.revision,
          finding.severity,
          finding.code,
          finding.column,
          finding.message,
          JSON.stringify(finding.details ?? {}),
          null,
        ],
      );
    }
  }

  const summary = {
    totalRows: rows.length,
    validRows,
    totalAmount,
    periodRange: { from: minPeriod, to: maxPeriod },
    errorCount,
    warningCount,
  };
  const status = 'awaiting_confirmation';
  await pool.query(
    `UPDATE uploads
        SET status = $2, summary = $3::jsonb, errors = $4::jsonb,
            error_count = $5, valid_row_count = $6, warning_count = $7,
            updated_at = NOW()
      WHERE id = $1`,
    [uploadId, status, JSON.stringify(summary), JSON.stringify(allErrors), errorCount, validRows, warningCount],
  );
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
    const rows = await parseRows(buffer);

    if (requiresUploadConfirmation()) {
      try {
        const stagedSheet = parseSheetRows(rows);
        await stageUpload(pool, uploadId, stagedSheet.rows);
      } catch (error) {
        if (error instanceof UploadParseError) throw error;
        throw new UploadParseError(error instanceof Error ? error.message : 'File tidak dapat divalidasi');
      }
      uploadsTotal.inc({ status: 'awaiting_confirmation' });
      workerJobsTotal.inc({ worker: 'upload', status: 'success' });
      return;
    }

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
      shareAmount: number;
      netAmount: number;
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
        shareAmount: Math.round(nominal * 0.15 * 100) / 100,
        netAmount: Math.round(nominal * 0.85 * 100) / 100,
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
          `INSERT INTO payments(
             id, region_id, period, amount, source, meta,
             gross_amount, share_amount, net_amount, upload_id
           ) VALUES(gen_random_uuid(), $1, ($2 || '-01')::date, $3, $4, $5::jsonb, $3, $6, $7, $8)
           ON CONFLICT (region_id, period, source) DO UPDATE SET
             amount = EXCLUDED.amount,
             gross_amount = EXCLUDED.gross_amount,
             share_amount = EXCLUDED.share_amount,
             net_amount = EXCLUDED.net_amount,
             upload_id = EXCLUDED.upload_id,
             meta = EXCLUDED.meta,
             updated_at = NOW()`,
          [
            payment.regionId,
            payment.period,
            payment.amount,
            payment.source,
            JSON.stringify(payment.meta),
            payment.shareAmount,
            payment.netAmount,
            uploadId,
          ]
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

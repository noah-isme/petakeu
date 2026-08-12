import { createHash } from 'node:crypto';

import { getPgPool } from '../db/postgres';
import { uploadQueue } from '../jobs/upload-worker';
import { AppError } from '../utils/app-error';
import { uploadsTotal } from '../utils/metrics';

import {
  normalizeAlias,
  validateUploadRow,
  type ParsedUploadRow,
  type ValidatedUploadRow,
} from './upload-validation';
import { invalidateChoroplethCache } from './geo-service';
import { invalidateRegionCache } from './region-service';
import { invalidateFiscalCache } from './fiscal-service';
import { invalidateDefisitwatchCache } from './defisitwatch-service';
import { invalidateRankfinCache } from './rankfin-service';

import type { PoolClient } from 'pg';
import type {
  ConfirmUploadInput,
  RegionAlias,
  RegionAliasInput,
  StagedRowPatch,
  StagedUploadRow,
  UploadErrorDetail,
  UploadRecord,
  UploadRequest,
  UploadResult,
} from '../types/upload';

const ACCEPTED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

function validateUpload(request: UploadRequest): void {
  if (!ACCEPTED_MIME_TYPES.has(request.mimetype)) {
    throw new AppError('Format file tidak didukung. Gunakan file Excel (.xlsx atau .xls)', 400);
  }
  if (request.size > MAX_UPLOAD_SIZE) {
    throw new AppError('Ukuran file melebihi 10 MB', 400);
  }
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch (_error) {
    return fallback;
  }
}

function rowToRecord(row: Record<string, unknown>): UploadRecord {
  return {
    uploadId: String(row.id),
    filename: String(row.filename),
    mimetype: String(row.mimetype),
    size: Number(row.size_bytes ?? 0),
    status: row.status as UploadRecord['status'],
    hash: String(row.hash),
    storagePath: (row.storage_path as string | null) ?? undefined,
    fileUrl: (row.file_url as string | null) ?? undefined,
    errorCount: Number(row.error_count ?? 0),
    errors: parseJson<UploadErrorDetail[]>(row.errors, []),
    summary: parseJson<UploadRecord['summary']>(row.summary, undefined),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    createdBy: (row.created_by as string | null) ?? null,
    confirmedBy: (row.confirmed_by as string | null) ?? null,
    confirmedAt: (row.confirmed_at as string | null) ?? null,
    cancelledBy: (row.cancelled_by as string | null) ?? null,
    cancelledAt: (row.cancelled_at as string | null) ?? null,
    committedAt: (row.committed_at as string | null) ?? null,
    rowCount: Number(row.row_count ?? 0),
    validRowCount: Number(row.valid_row_count ?? 0),
    warningCount: Number(row.warning_count ?? 0),
  };
}

function dbPeriod(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = String(value);
  return raw.length >= 7 ? raw.slice(0, 7) : raw;
}

function rowToStaged(row: Record<string, unknown>, findings: UploadErrorDetail[] = []): StagedUploadRow {
  const acknowledged = Array.isArray(row.acknowledged_warning_ids)
    ? row.acknowledged_warning_ids.map(String)
    : [];
  const acknowledgedIds = new Set(acknowledged);
  return {
    id: String(row.id),
    rowId: String(row.id),
    uploadId: String(row.upload_id),
    rowNumber: Number(row.row_number),
    revision: Number(row.revision),
    rawValues: parseJson<Record<string, unknown>>(row.raw_values, {}),
    provinceRaw: (row.province_raw as string | null) ?? null,
    province: (row.province_raw as string | null) ?? null,
    regionRaw: (row.region_raw as string | null) ?? null,
    codeBpsRaw: (row.code_bps_raw as string | null) ?? null,
    sourceRaw: (row.source_raw as string | null) ?? null,
    source: (row.source_raw as string | null) ?? null,
    regionId: (row.region_id as string | null) ?? null,
    regionLevel: row.region_level === null ? null : Number(row.region_level),
    regionCode: (row.region_code as string | null) ?? null,
    regionName: (row.region_name as string | null) ?? null,
    provinceRegionId: (row.province_region_id as string | null) ?? null,
    period: dbPeriod(row.period as string | null),
    grossAmount: row.gross_amount === null ? null : Number(row.gross_amount),
    shareAmount: row.share_amount === null ? null : Number(row.share_amount),
    netAmount: row.net_amount === null ? null : Number(row.net_amount),
    targetAmount: row.target_amount === null ? null : Number(row.target_amount),
    status: row.status as StagedUploadRow['status'],
    errorCount: Number(row.error_count ?? 0),
    warningCount: Number(row.warning_count ?? 0),
    acknowledgedWarningIds: acknowledged,
    findings: findings.map((finding) => ({
      ...finding,
      acknowledged: finding.id ? acknowledgedIds.has(finding.id) : false,
    })),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

async function withTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPgPool().connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_rollbackError) {
      // Keep the original error.
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function enqueueUpload(request: UploadRequest): Promise<UploadResult> {
  validateUpload(request);
  const pool = getPgPool();
  const hash = createHash('sha256').update(request.buffer).digest('hex');
  const existing = await pool.query('SELECT id::text, status FROM uploads WHERE hash = $1', [hash]);
  if (existing.rows.length > 0) {
    return { uploadId: existing.rows[0].id, status: existing.rows[0].status, hash };
  }

  const { uploadFile } = await import('./storage-service');
  const storageKey = `${Date.now()}-${request.filename}`;
  const fileUrl = await uploadFile(storageKey, request.buffer, request.mimetype);
  const { rows } = await pool.query(
    `INSERT INTO uploads(filename, mimetype, size_bytes, hash, status, storage_path, file_url, created_by)
     VALUES($1, $2, $3, $4, 'queued', $5, $6, $7)
     RETURNING id::text, status`,
    [request.filename, request.mimetype, request.size, hash, storageKey, fileUrl, request.actorId ?? null],
  );
  const uploadId = String(rows[0].id);
  await uploadQueue.add(
    'process-upload',
    { uploadId, buffer: request.buffer.toString('base64'), filename: request.filename },
    { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
  );
  return { uploadId, status: 'queued', hash };
}

export async function listUploads(): Promise<UploadRecord[]> {
  const { rows } = await getPgPool().query('SELECT * FROM uploads ORDER BY created_at DESC LIMIT 100');
  return rows.map(rowToRecord);
}

export async function getUpload(uploadId: string): Promise<UploadRecord | undefined> {
  const { rows } = await getPgPool().query('SELECT * FROM uploads WHERE id = $1', [uploadId]);
  return rows.length ? rowToRecord(rows[0]) : undefined;
}

const STAGED_ROW_COLUMNS = `
  id::text, upload_id::text, row_number, revision, raw_values,
  province_raw, region_raw, code_bps_raw, source_raw,
  region_id::text, region_level, region_code, region_name, province_region_id::text,
  period, gross_amount, share_amount, net_amount, target_amount,
  status, error_count, warning_count, acknowledged_warning_ids, created_at, updated_at`;

async function findingsForRows(uploadId: string, rows: Record<string, unknown>[]): Promise<StagedUploadRow[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => String(row.id));
  const result = await getPgPool().query(
    `SELECT f.id::text, f.staged_row_id::text, s.row_number,
            f.severity, f.code, f.column_name, f.message, f.details
       FROM upload_validation_findings f
       JOIN staged_upload_rows s ON s.id = f.staged_row_id AND s.revision = f.revision
      WHERE f.upload_id = $1 AND f.staged_row_id = ANY($2::uuid[])
      ORDER BY s.row_number, f.created_at`,
    [uploadId, ids],
  );
  const byRow = new Map<string, UploadErrorDetail[]>();
  for (const finding of result.rows) {
    const key = String(finding.staged_row_id);
    const list = byRow.get(key) ?? [];
    list.push({
      id: String(finding.id),
      row: Number(finding.row_number),
      column: String(finding.column_name ?? ''),
      code: String(finding.code),
      severity: finding.severity,
      message: String(finding.message),
      details: parseJson<Record<string, unknown>>(finding.details, {}),
    });
    byRow.set(key, list);
  }
  return rows.map((row) => rowToStaged(row, byRow.get(String(row.id)) ?? []));
}

export async function getUploadRows(
  uploadId: string,
  page = 1,
  pageSize = 50,
): Promise<{ data: StagedUploadRow[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(200, Math.max(1, pageSize));
  const pool = getPgPool();
  const countResult = await pool.query('SELECT COUNT(*)::int AS total FROM staged_upload_rows WHERE upload_id = $1', [uploadId]);
  const total = Number(countResult.rows[0]?.total ?? 0);
  const result = await pool.query(
    `SELECT ${STAGED_ROW_COLUMNS}
       FROM staged_upload_rows
      WHERE upload_id = $1
      ORDER BY row_number
      LIMIT $2 OFFSET $3`,
    [uploadId, safePageSize, (safePage - 1) * safePageSize],
  );
  const data = await findingsForRows(uploadId, result.rows);
  return { data, total, page: safePage, pageSize: safePageSize, totalPages: Math.ceil(total / safePageSize) };
}

async function currentRow(client: PoolClient, uploadId: string, rowId: string, forUpdate = false): Promise<Record<string, unknown>> {
  const result = await client.query(
    `SELECT ${STAGED_ROW_COLUMNS}
       FROM staged_upload_rows
      WHERE upload_id = $1 AND id::text = $2
      LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [uploadId, rowId],
  );
  if (result.rows.length === 0) throw new AppError('Staged upload row not found', 404);
  return result.rows[0];
}

function rowToValidationInput(row: Record<string, unknown>, patch: StagedRowPatch): ParsedUploadRow {
  const rawValues = parseJson<Record<string, unknown>>(row.raw_values, {});
  const provinceRaw = patch.province === undefined ? String(row.province_raw ?? '') : String(patch.province ?? '');
  const regionRaw = patch.region === undefined ? String(row.region_raw ?? '') : String(patch.region ?? '');
  const codeBpsRaw = patch.codeBps === undefined ? String(row.code_bps_raw ?? '') : String(patch.codeBps ?? '');
  const sourceRaw = patch.source === undefined ? String(row.source_raw ?? '') : String(patch.source ?? '');
  const periodRaw = patch.period === undefined ? dbPeriod(String(row.period ?? '')) ?? '' : String(patch.period ?? '');
  const grossRaw = patch.grossAmount === undefined ? row.gross_amount : patch.grossAmount;
  const shareRaw = patch.shareAmount === undefined ? row.share_amount : patch.shareAmount;
  const netRaw = patch.netAmount === undefined ? row.net_amount : patch.netAmount;
  const targetRaw = patch.targetAmount === undefined ? row.target_amount : patch.targetAmount;
  return {
    rowNumber: Number(row.row_number),
    rawValues: {
      ...rawValues,
      province: provinceRaw,
      region: regionRaw,
      code_bps: codeBpsRaw,
      source: sourceRaw,
      period: periodRaw,
      gross_amount: grossRaw ?? '',
      share_amount: shareRaw ?? '',
      net_amount: netRaw ?? '',
      target_amount: targetRaw ?? '',
    },
    provinceRaw,
    regionRaw,
    codeBpsRaw,
    sourceRaw,
    periodRaw,
    grossRaw,
    shareRaw,
    netRaw,
    targetRaw,
  };
}

async function insertFindings(client: PoolClient, uploadId: string, stagedId: string, revision: number, validated: ValidatedUploadRow, actorId: string): Promise<void> {
  for (const finding of validated.findings) {
    await client.query(
      `INSERT INTO upload_validation_findings(
         upload_id, staged_row_id, revision, severity, code, column_name, message, details, created_by
       ) VALUES($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
      [uploadId, stagedId, revision, finding.severity, finding.code, finding.column, finding.message, JSON.stringify(finding.details ?? {}), actorId],
    );
  }
}

async function updateUploadCounters(client: PoolClient, uploadId: string): Promise<void> {
  await client.query(
    `WITH current_rows AS (
       SELECT s.id,
              BOOL_OR(f.severity = 'error') AS has_error,
              COUNT(f.id) FILTER (WHERE f.severity = 'error')::int AS error_count,
              COUNT(f.id) FILTER (WHERE f.severity = 'warning')::int AS warning_count
         FROM staged_upload_rows s
         LEFT JOIN upload_validation_findings f
           ON f.staged_row_id = s.id AND f.revision = s.revision
        WHERE s.upload_id = $1
        GROUP BY s.id
     ), counts AS (
       SELECT COUNT(*)::int AS total_rows,
              COUNT(*) FILTER (WHERE NOT COALESCE(has_error, false))::int AS valid_rows,
              COALESCE(SUM(error_count), 0)::int AS errors,
              COALESCE(SUM(warning_count), 0)::int AS warnings
         FROM current_rows
     )
     UPDATE uploads
        SET row_count = counts.total_rows,
            valid_row_count = counts.valid_rows,
            error_count = counts.errors,
            warning_count = counts.warnings,
            updated_at = NOW()
       FROM counts
      WHERE uploads.id = $1`,
    [uploadId],
  );
}

export async function updateUploadRow(uploadId: string, rowId: string, patch: StagedRowPatch, actorId: string, expectedRevision?: number): Promise<StagedUploadRow> {
  return withTransaction(async (client) => {
    const row = await currentRow(client, uploadId, rowId, true);
    if (expectedRevision !== undefined && Number(row.revision) !== expectedRevision) {
      throw new AppError('Staged row has changed; reload before editing', 409);
    }
    const input = rowToValidationInput(row, patch);
    const validated = await validateUploadRow(client, input);
    const nextRevision = Number(row.revision) + 1;
    const updateResult = await client.query(
      `UPDATE staged_upload_rows SET
         revision = $3, raw_values = $4::jsonb,
         province_raw = $5, region_raw = $6, code_bps_raw = $7, source_raw = $8,
         region_id = $9, region_level = $10, region_code = $11, region_name = $12,
         province_region_id = $13, period = ($14 || '-01')::date,
         gross_amount = $15, share_amount = $16, net_amount = $17, target_amount = $18,
         status = $19, error_count = $20, warning_count = $21,
         acknowledged_warning_ids = $22::uuid[], updated_at = NOW()
       WHERE upload_id = $1 AND id = $2
       RETURNING ${STAGED_ROW_COLUMNS}`,
      [
        uploadId,
        rowId,
        nextRevision,
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
        validated.findings.some((finding) => finding.severity === 'error') ? 'invalid' : 'valid',
        validated.findings.filter((finding) => finding.severity === 'error').length,
        validated.findings.filter((finding) => finding.severity === 'warning').length,
        patch.acknowledgedWarningIds ?? [],
      ],
    );
    await insertFindings(client, uploadId, rowId, nextRevision, validated, actorId);
    await updateUploadCounters(client, uploadId);
    const updated = updateResult.rows[0] as Record<string, unknown>;
    return rowToStaged(updated, validated.findings.map((finding) => ({
      row: input.rowNumber,
      column: finding.column,
      code: finding.code,
      severity: finding.severity,
      message: finding.message,
      details: finding.details,
    })));
  });
}

function errorDetailsForFindings(rows: StagedUploadRow[]): UploadErrorDetail[] {
  return rows.flatMap((row) => row.findings);
}

export async function confirmUpload(uploadId: string, actorId: string, input: ConfirmUploadInput = {}): Promise<UploadRecord> {
  const result = await withTransaction(async (client) => {
    const uploadResult = await client.query('SELECT * FROM uploads WHERE id = $1 FOR UPDATE', [uploadId]);
    if (uploadResult.rows.length === 0) throw new AppError('Upload not found', 404);
    const upload = uploadResult.rows[0] as Record<string, unknown>;
    if (upload.status === 'persisted') return rowToRecord(upload);
    if (upload.status === 'cancelled') throw new AppError('Upload has been cancelled', 409);
    if (!['awaiting_confirmation', 'parsed'].includes(String(upload.status))) {
      throw new AppError('Upload is not ready for confirmation', 409);
    }

    const rowsResult = await client.query(
      `SELECT ${STAGED_ROW_COLUMNS} FROM staged_upload_rows WHERE upload_id = $1 ORDER BY row_number FOR UPDATE`,
      [uploadId],
    );
    const rows = rowsResult.rows.map((row) => rowToStaged(row));
    const findingResult = await client.query(
      `SELECT f.id::text, f.staged_row_id::text, s.row_number, f.severity, f.code,
              f.column_name, f.message, f.details
         FROM upload_validation_findings f
         JOIN staged_upload_rows s ON s.id = f.staged_row_id AND s.revision = f.revision
        WHERE f.upload_id = $1
        ORDER BY s.row_number, f.created_at`,
      [uploadId],
    );
    const findingsByRow = new Map<string, UploadErrorDetail[]>();
    for (const finding of findingResult.rows) {
      const list = findingsByRow.get(String(finding.staged_row_id)) ?? [];
      list.push({
        id: String(finding.id),
        row: Number(finding.row_number),
        column: String(finding.column_name ?? ''),
        code: String(finding.code),
        severity: finding.severity,
        message: String(finding.message),
        details: parseJson<Record<string, unknown>>(finding.details, {}),
      });
      findingsByRow.set(String(finding.staged_row_id), list);
    }
    const rowsWithFindings = rows.map((row) => ({ ...row, findings: findingsByRow.get(row.id) ?? [] }));
    const errors = errorDetailsForFindings(rowsWithFindings);
    if (errors.some((finding) => finding.severity === 'error')) {
      throw new AppError('Upload contains blocking validation errors', 409, { findings: errors });
    }
    const warnings = errors.filter((finding) => finding.severity === 'warning');
    const acknowledged = new Set([
      ...(input.acknowledgedWarningIds ?? []),
      ...(input.acknowledgedFindingIds ?? []),
    ]);
    for (const row of rowsWithFindings) {
      for (const id of row.acknowledgedWarningIds) acknowledged.add(id);
    }
    const acknowledgeAll = input.acknowledgeWarnings === true || input.overwriteConfirmed === true;
    const unacknowledged = warnings.filter((finding) => !acknowledgeAll && (!finding.id || !acknowledged.has(finding.id)));
    if (unacknowledged.length > 0) {
      throw new AppError('Warnings must be acknowledged before confirmation', 409, { findings: unacknowledged });
    }

    await client.query(`UPDATE uploads SET status = 'committing', updated_at = NOW() WHERE id = $1`, [uploadId]);
    for (const row of rowsWithFindings) {
      if (!row.regionId || !row.period || !row.sourceRaw || row.grossAmount === null) continue;
      const meta = {
        uploadId,
        rowNumber: row.rowNumber,
        rawValues: row.rawValues,
        confirmedBy: actorId,
        validationWarnings: row.findings.filter((finding) => finding.severity === 'warning').map((finding) => finding.code),
      };
      await client.query(
        `INSERT INTO payments(
           id, region_id, period, amount, source, meta,
           gross_amount, share_amount, net_amount, target_amount, upload_id
         ) VALUES(gen_random_uuid(), $1, ($2 || '-01')::date, $3, $4, $5::jsonb, $3, $6, $7, $8, $9)
         ON CONFLICT(region_id, period, source) DO UPDATE SET
           amount = EXCLUDED.amount,
           gross_amount = EXCLUDED.gross_amount,
           share_amount = EXCLUDED.share_amount,
           net_amount = EXCLUDED.net_amount,
           target_amount = EXCLUDED.target_amount,
           upload_id = EXCLUDED.upload_id,
           meta = EXCLUDED.meta,
           updated_at = NOW()`,
        [row.regionId, row.period, row.grossAmount, row.sourceRaw, JSON.stringify(meta), row.shareAmount, row.netAmount, row.targetAmount, uploadId],
      );
      if (row.targetAmount !== null) {
        await client.query(
          `INSERT INTO revenue_targets(region_id, period, target, created_by, updated_by)
           VALUES($1, ($2 || '-01')::date, $3, $4, $4)
           ON CONFLICT(region_id, period) DO UPDATE SET target = EXCLUDED.target, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
          [row.regionId, row.period, row.targetAmount, actorId],
        );
      }
    }
    const updatedResult = await client.query(
      `UPDATE uploads SET status = 'persisted', confirmed_by = $2, confirmed_at = NOW(),
          committed_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [uploadId, actorId],
    );
    return rowToRecord(updatedResult.rows[0]);
  });

  if (result.status === 'persisted') {
    try {
      await getPgPool().query('SELECT refresh_mv_payments_with_cut()');
    } catch (_error) {
      // A later refresh cron can recover a transient MV failure.
    }
    await Promise.all([
      invalidateChoroplethCache(),
      invalidateRegionCache(),
      invalidateFiscalCache(),
      invalidateDefisitwatchCache(),
      invalidateRankfinCache(),
    ]);
    uploadsTotal.inc({ status: 'persisted' });
  }
  return result;
}

export async function cancelUpload(uploadId: string, actorId: string): Promise<UploadRecord> {
  return withTransaction(async (client) => {
    const result = await client.query('SELECT * FROM uploads WHERE id = $1 FOR UPDATE', [uploadId]);
    if (result.rows.length === 0) throw new AppError('Upload not found', 404);
    if (result.rows[0].status === 'persisted') throw new AppError('Persisted upload cannot be cancelled', 409);
    if (result.rows[0].status === 'cancelled') return rowToRecord(result.rows[0]);
    const updated = await client.query(
      `UPDATE uploads SET status = 'cancelled', cancelled_by = $2, cancelled_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [uploadId, actorId],
    );
    return rowToRecord(updated.rows[0]);
  });
}

function aliasRow(row: Record<string, unknown>): RegionAlias {
  return {
    id: String(row.id),
    aliasId: String(row.id),
    alias: String(row.alias),
    normalizedAlias: String(row.normalized_alias),
    regionId: String(row.region_id),
    level: Number(row.level),
    parentId: (row.parent_id as string | null) ?? null,
    active: Boolean(row.active),
    createdBy: String(row.created_by),
    updatedBy: String(row.updated_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    region: row.region_code ? { code: String(row.region_code), name: String(row.region_name) } : undefined,
    regionName: row.region_name ? String(row.region_name) : undefined,
  };
}

export async function listRegionAliases(params: { regionId?: string; provinceId?: string; query?: string; active?: boolean } = {}): Promise<RegionAlias[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (params.regionId) {
    values.push(params.regionId);
    conditions.push(`a.region_id = $${values.length}`);
  }
  if (params.active !== undefined) {
    values.push(params.active);
    conditions.push(`a.active = $${values.length}`);
  }
  if (params.provinceId) {
    values.push(params.provinceId);
    conditions.push(`(r.id::text = $${values.length} OR r.parent_id::text = $${values.length})`);
  }
  if (params.query) {
    values.push(`%${normalizeAlias(params.query)}%`);
    conditions.push(`a.normalized_alias LIKE $${values.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await getPgPool().query(
    `SELECT a.*, r.code_bps AS region_code, r.name AS region_name
       FROM region_aliases a JOIN regions r ON r.id = a.region_id
      ${where} ORDER BY a.normalized_alias`,
    values,
  );
  return result.rows.map(aliasRow);
}

async function regionAliasContext(regionIdOrCode: string): Promise<{ regionId: string; level: number; parentId: string | null }> {
  const result = await getPgPool().query(
    'SELECT id::text, level, parent_id::text FROM regions WHERE id::text = $1 OR code_bps = $1 LIMIT 1',
    [regionIdOrCode],
  );
  if (result.rows.length === 0) throw new AppError('Region not found', 404);
  return {
    regionId: String(result.rows[0].id),
    level: Number(result.rows[0].level),
    parentId: result.rows[0].parent_id ?? null,
  };
}

export async function createRegionAlias(input: RegionAliasInput, actorId: string): Promise<RegionAlias> {
  const alias = input.alias.trim();
  if (!alias || alias.length > 200) throw new AppError('Alias must contain 1-200 characters', 400);
  const normalized = normalizeAlias(alias);
  if (!normalized) throw new AppError('Alias must contain letters or numbers', 400);
  const context = await regionAliasContext(input.regionId);
  try {
    const result = await getPgPool().query(
      `INSERT INTO region_aliases(alias, normalized_alias, region_id, level, parent_id, created_by, updated_by)
       VALUES($1, $2, $3, $4, $5, $6, $6)
       RETURNING *`,
      [alias, normalized, context.regionId, context.level, context.parentId, actorId],
    );
    return aliasRow(result.rows[0]);
  } catch (error) {
    if (String(error).includes('region_aliases_scope_idx')) throw new AppError('Alias already exists in this scope', 409);
    throw error;
  }
}

export async function updateRegionAlias(aliasId: string, input: Partial<RegionAliasInput> & { active?: boolean }, actorId: string): Promise<RegionAlias> {
  const existing = await getPgPool().query('SELECT * FROM region_aliases WHERE id = $1', [aliasId]);
  if (existing.rows.length === 0) throw new AppError('Region alias not found', 404);
  const regionContext = await regionAliasContext(input.regionId ?? String(existing.rows[0].region_id));
  const regionId = regionContext.regionId;
  const alias = input.alias === undefined ? String(existing.rows[0].alias) : input.alias.trim();
  const normalized = normalizeAlias(alias);
  const result = await getPgPool().query(
    `UPDATE region_aliases SET alias = $2, normalized_alias = $3, region_id = $4,
        level = $5, parent_id = $6, active = COALESCE($7, active), updated_by = $8, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [aliasId, alias, normalized, regionId, regionContext.level, regionContext.parentId, input.active ?? null, actorId],
  );
  return aliasRow(result.rows[0]);
}

export async function deactivateRegionAlias(aliasId: string, actorId: string): Promise<RegionAlias> {
  return updateRegionAlias(aliasId, { active: false }, actorId);
}

export const uploadService = {
  enqueueUpload,
  listUploads,
  getUpload,
  getUploadRows,
  updateUploadRow,
  confirmUpload,
  cancelUpload,
  listRegionAliases,
  createRegionAlias,
  updateRegionAlias,
  deactivateRegionAlias,
};

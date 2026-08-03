import { createHash } from 'node:crypto';

import { getPgPool } from '../db/postgres';
import { uploadQueue } from '../jobs/upload-worker';
import { AppError } from '../utils/app-error';

import { uploadFile } from './storage-service';

import type {
  UploadRecord,
  UploadRequest,
  UploadResult,
} from '../types/upload';

const ACCEPTED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

function validateUpload(request: UploadRequest) {
  if (!ACCEPTED_MIME_TYPES.has(request.mimetype)) {
    throw new AppError('Format file tidak didukung. Gunakan file Excel (.xlsx)', 400);
  }
  if (request.size > MAX_UPLOAD_SIZE) {
    throw new AppError('Ukuran file melebihi 10 MB', 400);
  }
}

function rowToRecord(row: Record<string, unknown>): UploadRecord {
  return {
    uploadId: row.id as string,
    filename: row.filename as string,
    mimetype: row.mimetype as string,
    size: row.size_bytes as number,
    status: row.status as UploadRecord['status'],
    hash: row.hash as string,
    storagePath: (row.storage_path as string) ?? undefined,
    fileUrl: (row.file_url as string) ?? undefined,
    errorCount: row.error_count as number,
    errors: (row.errors as UploadRecord['errors']) ?? [],
    summary: (row.summary as UploadRecord['summary']) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function enqueueUpload(request: UploadRequest): Promise<UploadResult> {
  validateUpload(request);

  const pool = getPgPool();
  const hash = createHash('sha256').update(request.buffer).digest('hex');

  // Deduplication: check if same file was already uploaded
  const existing = await pool.query(
    'SELECT id::text, status FROM uploads WHERE hash = $1',
    [hash]
  );
  if (existing.rows.length > 0) {
    return {
      uploadId: existing.rows[0].id,
      status: existing.rows[0].status,
      hash,
    };
  }

  // Upload file to MinIO
  const storageKey = `${Date.now()}-${request.filename}`;
  const fileUrl = await uploadFile(storageKey, request.buffer, request.mimetype);

  // Insert upload record into DB
  const { rows } = await pool.query(
    `INSERT INTO uploads(filename, mimetype, size_bytes, hash, status, storage_path, file_url)
     VALUES($1, $2, $3, $4, 'queued', $5, $6)
     RETURNING id::text, status`,
    [request.filename, request.mimetype, request.size, hash, storageKey, fileUrl]
  );
  const uploadId = rows[0].id;

  // Enqueue processing job
  await uploadQueue.add('process-upload', {
    uploadId,
    buffer: request.buffer.toString('base64'),
    filename: request.filename,
  }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  });

  return { uploadId, status: 'queued', hash };
}

export async function listUploads(): Promise<UploadRecord[]> {
  const pool = getPgPool();
  const { rows } = await pool.query(
    'SELECT * FROM uploads ORDER BY created_at DESC LIMIT 100'
  );
  return rows.map(rowToRecord);
}

export async function getUpload(uploadId: string): Promise<UploadRecord | undefined> {
  const pool = getPgPool();
  const { rows } = await pool.query(
    'SELECT * FROM uploads WHERE id = $1',
    [uploadId]
  );
  return rows.length ? rowToRecord(rows[0]) : undefined;
}

export const uploadService = { enqueueUpload, listUploads, getUpload };

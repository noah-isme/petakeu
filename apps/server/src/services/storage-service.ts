import { uploadToS3, ensureBucket, getPresignedDownloadUrl } from '../db/minio';

const UPLOADS_BUCKET = process.env.STORAGE_BUCKET ?? 'uploads';
const REPORTS_BUCKET = process.env.STORAGE_REPORTS_BUCKET ?? 'reports';

export async function initStorage(): Promise<void> {
  await ensureBucket(UPLOADS_BUCKET);
  await ensureBucket(REPORTS_BUCKET);
  console.log('[storage] Buckets initialized');
}

export async function uploadFile(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  return uploadToS3(UPLOADS_BUCKET, key, buffer, contentType);
}

export async function uploadReport(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  return uploadToS3(REPORTS_BUCKET, key, buffer, contentType);
}

export async function getUploadDownloadUrl(key: string): Promise<string> {
  return getPresignedDownloadUrl(UPLOADS_BUCKET, key);
}

export async function getReportDownloadUrl(key: string): Promise<string> {
  return getPresignedDownloadUrl(REPORTS_BUCKET, key, 60 * 60 * 24); // 24h
}

export const storageService = {
  initStorage,
  uploadFile,
  uploadReport,
  getUploadDownloadUrl,
  getReportDownloadUrl,
};

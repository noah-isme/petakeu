import { uploadToS3, ensureBucket, getPresignedDownloadUrl, getS3Client } from '../db/minio';
import { ListBucketsCommand } from '@aws-sdk/client-s3';
import { logger } from '../utils/logger';

const UPLOADS_BUCKET = process.env.STORAGE_BUCKET ?? 'uploads';
const REPORTS_BUCKET = process.env.STORAGE_REPORTS_BUCKET ?? 'reports';

export async function initStorage(): Promise<void> {
  await ensureBucket(UPLOADS_BUCKET);
  await ensureBucket(REPORTS_BUCKET);
  logger.info('[storage] Buckets initialized');
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

export async function checkStorageHealth(): Promise<boolean> {
  try {
    const client = getS3Client();
    await client.send(new ListBucketsCommand({}));
    return true;
  } catch (error) {
    logger.error({ err: error }, '[storage] Health check failed');
    return false;
  }
}

export const storageService = {
  initStorage,
  uploadFile,
  uploadReport,
  getUploadDownloadUrl,
  getReportDownloadUrl,
  checkStorageHealth,
};
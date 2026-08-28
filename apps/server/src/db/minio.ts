import { Readable } from 'stream';

import {
  S3Client,
  PutObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  GetObjectCommand
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let s3Client: S3Client | undefined;

export function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      endpoint: process.env.STORAGE_ENDPOINT ?? 'http://localhost:9000',
      region: process.env.STORAGE_REGION ?? 'us-east-1',
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY ?? 'admin',
        secretAccessKey: process.env.STORAGE_SECRET_KEY ?? 'password123',
      },
      forcePathStyle: true, // Required for MinIO
    });
  }
  return s3Client;
}

export async function ensureBucket(bucket: string): Promise<void> {
  const client = getS3Client();
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`[minio] Created bucket: ${bucket}`);
  }
}

export async function uploadToS3(
  bucket: string,
  key: string,
  body: Buffer | Readable,
  contentType: string
): Promise<string> {
  if (Buffer.isBuffer(body)) {
    const client = getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
    const endpoint = process.env.STORAGE_ENDPOINT ?? 'http://localhost:9000';
    return `${endpoint}/${bucket}/${key}`;
  }

  return uploadStreamToS3(bucket, key, body, contentType);
}

export async function uploadStreamToS3(
  bucket: string,
  key: string,
  stream: Readable,
  contentType: string
): Promise<string> {
  const client = getS3Client();
  const parallelUpload = new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: key,
      Body: stream,
      ContentType: contentType,
    },
  });
  await parallelUpload.done();
  const endpoint = process.env.STORAGE_ENDPOINT ?? 'http://localhost:9000';
  return `${endpoint}/${bucket}/${key}`;
}

export async function getPresignedDownloadUrl(
  bucket: string,
  key: string,
  expiresInSeconds = 3600
): Promise<string> {
  const client = getS3Client();
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

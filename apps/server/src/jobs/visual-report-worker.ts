import { PassThrough } from 'stream';

import { Queue, Worker, Job } from 'bullmq';
import puppeteer from 'puppeteer';

import { getPgPool } from '../db/postgres';
import { uploadReportStream, getReportDownloadUrl } from '../services/storage-service';
import { logger } from '../utils/logger';

const QUEUE_NAME = 'visual-report-generation';

let _queue: Queue | undefined;
export function getVisualReportQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, {
      connection: {
        url: process.env.REDIS_URL ?? 'redis://localhost:6379',
      },
    });
  }
  return _queue;
}

export const visualReportQueue = {
  add: (...args: Parameters<Queue['add']>) => getVisualReportQueue().add(...args),
};

async function generateVisualReport(job: Job) {
  const { jobId, urlToRender } = job.data;
  const pool = getPgPool();
  
  logger.info({ jobId, urlToRender }, '[visual-report-worker] Starting visual report generation');

  await pool.query('UPDATE report_jobs SET status = $1, updated_at = NOW() WHERE id = $2', [
    'processing',
    jobId,
  ]);

  try {
    // Launch headless Chrome
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, // Set in Dockerfile
    });

    const page = await browser.newPage();
    
    // In a real scenario, this would be an internal network URL to the frontend with an auth token
    const targetUrl = urlToRender || 'http://localhost:5173/';
    await page.goto(targetUrl, { waitUntil: 'networkidle0' });

    // Generate PDF buffer
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
    });

    await browser.close();

    // Upload to object storage (MinIO)
    const objectKey = `visual-reports/${jobId}.pdf`;
    
    // We convert the buffer into a readable stream for the upload service
    const pass = new PassThrough();
    pass.end(pdfBuffer);

    await uploadReportStream(objectKey, pass, 'application/pdf');
    const downloadUrl = await getReportDownloadUrl(objectKey);

    // Update job status
    await pool.query(
      'UPDATE report_jobs SET status = $1, download_url = $2, updated_at = NOW() WHERE id = $3',
      ['completed', downloadUrl, jobId]
    );

    logger.info({ jobId }, '[visual-report-worker] Visual report completed successfully');
  } catch (err: unknown) {
    logger.error({ err, jobId }, '[visual-report-worker] Failed to generate visual report');
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      'UPDATE report_jobs SET status = $1, error = $2, updated_at = NOW() WHERE id = $3',
      ['failed', message, jobId]
    );
    throw err;
  }
}

let _worker: Worker | undefined;
export function startVisualReportWorker(): Worker {
  if (!_worker) {
    _worker = new Worker(QUEUE_NAME, generateVisualReport, {
      connection: {
        url: process.env.REDIS_URL ?? 'redis://localhost:6379',
      },
      concurrency: 2,
    });

    _worker.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, err }, '[visual-report-worker] Job failed');
    });
  }
  return _worker;
}

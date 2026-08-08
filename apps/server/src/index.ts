import 'dotenv/config';
import { createApp } from './server';
import { shutdownPg } from './db/postgres';
import { shutdownRedis } from './db/redis';
import { runMigrations } from './db/migrate';
import { initStorage } from './services/storage-service';
import { startUploadWorker } from './jobs/upload-worker';
import { startReportWorker } from './jobs/report-worker';
import { startMvRefreshCron } from './jobs/mv-refresh-cron';
import { loadEnv } from './config/env';
import { startTracing, shutdownTracing } from './utils/tracing';
import { logger } from './utils/logger';

const env = loadEnv();

async function main() {
  // Start OpenTelemetry tracing
  if (env.nodeEnv !== 'test') {
    startTracing();
  }

  logger.info('[petakeu] Starting server...');

  // 1. Run DB migrations
  try {
    await runMigrations();
    logger.info('[petakeu] Migrations completed');
  } catch (err) {
    logger.error({ err }, '[petakeu] Migration failed, exiting');
    process.exit(1);
  }

  // 2. Init object storage (create buckets if needed)
  try {
    await initStorage();
    logger.info('[petakeu] Storage initialized');
  } catch (err) {
    logger.warn({ err }, '[petakeu] Storage init failed (non-fatal)');
  }

  // 3. Start background workers
  const uploadWorker = startUploadWorker();
  const reportWorker = startReportWorker();
  logger.info('[petakeu] Background workers started');

  // 4. Start materialized view refresh cron
  startMvRefreshCron();
  logger.info('[petakeu] MV refresh cron started');

  // 5. Start HTTP server
  const app = await createApp();
  const server = app.listen(env.port, () => {
    logger.info(`[petakeu] Server running on port ${env.port}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`[petakeu] Received ${signal}, shutting down gracefully...`);
    server.close(async () => {
      await uploadWorker.close();
      await reportWorker.close();
      await shutdownPg();
      await shutdownRedis();
      await shutdownTracing();
      logger.info('[petakeu] Shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, '[petakeu] Fatal error');
  process.exit(1);
});
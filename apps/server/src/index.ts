import 'dotenv/config';
import { createApp } from './server';
import { getPgPool, shutdownPg } from './db/postgres';
import { getRedisClient, shutdownRedis } from './db/redis';
import { runMigrations } from './db/migrate';
import { initStorage } from './services/storage-service';
import { startUploadWorker } from './jobs/upload-worker';
import { startReportWorker } from './jobs/report-worker';
import { startMvRefreshCron } from './jobs/mv-refresh-cron';
import { loadEnv } from './config/env';

const env = loadEnv();

async function main() {
  console.log('[petakeu] Starting server...');

  // 1. Run DB migrations
  try {
    await runMigrations();
  } catch (err) {
    console.error('[petakeu] Migration failed, exiting:', err);
    process.exit(1);
  }

  // 2. Init object storage (create buckets if needed)
  try {
    await initStorage();
  } catch (err) {
    console.warn('[petakeu] Storage init failed (non-fatal):', err);
  }

  // 3. Start background workers
  const uploadWorker = startUploadWorker();
  const reportWorker = startReportWorker();

  // 4. Start materialized view refresh cron
  startMvRefreshCron();

  // 5. Start HTTP server
  const app = await createApp();
  const server = app.listen(env.port, () => {
    console.log(`[petakeu] Server running on port ${env.port}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[petakeu] Received ${signal}, shutting down gracefully...`);
    server.close(async () => {
      await uploadWorker.close();
      await reportWorker.close();
      await shutdownPg();
      await shutdownRedis();
      console.log('[petakeu] Shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[petakeu] Fatal error:', err);
  process.exit(1);
});

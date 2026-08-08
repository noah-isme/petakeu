import { schedule } from 'node-cron';

import { getPgPool } from '../db/postgres';
import { invalidateChoroplethCache } from '../services/geo-service';
import { logger } from '../utils/logger';
import { dbQueryDuration } from '../utils/metrics';

export function startMvRefreshCron(): void {
  // Refresh materialized view every 15 minutes
  schedule('*/15 * * * *', async () => {
    const pool = getPgPool();
    const startTime = Date.now();
    try {
      await pool.query('SELECT refresh_mv_payments_with_cut()');
      dbQueryDuration.observe({ query_type: 'refresh', table: 'mv_payments_with_cut' }, (Date.now() - startTime) / 1000);
      
      // Invalidate choropleth cache after MV refresh
      await invalidateChoroplethCache();
      
      logger.info({ durationMs: Date.now() - startTime }, '[cron] Materialized view refreshed and cache invalidated');
    } catch (err) {
      logger.error({ err, durationMs: Date.now() - startTime }, '[cron] Failed to refresh materialized view');
    }
  });
  logger.info('[cron] Materialized view refresh scheduled (every 15 min)');
}
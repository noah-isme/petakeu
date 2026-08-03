import cron from 'node-cron';
import { getPgPool } from '../db/postgres';

export function startMvRefreshCron(): void {
  // Refresh materialized view every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    const pool = getPgPool();
    try {
      await pool.query('SELECT refresh_mv_payments_with_cut()');
      console.log('[cron] Materialized view refreshed');
    } catch (err) {
      console.error('[cron] Failed to refresh materialized view:', err);
    }
  });
  console.log('[cron] Materialized view refresh scheduled (every 15 min)');
}

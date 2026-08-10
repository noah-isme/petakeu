import { describe, expect, it, vi, beforeEach } from 'vitest';
import { utils, write } from 'xlsx';
import type { Job } from 'bullmq';

import { processUpload } from '../../../apps/server/src/jobs/upload-worker';
import { startMvRefreshCron } from '../../../apps/server/src/jobs/mv-refresh-cron';
import { invalidateChoroplethCache } from '../../../apps/server/src/services/geo-service';
import { invalidateRegionCache } from '../../../apps/server/src/services/region-service';
import { invalidateCacheByPrefix, invalidateCache, getCached } from '../../../apps/server/src/db/redis';
import { getPgPool } from '../../../apps/server/src/db/postgres';
import { schedule } from 'node-cron';

vi.mock('../../../apps/server/src/db/postgres', () => {
  const mockPool = {
    query: vi.fn(),
  };
  return {
    getPgPool: () => mockPool,
  };
});

vi.mock('../../../apps/server/src/services/geo-service', () => ({
  invalidateChoroplethCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../apps/server/src/services/region-service', () => ({
  invalidateRegionCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../apps/server/src/services/fiscal-service', () => ({
  invalidateFiscalCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../apps/server/src/services/defisitwatch-service', () => ({
  invalidateDefisitwatchCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../apps/server/src/services/rankfin-service', () => ({
  invalidateRankfinCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../apps/server/src/utils/metrics', () => ({
  workerJobsTotal: { inc: vi.fn() },
  workerJobDuration: { observe: vi.fn() },
  uploadsTotal: { inc: vi.fn() },
  dbQueryDuration: { observe: vi.fn() },
}));

vi.mock('node-cron', () => ({
  schedule: vi.fn(),
}));

function createExcelBufferB64(rows: string[][]): string {
  const headers = ['kode_bps', 'nama_wilayah', 'periode', 'nominal', 'sumber'];
  const ws = utils.aoa_to_sheet([headers, ...rows]);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Data');
  const buf = write(wb, { type: 'buffer', bookType: 'xlsx' });
  return buf.toString('base64');
}

describe('Challenger Empirical Tests: Cache Invalidation Hooks & Prefix Matching', () => {
  let mockPgPool: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPgPool = getPgPool();
  });

  describe('1. Payment Upload Processing Cache Invalidation Hooks', () => {
    it('invokes invalidateChoroplethCache and invalidateRegionCache when payments are validly saved', async () => {
      const bufferB64 = createExcelBufferB64([
        ['3171', 'Jakarta Selatan', '2025-01', '1000000', 'PAD'],
      ]);

      const mockJob = {
        data: {
          uploadId: 'upload-uuid-1',
          buffer: bufferB64,
        },
      } as unknown as Job;

      mockPgPool.query.mockImplementation((sql: string, params?: any[]) => {
        if (sql.includes('SELECT id::text FROM regions')) {
          return Promise.resolve({ rows: [{ id: 'region-uuid-3171' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      await processUpload(mockJob);

      expect(invalidateChoroplethCache).toHaveBeenCalledTimes(1);
      expect(invalidateRegionCache).toHaveBeenCalledTimes(1);
    });

    it('does NOT invoke cache invalidations when no valid rows exist in upload', async () => {
      const bufferB64 = createExcelBufferB64([]);

      const mockJob = {
        data: {
          uploadId: 'upload-uuid-empty',
          buffer: bufferB64,
        },
      } as unknown as Job;

      mockPgPool.query.mockResolvedValue({ rows: [] });

      await processUpload(mockJob);

      expect(invalidateChoroplethCache).not.toHaveBeenCalled();
      expect(invalidateRegionCache).not.toHaveBeenCalled();
    });

    it('does NOT invoke cache invalidations when all rows fail validation', async () => {
      const bufferB64 = createExcelBufferB64([
        ['3171', 'Jakarta Selatan', 'invalid-period', '1000000', 'PAD'],
      ]);

      const mockJob = {
        data: {
          uploadId: 'upload-uuid-invalid',
          buffer: bufferB64,
        },
      } as unknown as Job;

      mockPgPool.query.mockResolvedValue({ rows: [] });

      await processUpload(mockJob);

      expect(invalidateChoroplethCache).not.toHaveBeenCalled();
      expect(invalidateRegionCache).not.toHaveBeenCalled();
    });

    it('does NOT invoke cache invalidations if payment upsert database query throws an error', async () => {
      const bufferB64 = createExcelBufferB64([
        ['3171', 'Jakarta Selatan', '2025-01', '1000000', 'PAD'],
      ]);

      const mockJob = {
        data: {
          uploadId: 'upload-uuid-error',
          buffer: bufferB64,
        },
      } as unknown as Job;

      mockPgPool.query.mockImplementation((sql: string) => {
        if (sql.includes('SELECT id::text FROM regions')) {
          return Promise.resolve({ rows: [{ id: 'region-uuid-3171' }] });
        }
        if (sql.includes('INSERT INTO payments')) {
          return Promise.reject(new Error('DB Connection Failed'));
        }
        return Promise.resolve({ rows: [] });
      });

      await expect(processUpload(mockJob)).rejects.toThrow('DB Connection Failed');

      expect(invalidateChoroplethCache).not.toHaveBeenCalled();
      expect(invalidateRegionCache).not.toHaveBeenCalled();
    });
  });

  describe('2. Materialized View Refresh Cron Cache Invalidation Hooks', () => {
    it('schedules cron job and invokes cache invalidation on successful MV refresh', async () => {
      startMvRefreshCron();

      expect(schedule).toHaveBeenCalledWith('*/15 * * * *', expect.any(Function));

      const cronHandler = vi.mocked(schedule).mock.calls[0][1] as () => Promise<void>;

      mockPgPool.query.mockResolvedValueOnce({ rows: [] });

      await cronHandler();

      expect(mockPgPool.query).toHaveBeenCalledWith('SELECT refresh_mv_payments_with_cut()');
      expect(invalidateChoroplethCache).toHaveBeenCalledTimes(1);
      expect(invalidateRegionCache).toHaveBeenCalledTimes(1);
    });

    it('does NOT invoke cache invalidations when MV refresh SQL query fails', async () => {
      startMvRefreshCron();

      const cronHandler = vi.mocked(schedule).mock.calls[0][1] as () => Promise<void>;

      mockPgPool.query.mockRejectedValueOnce(new Error('MV refresh timeout'));

      await cronHandler();

      expect(invalidateChoroplethCache).not.toHaveBeenCalled();
      expect(invalidateRegionCache).not.toHaveBeenCalled();
    });
  });
});

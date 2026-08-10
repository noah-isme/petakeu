import { describe, expect, it, vi, beforeEach } from 'vitest';
import { utils, write } from 'xlsx';
import type { Job } from 'bullmq';

import { isFuturePeriod, processUpload } from './upload-worker';
import { getPgPool } from '../db/postgres';

vi.mock('../db/postgres', () => {
  const mockPool = {
    query: vi.fn(),
  };
  return {
    getPgPool: () => mockPool,
  };
});

vi.mock('../services/geo-service', () => ({
  invalidateChoroplethCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/region-service', () => ({
  invalidateRegionCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/fiscal-service', () => ({
  invalidateFiscalCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/defisitwatch-service', () => ({
  invalidateDefisitwatchCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/rankfin-service', () => ({
  invalidateRankfinCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/metrics', () => ({
  workerJobsTotal: { inc: vi.fn() },
  workerJobDuration: { observe: vi.fn() },
  uploadsTotal: { inc: vi.fn() },
}));

function createExcelBufferB64(rows: string[][]): string {
  const headers = ['kode_bps', 'nama_wilayah', 'periode', 'nominal', 'sumber'];
  const ws = utils.aoa_to_sheet([headers, ...rows]);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Data');
  const buf = write(wb, { type: 'buffer', bookType: 'xlsx' });
  return buf.toString('base64');
}

describe('upload-worker', () => {
  describe('isFuturePeriod', () => {
    const refDate = new Date(2026, 7, 11);

    it('returns false for past periods in a previous year', () => {
      expect(isFuturePeriod('2025-12', refDate)).toBe(false);
      expect(isFuturePeriod('2024-01', refDate)).toBe(false);
    });

    it('returns false for past periods in the same year', () => {
      expect(isFuturePeriod('2026-01', refDate)).toBe(false);
      expect(isFuturePeriod('2026-07', refDate)).toBe(false);
    });

    it('returns false for current period', () => {
      expect(isFuturePeriod('2026-08', refDate)).toBe(false);
    });

    it('returns true for future periods in the same year', () => {
      expect(isFuturePeriod('2026-09', refDate)).toBe(true);
      expect(isFuturePeriod('2026-12', refDate)).toBe(true);
    });

    it('returns true for future periods in a future year', () => {
      expect(isFuturePeriod('2027-01', refDate)).toBe(true);
      expect(isFuturePeriod('2030-05', refDate)).toBe(true);
    });

    it('handles year boundary transition from Dec 31 to Jan 1 correctly', () => {
      const dec31 = new Date(2026, 11, 31, 23, 59, 59);
      expect(isFuturePeriod('2027-01', dec31)).toBe(true);
      expect(isFuturePeriod('2026-12', dec31)).toBe(false);

      const jan1 = new Date(2027, 0, 1, 0, 0, 0);
      expect(isFuturePeriod('2026-12', jan1)).toBe(false);
      expect(isFuturePeriod('2027-01', jan1)).toBe(false);
      expect(isFuturePeriod('2027-02', jan1)).toBe(true);
    });

    it('returns false for invalid period strings', () => {
      expect(isFuturePeriod('invalid')).toBe(false);
      expect(isFuturePeriod('2026-13')).toBe(false);
      expect(isFuturePeriod('2026-00')).toBe(false);
      expect(isFuturePeriod('')).toBe(false);
      expect(isFuturePeriod('2026-8')).toBe(false);
      expect(isFuturePeriod('2026-08-01')).toBe(false);
    });
  });

  describe('processUpload warning tagging', () => {
    let mockPgPool: any;

    beforeEach(() => {
      vi.clearAllMocks();
      mockPgPool = getPgPool();
    });

    it('tags future period payment rows with meta: { forecast: false } and valid past/current with meta: {} during bulk UPSERT', async () => {
      const bufferB64 = createExcelBufferB64([
        ['3171', 'Jakarta Selatan', '2099-01', '1000000', 'PAD'],
        ['3172', 'Jakarta Timur', '2020-05', '500000', 'DAU'],
      ]);

      const mockJob = {
        data: {
          uploadId: 'upload-uuid-123',
          buffer: bufferB64,
        },
      } as unknown as Job;

      mockPgPool.query.mockImplementation((sql: string, params?: any[]) => {
        if (sql.includes('SELECT id::text FROM regions')) {
          const code = params?.[0];
          return Promise.resolve({
            rows: [{ id: `region-uuid-${code}` }],
          });
        }
        if (sql.includes('INSERT INTO payments')) {
          return Promise.resolve({ rowCount: 1 });
        }
        if (sql.includes('UPDATE uploads')) {
          return Promise.resolve({ rowCount: 1 });
        }
        if (sql.includes('refresh_mv_payments_with_cut')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      await processUpload(mockJob);

      // Verify INSERT INTO payments queries
      const insertCalls = mockPgPool.query.mock.calls.filter((call: any[]) =>
        call[0].includes('INSERT INTO payments')
      );
      expect(insertCalls).toHaveLength(2);

      // First row (future period 2099-01)
      const firstCallParams = insertCalls[0][1];
      expect(firstCallParams[0]).toBe('region-uuid-3171');
      expect(firstCallParams[1]).toBe('2099-01');
      expect(firstCallParams[2]).toBe(1000000);
      expect(firstCallParams[3]).toBe('PAD');
      expect(JSON.parse(firstCallParams[4])).toEqual({ forecast: false });

      // Second row (past period 2020-05)
      const secondCallParams = insertCalls[1][1];
      expect(secondCallParams[0]).toBe('region-uuid-3172');
      expect(secondCallParams[1]).toBe('2020-05');
      expect(secondCallParams[2]).toBe(500000);
      expect(secondCallParams[3]).toBe('DAU');
      expect(JSON.parse(secondCallParams[4])).toEqual({});

      // Verify SQL contains meta column and EXCLUDED.meta
      const insertSql = insertCalls[0][0];
      expect(insertSql).toContain('meta');
      expect(insertSql).toContain('$5::jsonb');
      expect(insertSql).toContain('meta = EXCLUDED.meta');
    });
  });
});

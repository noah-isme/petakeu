import { describe, expect, it, vi, beforeEach } from 'vitest';

import { getCached, invalidateCacheByPrefix } from '../db/redis';

import { getRegionSummary, invalidateRegionCache } from './region-service';

vi.mock('../db/postgres', () => {
  const mockRegionRow = {
    id: '3171',
    code: '3171',
    name: 'Jakarta Selatan',
    level: 2,
    parentId: '3100',
  };
  const mockTrendRows = [
    { period: '2025-01', amount: '1000000', cut15Amount: '150000', netAmount: '850000' },
  ];
  return {
    getPgPool: () => ({
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('FROM regions WHERE id =')) {
          return Promise.resolve({ rows: [mockRegionRow] });
        }
        if (sql.includes('FROM mv_payments_with_cut')) {
          return Promise.resolve({ rows: mockTrendRows });
        }
        return Promise.resolve({ rows: [] });
      }),
    }),
  };
});

vi.mock('../db/redis', () => ({
  getCached: vi.fn().mockImplementation((key, fetchFn) => fetchFn()),
  invalidateCacheByPrefix: vi.fn().mockResolvedValue(undefined),
}));

describe('region-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds summary and uses getCached with keyPrefix petakeu:regions', async () => {
    const summary = await getRegionSummary('3171', { from: '2025-01', to: '2025-08' });
    expect(summary.region.id).toBe('3171');
    expect(summary.totalAmount).toBe(1000000);
    expect(getCached).toHaveBeenCalledWith(
      'summary:3171:from:2025-01:to:2025-08',
      expect.any(Function),
      expect.objectContaining({
        keyPrefix: 'petakeu:regions',
      })
    );
  });

  it('invalidates region cache by prefixing regions', async () => {
    await invalidateRegionCache();
    expect(invalidateCacheByPrefix).toHaveBeenCalledWith('regions');
  });
});

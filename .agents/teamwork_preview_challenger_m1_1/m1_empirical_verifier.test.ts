import { describe, expect, it, vi, beforeEach } from 'vitest';

// Real functions under test
import { loadEnv } from '../../apps/server/src/config/env';
import { getCached, invalidateCacheByPrefix, invalidateCache } from '../../apps/server/src/db/redis';
import { cacheHits, cacheMisses } from '../../apps/server/src/utils/metrics';

// Mocks for database and logger
const mockQuery = vi.fn();
vi.mock('../../apps/server/src/db/postgres', () => ({
  getPgPool: () => ({ query: mockQuery }),
}));

vi.mock('../../apps/server/src/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockRedisGet = vi.fn();
const mockRedisSetEx = vi.fn();
const mockRedisKeys = vi.fn();
const mockRedisDel = vi.fn();
const mockRedisConnect = vi.fn().mockResolvedValue(undefined);
const mockRedisOn = vi.fn();

vi.mock('redis', () => ({
  createClient: () => ({
    get: mockRedisGet,
    setEx: mockRedisSetEx,
    keys: mockRedisKeys,
    del: mockRedisDel,
    connect: mockRedisConnect,
    on: mockRedisOn,
  }),
}));

vi.mock('../../apps/server/src/utils/metrics', () => ({
  cacheHits: { inc: vi.fn() },
  cacheMisses: { inc: vi.fn() },
  dbQueryDuration: { observe: vi.fn() },
}));

// Import services after mocks are set up
import { buildChoropleth, invalidateChoroplethCache } from '../../apps/server/src/services/geo-service';
import { getRegionSummary, invalidateRegionCache } from '../../apps/server/src/services/region-service';

describe('Empirical Verification: Redis Caching & Invalidation (M1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({
      rows: [
        {
          regionId: '3171',
          id: '3171',
          code: '3171',
          code_bps: '3171',
          name: 'Jakarta Selatan',
          level: 2,
          parentId: '3100',
          parent_id: '3100',
          geometry: { type: 'Polygon', coordinates: [] },
          centroid_geom: { type: 'Point', coordinates: [106.8, -6.2] },
          amount: '5000000',
          cut_amount: '750000',
          net_amount: '4250000',
          class_index: 0,
          period: '2025-01',
          cut15Amount: '750000',
          netAmount: '4250000',
        },
      ],
    });
  });

  describe('1. Choropleth Cache Key Generation Edge Cases', () => {
    it('generates correct Redis key for default options (period only)', async () => {
      mockRedisGet.mockResolvedValueOnce(null);
      await buildChoropleth('2025-08');

      // Key passed to Redis get should be petakeu:geo:choropleth:2025-08
      expect(mockRedisGet).toHaveBeenCalledWith('petakeu:geo:choropleth:2025-08');
    });

    it('generates correct Redis key when level is specified', async () => {
      mockRedisGet.mockResolvedValueOnce(null);
      await buildChoropleth('2025-08', { level: 2 });

      expect(mockRedisGet).toHaveBeenCalledWith('petakeu:geo:choropleth:2025-08:2');
    });

    it('generates correct Redis key when parent is specified', async () => {
      mockRedisGet.mockResolvedValueOnce(null);
      await buildChoropleth('2025-08', { parent: '3100' });

      expect(mockRedisGet).toHaveBeenCalledWith('petakeu:geo:choropleth:2025-08:3100');
    });

    it('generates correct Redis key when level and parent are both specified', async () => {
      mockRedisGet.mockResolvedValueOnce(null);
      await buildChoropleth('2025-08', { level: 2, parent: '3100' });

      expect(mockRedisGet).toHaveBeenCalledWith('petakeu:geo:choropleth:2025-08:2:3100');
    });

    it('generates correct Redis key when publicMode is true', async () => {
      mockRedisGet.mockResolvedValueOnce(null);
      await buildChoropleth('2025-08', { publicMode: true });

      expect(mockRedisGet).toHaveBeenCalledWith('petakeu:geo:choropleth:2025-08:public');
    });

    it('generates correct Redis key when level, parent, and publicMode are all specified', async () => {
      mockRedisGet.mockResolvedValueOnce(null);
      await buildChoropleth('2025-08', { level: 2, parent: '3100', publicMode: true });

      expect(mockRedisGet).toHaveBeenCalledWith('petakeu:geo:choropleth:2025-08:2:3100:public');
    });

    it('handles explicit undefined level and parent gracefully', async () => {
      mockRedisGet.mockResolvedValueOnce(null);
      await buildChoropleth('2025-08', { level: undefined, parent: undefined });

      expect(mockRedisGet).toHaveBeenCalledWith('petakeu:geo:choropleth:2025-08');
    });
  });

  describe('2. Region Summary Cache Key Generation Edge Cases', () => {
    it('generates correct Redis key for regionId only', async () => {
      mockRedisGet.mockResolvedValueOnce(null);
      await getRegionSummary('3171');

      expect(mockRedisGet).toHaveBeenCalledWith('petakeu:regions:summary:3171');
    });

    it('generates correct Redis key when from parameter is specified', async () => {
      mockRedisGet.mockResolvedValueOnce(null);
      await getRegionSummary('3171', { from: '2024-01' });

      expect(mockRedisGet).toHaveBeenCalledWith('petakeu:regions:summary:3171:from:2024-01');
    });

    it('generates correct Redis key when to parameter is specified', async () => {
      mockRedisGet.mockResolvedValueOnce(null);
      await getRegionSummary('3171', { to: '2025-08' });

      expect(mockRedisGet).toHaveBeenCalledWith('petakeu:regions:summary:3171:to:2025-08');
    });

    it('generates correct Redis key when both from and to parameters are specified', async () => {
      mockRedisGet.mockResolvedValueOnce(null);
      await getRegionSummary('3171', { from: '2024-01', to: '2025-08' });

      expect(mockRedisGet).toHaveBeenCalledWith('petakeu:regions:summary:3171:from:2024-01:to:2025-08');
    });
  });

  describe('3. Cache Prefix Matching & Invalidation Behavior', () => {
    it('invalidateChoroplethCache purges pattern petakeu:geo:choropleth*', async () => {
      mockRedisKeys.mockResolvedValueOnce(['petakeu:geo:choropleth:2025-08', 'petakeu:geo:choropleth:2025-08:2:3100']);
      mockRedisDel.mockResolvedValueOnce(2);

      await invalidateChoroplethCache();

      expect(mockRedisKeys).toHaveBeenCalledWith('petakeu:geo:choropleth*');
      expect(mockRedisDel).toHaveBeenCalledWith(['petakeu:geo:choropleth:2025-08', 'petakeu:geo:choropleth:2025-08:2:3100']);
    });

    it('invalidateRegionCache purges pattern petakeu:regions*', async () => {
      mockRedisKeys.mockResolvedValueOnce(['petakeu:regions:summary:3171:from:2024-01:to:2025-08']);
      mockRedisDel.mockResolvedValueOnce(1);

      await invalidateRegionCache();

      expect(mockRedisKeys).toHaveBeenCalledWith('petakeu:regions*');
      expect(mockRedisDel).toHaveBeenCalledWith(['petakeu:regions:summary:3171:from:2024-01:to:2025-08']);
    });

    it('verify glob pattern matches generated keys empirically', () => {
      const choroplethKeys = [
        'petakeu:geo:choropleth:2025-08',
        'petakeu:geo:choropleth:2025-08:2',
        'petakeu:geo:choropleth:2025-08:3100',
        'petakeu:geo:choropleth:2025-08:2:3100',
        'petakeu:geo:choropleth:2025-08:public',
        'petakeu:geo:choropleth:2025-08:2:3100:public',
      ];
      const choroplethPrefix = 'petakeu:geo:choropleth';

      for (const k of choroplethKeys) {
        expect(k.startsWith(choroplethPrefix)).toBe(true);
      }

      const regionKeys = [
        'petakeu:regions:summary:3171',
        'petakeu:regions:summary:3171:from:2024-01',
        'petakeu:regions:summary:3171:to:2025-08',
        'petakeu:regions:summary:3171:from:2024-01:to:2025-08',
      ];
      const regionPrefix = 'petakeu:regions';

      for (const k of regionKeys) {
        expect(k.startsWith(regionPrefix)).toBe(true);
      }
    });
  });

  describe('4. Cache Hit Metric Counter & JSON Parse Behavior', () => {
    it('increments cacheHits counter on valid JSON hit and skips fetcher', async () => {
      const mockPayload = { foo: 'bar' };
      mockRedisGet.mockResolvedValueOnce(JSON.stringify(mockPayload));
      const fetchFn = vi.fn();

      const result = await getCached('test-key', fetchFn, { keyPrefix: 'petakeu:geo' });

      expect(result).toEqual(mockPayload);
      expect(cacheHits.inc).toHaveBeenCalledWith({ cache_type: 'redis' });
      expect(cacheMisses.inc).not.toHaveBeenCalled();
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('does NOT increment cacheHits on corrupt JSON string and falls back to fetcher', async () => {
      mockRedisGet.mockResolvedValueOnce('{invalid-json-content: 123');
      const fallbackPayload = { foo: 'fetched' };
      const fetchFn = vi.fn().mockResolvedValue(fallbackPayload);

      const result = await getCached('test-key', fetchFn, { keyPrefix: 'petakeu:geo' });

      expect(cacheHits.inc).not.toHaveBeenCalled();
      expect(cacheMisses.inc).toHaveBeenCalledWith({ cache_type: 'redis' });
      expect(fetchFn).toHaveBeenCalled();
      expect(result).toEqual(fallbackPayload);
    });

    it('does NOT increment cacheHits on empty string JSON and falls back to fetcher', async () => {
      mockRedisGet.mockResolvedValueOnce('');
      const fallbackPayload = { foo: 'fetched' };
      const fetchFn = vi.fn().mockResolvedValue(fallbackPayload);

      const result = await getCached('test-key', fetchFn, { keyPrefix: 'petakeu:geo' });

      expect(cacheHits.inc).not.toHaveBeenCalled();
      expect(cacheMisses.inc).toHaveBeenCalledWith({ cache_type: 'redis' });
      expect(fetchFn).toHaveBeenCalled();
      expect(result).toEqual(fallbackPayload);
    });

    it('does NOT increment cacheHits on "undefined" string JSON and falls back to fetcher', async () => {
      mockRedisGet.mockResolvedValueOnce('undefined');
      const fallbackPayload = { foo: 'fetched' };
      const fetchFn = vi.fn().mockResolvedValue(fallbackPayload);

      const result = await getCached('test-key', fetchFn, { keyPrefix: 'petakeu:geo' });

      expect(cacheHits.inc).not.toHaveBeenCalled();
      expect(cacheMisses.inc).toHaveBeenCalledWith({ cache_type: 'redis' });
      expect(fetchFn).toHaveBeenCalled();
      expect(result).toEqual(fallbackPayload);
    });

    it('handles Redis client get exception gracefully without crashing', async () => {
      mockRedisGet.mockRejectedValueOnce(new Error('Redis connection refused'));
      const fallbackPayload = { foo: 'fallback' };
      const fetchFn = vi.fn().mockResolvedValue(fallbackPayload);

      const result = await getCached('test-key', fetchFn, { keyPrefix: 'petakeu:geo' });

      expect(cacheHits.inc).not.toHaveBeenCalled();
      expect(cacheMisses.inc).toHaveBeenCalledWith({ cache_type: 'redis' });
      expect(fetchFn).toHaveBeenCalled();
      expect(result).toEqual(fallbackPayload);
    });

    it('handles Redis client setEx exception gracefully after fetcher completes', async () => {
      mockRedisGet.mockResolvedValueOnce(null);
      mockRedisSetEx.mockRejectedValueOnce(new Error('Redis read-only replica'));
      const fetchedPayload = { foo: 'success' };
      const fetchFn = vi.fn().mockResolvedValue(fetchedPayload);

      const result = await getCached('test-key', fetchFn, { keyPrefix: 'petakeu:geo' });

      expect(result).toEqual(fetchedPayload);
    });
  });

  describe('5. TTL Configuration & Config Defaults', () => {
    it('uses configured CHOROPLETH_CACHE_TTL or default 300', async () => {
      mockRedisGet.mockResolvedValueOnce(null);
      await buildChoropleth('2025-08');

      const ttlFromEnv = loadEnv().choroplethCacheTtl;
      expect(typeof ttlFromEnv).toBe('number');
      expect(ttlFromEnv).toBe(300);
      expect(mockRedisSetEx).toHaveBeenCalledWith('petakeu:geo:choropleth:2025-08', ttlFromEnv, expect.any(String));
    });

    it('uses configured REGION_SUMMARY_CACHE_TTL or default 180', async () => {
      mockRedisGet.mockResolvedValueOnce(null);
      await getRegionSummary('3171');

      const ttlFromEnv = loadEnv().regionSummaryCacheTtl;
      expect(typeof ttlFromEnv).toBe('number');
      expect(ttlFromEnv).toBe(180);
      expect(mockRedisSetEx).toHaveBeenCalledWith('petakeu:regions:summary:3171', ttlFromEnv, expect.any(String));
    });
  });
});

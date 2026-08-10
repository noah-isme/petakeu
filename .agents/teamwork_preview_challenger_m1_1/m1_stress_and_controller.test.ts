import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

import { geoController } from '../../apps/server/src/controllers/geo-controller';
import { geoService } from '../../apps/server/src/services/geo-service';
import { getCached } from '../../apps/server/src/db/redis';

vi.mock('../../apps/server/src/services/geo-service', () => ({
  geoService: {
    buildChoropleth: vi.fn().mockResolvedValue({ type: 'FeatureCollection', features: [] }),
    invalidateChoroplethCache: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockRedisGet = vi.fn();
const mockRedisSetEx = vi.fn();

vi.mock('redis', () => ({
  createClient: () => ({
    get: mockRedisGet,
    setEx: mockRedisSetEx,
    connect: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  }),
}));

vi.mock('../../apps/server/src/utils/metrics', () => ({
  cacheHits: { inc: vi.fn() },
  cacheMisses: { inc: vi.fn() },
}));

describe('Empirical Verification: Controller Integration & High-Concurrency Stress (M1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Geo Controller Query Parameter Parsing', () => {
    it('parses req.query.level as number and req.query.parent as string correctly', async () => {
      const req = {
        query: { period: '2025-08', level: '2', parent: '3100', public: 'true' },
      } as unknown as Request;

      const res = {
        json: vi.fn(),
      } as unknown as Response;

      const next = vi.fn();

      await geoController.getChoropleth(req, res, next);

      expect(geoService.buildChoropleth).toHaveBeenCalledWith('2025-08', {
        publicMode: true,
        level: 2,
        parent: '3100',
      });
      expect(res.json).toHaveBeenCalled();
    });

    it('handles omitted query params by passing undefined for level and parent', async () => {
      const req = {
        query: { period: '2025-08' },
      } as unknown as Request;

      const res = {
        json: vi.fn(),
      } as unknown as Response;

      const next = vi.fn();

      await geoController.getChoropleth(req, res, next);

      expect(geoService.buildChoropleth).toHaveBeenCalledWith('2025-08', {
        publicMode: false,
        level: undefined,
        parent: undefined,
      });
    });

    it('parses public=1 as publicMode=true', async () => {
      const req = {
        query: { public: '1' },
      } as unknown as Request;

      const res = {
        json: vi.fn(),
      } as unknown as Response;

      const next = vi.fn();

      await geoController.getChoropleth(req, res, next);

      expect(geoService.buildChoropleth).toHaveBeenCalledWith('2025-08', {
        publicMode: true,
        level: undefined,
        parent: undefined,
      });
    });
  });

  describe('2. High-Concurrency Stress & Parallel Cache Reads', () => {
    it('handles 100 concurrent getCached calls under cache hit without race conditions', async () => {
      const payload = { id: 1, data: 'cached-data' };
      mockRedisGet.mockResolvedValue(JSON.stringify(payload));
      const fetchFn = vi.fn();

      const promises = Array.from({ length: 100 }, () =>
        getCached('concurrency-key', fetchFn, { keyPrefix: 'petakeu:geo' })
      );

      const results = await Promise.all(promises);

      expect(results.length).toBe(100);
      results.forEach((res) => expect(res).toEqual(payload));
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('handles 100 concurrent getCached calls under cache miss without crashing', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockRedisSetEx.mockResolvedValue('OK');
      const fetchFn = vi.fn().mockImplementation(async () => ({ data: 'fetched' }));

      const promises = Array.from({ length: 100 }, () =>
        getCached('concurrency-key', fetchFn, { keyPrefix: 'petakeu:geo' })
      );

      const results = await Promise.all(promises);

      expect(results.length).toBe(100);
      expect(fetchFn).toHaveBeenCalledTimes(100);
    });
  });
});

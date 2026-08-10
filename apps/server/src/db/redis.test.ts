import { describe, expect, it, vi, beforeEach } from 'vitest';

import { getCached } from './redis';
import { cacheHits, cacheMisses } from '../utils/metrics';

const mockRedisClient = {
  get: vi.fn(),
  setEx: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
};

vi.mock('redis', () => ({
  createClient: () => mockRedisClient,
}));

vi.mock('../utils/metrics', () => ({
  cacheHits: { inc: vi.fn() },
  cacheMisses: { inc: vi.fn() },
}));

describe('redis getCached', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('increments cacheHits counter on cache hit after successful JSON parse', async () => {
    const cachedData = { foo: 'bar' };
    mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(cachedData));

    const fetchFn = vi.fn();
    const result = await getCached('test-key', fetchFn, { keyPrefix: 'petakeu:geo' });

    expect(result).toEqual(cachedData);
    expect(cacheHits.inc).toHaveBeenCalledWith({ cache_type: 'redis' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('falls back to fetchFn and increments cacheMisses when cache is empty', async () => {
    mockRedisClient.get.mockResolvedValueOnce(null);
    const expected = { foo: 'fetched' };
    const fetchFn = vi.fn().mockResolvedValue(expected);

    const result = await getCached('test-key', fetchFn, { keyPrefix: 'petakeu:geo' });

    expect(result).toEqual(expected);
    expect(cacheMisses.inc).toHaveBeenCalledWith({ cache_type: 'redis' });
    expect(fetchFn).toHaveBeenCalled();
  });

  it('does not increment cacheHits if JSON parse throws an error', async () => {
    mockRedisClient.get.mockResolvedValueOnce('invalid-json{{{');
    const expected = { foo: 'recovered' };
    const fetchFn = vi.fn().mockResolvedValue(expected);

    const result = await getCached('corrupt-key', fetchFn, { keyPrefix: 'petakeu:geo' });

    expect(cacheHits.inc).not.toHaveBeenCalled();
    expect(result).toEqual(expected);
  });
});

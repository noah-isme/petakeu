# Analysis Report: Milestone 1 Features 3 & 4 (Region Caching & Cache Metrics)

## 1. Executive Summary

This report provides a read-only architectural investigation and proposed solution for **Feature 3** (Region Summary Cache Key Fix & Configurable TTL) and **Feature 4** (Redis Cache Hits Counter Metric Incrementing) in `@petakeu/server`.

- **Feature 3 Findings**: `apps/server/src/services/region-service.ts` currently suffers from **duplicate key prefixing**. The helper `buildRegionSummaryCacheKey` prefixes the cache key with `regions:summary:...`, while `getCached()` passes option `{ keyPrefix: 'regions' }`. Combined with `redis.ts` (`fullKey = ${options.keyPrefix}:${key}`), the actual Redis key generated is `regions:regions:summary:{regionId}:from:{from}:to:{to}` instead of `petakeu:regions:summary:{regionId}:{from}:{to}`. Additionally, `REGION_SUMMARY_CACHE_TTL` is hardcoded to `180` in `region-service.ts` rather than being loaded from `env.ts`.
- **Feature 4 Findings**: `apps/server/src/db/redis.ts` has `cacheHits.inc({ cache_type: 'redis' })` inside `getCached()`, which increments `petakeu_cache_hits_total`. However, `cacheHits.inc` is currently positioned *before* `JSON.parse(cached)`. If `JSON.parse` fails, `cacheHits` is falsely incremented before the catch block increments `cacheMisses`, leading to metric corruption. Reordering `JSON.parse` before `cacheHits.inc` resolves this flaw.

---

## 2. Feature 3 Investigation: Region Summary Cache Key & Configurable TTL

### 2.1 File Analysis: `apps/server/src/services/region-service.ts`

- **Location**: `apps/server/src/services/region-service.ts`
- **Lines 31–36**:
  ```ts
  function buildRegionSummaryCacheKey(regionId: string, range?: { from?: string; to?: string }): string {
    const parts = ['regions', 'summary', regionId];
    if (range?.from) parts.push(`from:${range.from}`);
    if (range?.to) parts.push(`to:${range.to}`);
    return parts.join(':');
  }
  ```
- **Lines 91–98 & Line 181**:
  ```ts
  export async function getRegionSummary(
    regionId: string,
    range?: { from?: string; to?: string }
  ): Promise<RegionSummary> {
    const cacheKey = buildRegionSummaryCacheKey(regionId, range);

    return getCached<RegionSummary>(
      cacheKey,
      async () => { ... },
      { ttl: 180, keyPrefix: 'regions' }
    );
  }
  ```

#### Issue 1: Duplicate Key Prefixing
In `apps/server/src/db/redis.ts` (line 44):
```ts
const fullKey = `${options.keyPrefix || 'petakeu'}:${key}`;
```
When `getRegionSummary()` passes `keyPrefix: 'regions'` and `buildRegionSummaryCacheKey` starts with `['regions', 'summary', ...]`, `fullKey` becomes:
`regions:regions:summary:3171:from:2024-01:to:2025-08`

#### Required Standard Key Format
Per `PROJECT.md` and `SCOPE.md`:
- Expected Redis Key: `petakeu:regions:summary:{regionId}:{from}:{to}` (e.g. `petakeu:regions:summary:3171:from:2024-01:to:2025-08`).
- Key prefix option passed to `getCached()`: `{ keyPrefix: 'petakeu:regions' }` (or `{ keyPrefix: 'regions' }` with `redis.ts` adding `petakeu:` prefix). Using `{ keyPrefix: 'petakeu:regions' }` yields `petakeu:regions:summary:{regionId}:from:{from}:to:{to}` when `buildRegionSummaryCacheKey` returns `summary:{regionId}:from:{from}:to:{to}`.

#### Issue 2: Hardcoded TTL
In `region-service.ts` line 181, `{ ttl: 180, keyPrefix: 'regions' }` hardcodes 180 seconds.
It should read `REGION_SUMMARY_CACHE_TTL` from `env.ts` (default: 180 seconds).

---

### 2.2 File Analysis: `apps/server/src/config/env.ts`

- **Location**: `apps/server/src/config/env.ts`
- **Current State**:
  `EnvConfig` interface lacks `regionSummaryCacheTtl`.

#### Proposed Modification in `env.ts`:
```ts
export interface EnvConfig {
  port: number;
  nodeEnv: string;
  databaseUrl?: string;
  redisUrl?: string;
  authSecret?: string;
  authDisabled: boolean;
  storageEndpoint: string;
  storageAccessKey: string;
  storageSecretKey: string;
  storageRegion: string;
  storageBucket: string;
  storageReportsBucket: string;
  choroplethCacheTtl: number;
  regionSummaryCacheTtl: number;
}

export function loadEnv(): EnvConfig {
  return {
    ...
    choroplethCacheTtl: Number(process.env.CHOROPLETH_CACHE_TTL ?? 300),
    regionSummaryCacheTtl: Number(process.env.REGION_SUMMARY_CACHE_TTL ?? 180),
  };
}
```

---

### 2.3 Proposed Code Changes for `region-service.ts`

```ts
// In apps/server/src/services/region-service.ts

import { loadEnv } from '../config/env';

function buildRegionSummaryCacheKey(regionId: string, range?: { from?: string; to?: string }): string {
  const parts = ['summary', regionId];
  if (range?.from) parts.push(`from:${range.from}`);
  if (range?.to) parts.push(`to:${range.to}`);
  return parts.join(':');
}

export async function getRegionSummary(
  regionId: string,
  range?: { from?: string; to?: string }
): Promise<RegionSummary> {
  const cacheKey = buildRegionSummaryCacheKey(regionId, range);
  const env = loadEnv();

  return getCached<RegionSummary>(
    cacheKey,
    async () => {
      // DB fetch logic
    },
    { ttl: env.regionSummaryCacheTtl, keyPrefix: 'petakeu:regions' }
  );
}
```

---

## 3. Feature 4 Investigation: Cache Hits Metric Logging

### 3.1 File Analysis: `apps/server/src/db/redis.ts` & `apps/server/src/utils/metrics.ts`

- **Location**: `apps/server/src/db/redis.ts`
- **Lines 38–67**:
  ```ts
  export async function getCached<T>(
    key: string,
    fetchFn: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const client = getRedisClient();
    const fullKey = `${options.keyPrefix || 'petakeu'}:${key}`;
    const ttl = options.ttl || 300;

    try {
      const cached = await client.get(fullKey);
      if (cached !== null) {
        cacheHits.inc({ cache_type: 'redis' });
        return JSON.parse(cached) as T;
      }
    } catch (error) {
      console.warn('[cache] Get failed:', error);
    }

    cacheMisses.inc({ cache_type: 'redis' });
    const data = await fetchFn();

    try {
      await client.setEx(fullKey, ttl, JSON.stringify(data));
    } catch (error) {
      console.warn('[cache] Set failed:', error);
    }

    return data;
  }
  ```

#### Metric Definition in `metrics.ts`:
```ts
export const cacheHits = new Counter({
  name: 'petakeu_cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type'],
  registers: [register]
});
```

#### Diagnosis & Ordering Fix
1. `cacheHits` counter uses label `cache_type: 'redis'`, which maps to metric `petakeu_cache_hits_total{cache_type="redis"}`.
2. In `redis.ts` line 50, `cacheHits.inc({ cache_type: 'redis' })` is executed when `cached !== null`.
3. **Flaw**: `cacheHits.inc` is executed *before* `JSON.parse(cached)`. If `JSON.parse` throws a `SyntaxError` (corrupted cache payload), `cacheHits` is incremented. Then control jumps to the `catch` block and continues to `cacheMisses.inc({ cache_type: 'redis' })`, recording both a hit and a miss.
4. **Fix**: Perform `JSON.parse(cached)` first, then increment `cacheHits.inc({ cache_type: 'redis' })`, then return the parsed object.

#### Proposed Code Change for `redis.ts`:

```ts
    try {
      const cached = await client.get(fullKey);
      if (cached !== null) {
        const data = JSON.parse(cached) as T;
        cacheHits.inc({ cache_type: 'redis' });
        return data;
      }
    } catch (error) {
      console.warn('[cache] Get failed:', error);
    }
```

---

## 4. Cache Invalidation Alignment

- **Location**: `apps/server/src/services/region-service.ts`
- **Lines 185–188**:
  ```ts
  export async function invalidateRegionCache(): Promise<void> {
    await invalidateCacheByPrefix('regions');
    logger.info('Region cache invalidated');
  }
  ```
- **In `redis.ts`**:
  ```ts
  export async function invalidateCache(pattern: string): Promise<void> {
    const client = getRedisClient();
    const fullPattern = `petakeu:${pattern}*`;
    ...
  ```
- When `invalidateRegionCache()` calls `invalidateCacheByPrefix('regions')` or `invalidateCacheByPrefix('regions:')`, `fullPattern` becomes `petakeu:regions*`, which cleanly matches all Redis keys with prefix `petakeu:regions:summary:...`.

---

## 5. Proposed Unit Test Suite (`region-service.test.ts`)

To support Milestone 3 test coverage, the following Vitest test suite should be created:

```ts
// apps/server/src/services/region-service.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getRegionSummary, invalidateRegionCache } from './region-service';
import * as redisDb from '../db/redis';

vi.mock('../db/postgres', () => ({
  getPgPool: () => ({
    query: vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('FROM regions WHERE id')) {
        return Promise.resolve({
          rows: [{ id: '3171', code: '31.71', name: 'Kota Jakarta Selatan', level: 2, parentId: '31' }]
        });
      }
      return Promise.resolve({
        rows: [{ period: '2025-01', amount: '1000000', cut15Amount: '150000', netAmount: '850000' }]
      });
    })
  })
}));

describe('regionService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('builds summary cache key with prefix petakeu:regions:summary:{id}:{from}:{to}', async () => {
    const getCachedSpy = vi.spyOn(redisDb, 'getCached').mockImplementation(async (_key, fetchFn) => fetchFn());

    await getRegionSummary('3171', { from: '2024-01', to: '2025-08' });

    expect(getCachedSpy).toHaveBeenCalledWith(
      'summary:3171:from:2024-01:to:2025-08',
      expect.any(Function),
      expect.objectContaining({
        ttl: 180,
        keyPrefix: 'petakeu:regions'
      })
    );
  });
});
```

---

## 6. Summary Table of Proposed Modifications

| File | Target Lines | Modification Summary | Feature |
|------|--------------|----------------------|---------|
| `apps/server/src/config/env.ts` | 1–14, 16–30 | Add `regionSummaryCacheTtl: number` to `EnvConfig` and `loadEnv()` (default `180`) | Feature 3 |
| `apps/server/src/services/region-service.ts` | 31–36 | Change `buildRegionSummaryCacheKey` to start with `['summary', regionId]` | Feature 3 |
| `apps/server/src/services/region-service.ts` | 181 | Use `loadEnv().regionSummaryCacheTtl` and `keyPrefix: 'petakeu:regions'` | Feature 3 |
| `apps/server/src/db/redis.ts` | 48–53 | Parse JSON before calling `cacheHits.inc({ cache_type: 'redis' })` | Feature 4 |

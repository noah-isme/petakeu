# Technical Analysis: Redis Caching for Choropleth GeoJSON & Region Summaries

## Executive Summary
This document presents a comprehensive codebase survey and architectural analysis for Roadmap Item 1: **Redis Caching for Choropleth GeoJSON (`choropleth:{period}:{level}:{parent}`) & Region Summaries (`/api/v1/regions/:id/summary`) with Configurable TTLs, Cache Hits Metric Logging (`petakeu_cache_hits_total`), and Explicit Cache Invalidation**.

The survey confirms that the foundation for Redis caching and Prometheus metric tracking exists in `apps/server/src/db/redis.ts` and `apps/server/src/utils/metrics.ts`. However, several key gaps and key formatting alignment issues exist across the controller, service, job, and configuration layers.

---

## 1. Route, Controller & Service Analysis

### 1.1 Choropleth GeoJSON Endpoint (`GET /api/v1/geo/choropleth`)
- **Route**: `apps/server/src/routes/v1/geo.ts:53`
  - Endpoint: `GET /api/v1/geo/choropleth` (protected by `requireAuth`).
- **Controller**: `apps/server/src/controllers/geo-controller.ts:6-11`
  - Function: `getChoropleth`
  - **Issue Identified**: The controller reads `req.query.period` and `req.query.public`, but ignores `req.query.level` and `req.query.parent` (or `req.query.parentId`). Consequently, requests with level/parent parameters do not get passed down to `geoService.buildChoropleth`.
- **Service**: `apps/server/src/services/geo-service.ts:47-183`
  - Function: `buildChoropleth(period: string, options: { publicMode?: boolean; level?: number; parent?: string })`
  - Cache Key Builder (`buildCacheKey` at lines 47-53):
    ```ts
    function buildCacheKey(period: string, options: { publicMode?: boolean; level?: number; parent?: string } = {}): string {
      const parts = ['choropleth', period];
      if (options.publicMode) parts.push('public');
      if (options.level) parts.push(`level${options.level}`);
      if (options.parent) parts.push(`parent${options.parent}`);
      return parts.join(':');
    }
    ```
  - Caching logic (line 62): `getCached<ChoroplethResponse>(cacheKey, fetchFn, { ttl: 300, keyPrefix: 'geo' })`.
  - Resulting Redis key: `petakeu:geo:choropleth:{period}:...`
  - Discrepancy vs Spec: Roadmap specification specifies key structure `choropleth:{period}:{level}:{parent}` (or `geo:choropleth:{period}:{level}:{parent}`).
  - Invalidation helper (lines 185-188): `invalidateChoroplethCache()` calls `invalidateCacheByPrefix('geo:choropleth')`.

### 1.2 Region Summary Endpoint (`GET /api/v1/regions/:id/summary`)
- **Route**: `apps/server/src/routes/v1/regions.ts:112`
  - Endpoint: `GET /api/v1/regions/:id/summary` (protected by `requireAuth`).
- **Controller**: `apps/server/src/controllers/region-controller.ts:25-31`
  - Function: `getRegionSummary`
  - Extracts `id` from `req.params`, `from` and `to` from `req.query`.
  - Calls `regionService.getRegionSummary(id, { from, to })`.
- **Service**: `apps/server/src/services/region-service.ts:91-183`
  - Function: `getRegionSummary(regionId: string, range?: { from?: string; to?: string })`
  - Cache Key Builder (`buildRegionSummaryCacheKey` at lines 31-36):
    ```ts
    function buildRegionSummaryCacheKey(regionId: string, range?: { from?: string; to?: string }): string {
      const parts = ['regions', 'summary', regionId];
      if (range?.from) parts.push(`from:${range.from}`);
      if (range?.to) parts.push(`to:${range.to}`);
      return parts.join(':');
    }
    ```
  - Caching logic (line 97): `getCached<RegionSummary>(cacheKey, fetchFn, { ttl: 180, keyPrefix: 'regions' })`.
  - Resulting Redis key: `petakeu:regions:regions:summary:{regionId}:...`
  - Discrepancy vs Spec: Roadmap specification specifies key structure `summary:{regionId}:{from}:{to}` (or `regions:summary:{regionId}:{from}:{to}`). Passing `keyPrefix: 'regions'` with key starting with `regions` creates redundant prefixing (`petakeu:regions:regions:summary:...`).
  - Invalidation helper (lines 185-188): `invalidateRegionCache()` calls `invalidateCacheByPrefix('regions')`.

---

## 2. Redis Connection & Cache Mechanics (`apps/server/src/db/redis.ts`)

- **Client Setup**: Singleton via `getRedisClient()` connecting to `process.env.REDIS_URL` (default `redis://localhost:6379`).
- **`getCached<T>` Helper**:
  ```ts
  export async function getCached<T>(
    key: string,
    fetchFn: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const client = getRedisClient();
    const fullKey = `${options.keyPrefix || 'petakeu'}:${key}`;
    const ttl = options.ttl || 300; // default 5 minutes

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
- **`invalidateCache` Helper**:
  ```ts
  export async function invalidateCache(pattern: string): Promise<void> {
    const client = getRedisClient();
    const fullPattern = `petakeu:${pattern}*`;
    try {
      const keys = await client.keys(fullPattern);
      if (keys.length > 0) {
        await client.del(keys);
      }
    } catch (error) {
      console.warn('[cache] Invalidate failed:', error);
    }
  }
  ```

---

## 3. Metrics & Prometheus Integration (`apps/server/src/utils/metrics.ts`)

- **Registry**: Prometheus client registry initialized with `petakeu_` metric prefix.
- **Metric Definitions**:
  - `cacheHits`:
    ```ts
    export const cacheHits = new Counter({
      name: 'petakeu_cache_hits_total',
      help: 'Total number of cache hits',
      labelNames: ['cache_type'],
      registers: [register]
    });
    ```
  - `cacheMisses`:
    ```ts
    export const cacheMisses = new Counter({
      name: 'petakeu_cache_misses_total',
      help: 'Total number of cache misses',
      labelNames: ['cache_type'],
      registers: [register]
    });
    ```
- **Execution**: Increment calls `cacheHits.inc({ cache_type: 'redis' })` occur inside `getCached()` when `client.get(fullKey)` succeeds.
- **Metrics Endpoint**: Exposed at `GET /metrics` in `apps/server/src/server.ts:81-88`.

---

## 4. Cache Invalidation & Trigger Jobs

### 4.1 Upload Worker (`apps/server/src/jobs/upload-worker.ts`)
- **Trigger**: `processUpload(job)` handles payment data upload jobs from BullMQ.
- **Materialized View Refresh**: Calls `SELECT refresh_mv_payments_with_cut()` (lines 173-176).
- **Current Cache Invalidation Calls** (lines 179-182):
  ```ts
  await invalidateChoroplethCache();
  await invalidateFiscalCache();
  await invalidateDefisitwatchCache();
  await invalidateRankfinCache();
  ```
- **CRITICAL GAP**: `invalidateRegionCache()` is NOT called in `upload-worker.ts`. Thus, region summaries remain stale after new uploads are processed.

### 4.2 Materialized View Refresh Cron (`apps/server/src/jobs/mv-refresh-cron.ts`)
- **Trigger**: Scheduled every 15 minutes (`*/15 * * * *`).
- **Materialized View Refresh**: Calls `SELECT refresh_mv_payments_with_cut()` (line 17).
- **Current Cache Invalidation Calls** (lines 21-24):
  ```ts
  await invalidateChoroplethCache();
  await invalidateFiscalCache();
  await invalidateDefisitwatchCache();
  await invalidateRankfinCache();
  ```
- **CRITICAL GAP**: `invalidateRegionCache()` is NOT called in `mv-refresh-cron.ts`. Thus, region summaries remain stale after cron MV refreshes.

---

## 5. Environment Variables & Configurable TTLs (`apps/server/src/config/env.ts`)

- **Current State**:
  - `REDIS_URL` is parsed in `loadEnv()` (`apps/server/src/config/env.ts:21`).
  - Cache TTLs are currently hardcoded numbers in service files:
    - Choropleth GeoJSON TTL: `300` seconds (5 minutes) in `geo-service.ts:178`.
    - Region Summary TTL: `180` seconds (3 minutes) in `region-service.ts:181`.
    - Region List TTL: `600` seconds (10 minutes) in `region-service.ts:87`.
- **Recommendation**: Add configurable TTL properties to `EnvConfig` in `apps/server/src/config/env.ts` (e.g. `CHOROPLETH_CACHE_TTL`, `REGION_SUMMARY_CACHE_TTL`) with fallbacks to default values.

---

## 6. Actionable Implementation Plan & Recommendations

1. **Fix Missing Cache Invalidation Calls**:
   - In `apps/server/src/jobs/upload-worker.ts`: Import `invalidateRegionCache` from `../services/region-service` and call it alongside `invalidateChoroplethCache()`. Update `upload-worker.test.ts` mock.
   - In `apps/server/src/jobs/mv-refresh-cron.ts`: Import `invalidateRegionCache` from `../services/region-service` and call it alongside `invalidateChoroplethCache()`.

2. **Standardize Redis Key Patterns**:
   - Align `geo-service.ts` key format: `choropleth:{period}:{level}:{parent}` (or `geo:choropleth:{period}:{level}:{parent}`). Ensure level/parent parameters are passed from `geo-controller.ts`.
   - Align `region-service.ts` key format: `summary:{regionId}:{from}:{to}` (or `regions:summary:{regionId}:{from}:{to}`). Eliminate duplicate prefixing.

3. **Wire Query Parameters in Geo Controller**:
   - In `geo-controller.ts`: Parse `req.query.level` and `req.query.parent` and pass them to `geoService.buildChoropleth(period, { publicMode, level, parent })`.

4. **Add Configurable TTLs in `env.ts`**:
   - Add `CHOROPLETH_CACHE_TTL` (default 300) and `REGION_SUMMARY_CACHE_TTL` (default 180) to `loadEnv()`.

5. **Enhance Unit / Integration Tests**:
   - Verify `cacheHits` counter increments on cache hits in integration tests.
   - Verify `invalidateRegionCache()` and `invalidateChoroplethCache()` execute on upload completion and MV refresh cron.

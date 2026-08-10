# Handoff Report: Redis Caching Survey & Analysis (Roadmap Item 1)

## 1. Observation

### 1.1 Express Routes & Controllers
- **Geo Router**: `apps/server/src/routes/v1/geo.ts` line 53
  `geoRouter.get("/choropleth", requireAuth, geoController.getChoropleth);`
- **Geo Controller**: `apps/server/src/controllers/geo-controller.ts` lines 6-11
  ```ts
  const getChoropleth = asyncHandler(async (req: Request, res: Response) => {
    const period = (req.query.period as string) ?? "2025-08";
    const publicMode = req.query.public === "1" || req.query.public === "true";
    const payload = await geoService.buildChoropleth(period, { publicMode });
    res.json(payload);
  });
  ```
  *(Note: `req.query.level` and `req.query.parent` are present in Swagger docs but omitted when invoking `geoService.buildChoropleth`)*.
- **Regions Router**: `apps/server/src/routes/v1/regions.ts` line 112
  `regionRouter.get("/:id/summary", requireAuth, regionController.getRegionSummary);`
- **Regions Controller**: `apps/server/src/controllers/region-controller.ts` lines 25-31
  ```ts
  const getRegionSummary = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { from, to } = req.query as { from?: string; to?: string };
    const summary = await regionService.getRegionSummary(id, { from, to });
    res.json(summary);
  });
  ```

### 1.2 Caching Services
- **Geo Service**: `apps/server/src/services/geo-service.ts`
  - Cache Key Builder (lines 47-53):
    ```ts
    function buildCacheKey(period: string, options: { publicMode?: boolean; level?: number; parent?: string } = {}): string {
      const parts = ['choropleth', period];
      if (options.publicMode) parts.push('public');
      if (options.level) parts.push(`level${options.level}`);
      if (options.parent) parts.push(`parent${options.parent}`);
      return parts.join(':');
    }
    ```
  - Service Caching (line 178): `getCached<ChoroplethResponse>(cacheKey, fetchFn, { ttl: 300, keyPrefix: 'geo' })`
  - Invalidation Helper (lines 185-188):
    ```ts
    export async function invalidateChoroplethCache(): Promise<void> {
      await invalidateCacheByPrefix('geo:choropleth');
      logger.info('Choropleth cache invalidated');
    }
    ```
- **Region Service**: `apps/server/src/services/region-service.ts`
  - Cache Key Builder (lines 31-36):
    ```ts
    function buildRegionSummaryCacheKey(regionId: string, range?: { from?: string; to?: string }): string {
      const parts = ['regions', 'summary', regionId];
      if (range?.from) parts.push(`from:${range.from}`);
      if (range?.to) parts.push(`to:${range.to}`);
      return parts.join(':');
    }
    ```
  - Service Caching (line 181): `getCached<RegionSummary>(cacheKey, fetchFn, { ttl: 180, keyPrefix: 'regions' })`
  - Invalidation Helper (lines 185-188):
    ```ts
    export async function invalidateRegionCache(): Promise<void> {
      await invalidateCacheByPrefix('regions');
      logger.info('Region cache invalidated');
    }
    ```

### 1.3 Redis Client & Helper Utilities
- **Redis Utility**: `apps/server/src/db/redis.ts`
  - Connection (lines 9-24): Singleton `getRedisClient()` connecting to `env.redisUrl || 'redis://localhost:6379'`.
  - `getCached<T>` (lines 38-67): Key prefixed as `${options.keyPrefix || 'petakeu'}:${key}`. On hit, increments `cacheHits.inc({ cache_type: 'redis' })` (line 50). On miss, increments `cacheMisses.inc({ cache_type: 'redis' })` (line 57).
  - `invalidateCache` (lines 69-81): Matches keys by pattern `petakeu:${pattern}*` and deletes matching keys.

### 1.4 Prometheus Metrics Setup
- **Metrics Utility**: `apps/server/src/utils/metrics.ts`
  - Metric Registration (lines 53-58):
    ```ts
    export const cacheHits = new Counter({
      name: 'petakeu_cache_hits_total',
      help: 'Total number of cache hits',
      labelNames: ['cache_type'],
      registers: [register]
    });
    ```
  - Metrics Route: `apps/server/src/server.ts` lines 81-88 (`GET /metrics`).

### 1.5 Background Workers & Invalidation Triggers
- **Upload Worker**: `apps/server/src/jobs/upload-worker.ts` lines 179-182
  Invokes:
  `await invalidateChoroplethCache();`
  `await invalidateFiscalCache();`
  `await invalidateDefisitwatchCache();`
  `await invalidateRankfinCache();`
  *(Note: `invalidateRegionCache()` is missing)*.
- **MV Refresh Cron**: `apps/server/src/jobs/mv-refresh-cron.ts` lines 21-24
  Invokes:
  `await invalidateChoroplethCache();`
  `await invalidateFiscalCache();`
  `await invalidateDefisitwatchCache();`
  `await invalidateRankfinCache();`
  *(Note: `invalidateRegionCache()` is missing)*.

---

## 2. Logic Chain

1. **Redis Caching Foundations**: The application currently has a functional Redis client (`apps/server/src/db/redis.ts`) and a generic `getCached()` wrapper that handles hit/miss counting via Prometheus (`petakeu_cache_hits_total`).
2. **Key Format Alignment**:
   - `buildChoropleth` uses key format `petakeu:geo:choropleth:{period}...`. The roadmap requirement specifies key format `choropleth:{period}:{level}:{parent}`.
   - `getRegionSummary` uses key format `petakeu:regions:regions:summary:{regionId}...` because key prefixing in `redis.ts` prepends `keyPrefix` ('regions') to a key that already starts with `'regions'`. Standardizing key generation will resolve duplicate prefixes.
3. **Controller Query Parameters**: `geoController.getChoropleth` currently ignores `req.query.level` and `req.query.parent`. Passing these parameters from `req.query` to `geoService.buildChoropleth` is necessary to support regional level/parent filtering in choropleth cache keys.
4. **Cache Invalidation Gaps**: Both `upload-worker.ts` (lines 179-182) and `mv-refresh-cron.ts` (lines 21-24) invoke cache invalidation after refreshing `mv_payments_with_cut`, but neither job currently imports or calls `invalidateRegionCache()`. Therefore, region summaries remain cached with stale data after upload completion or cron MV refreshes.
5. **Configurable TTLs**: TTL values are currently hardcoded (300s in `geo-service.ts`, 180s in `region-service.ts`). Exposing `CHOROPLETH_CACHE_TTL` and `REGION_SUMMARY_CACHE_TTL` in `apps/server/src/config/env.ts` fulfills the configurable TTL requirement.

---

## 3. Caveats

- **No Source Modifications Made**: This investigation was conducted strictly read-only. No app code files outside of `.agents/teamwork_preview_explorer_survey_1` were altered.
- **Live Redis Behavior**: Live Redis key eviction was analyzed based on `apps/server/src/db/redis.ts` source code logic rather than executing a running Redis instance in benchmark mode.

---

## 4. Conclusion

Roadmap Item 1 requires minor, targeted adjustments to complete full alignment:
1. Wire `req.query.level` and `req.query.parent` in `geo-controller.ts`.
2. Add missing `invalidateRegionCache()` calls to `upload-worker.ts` and `mv-refresh-cron.ts` (and update unit test mocks in `upload-worker.test.ts`).
3. Standardize cache key formats for choropleth GeoJSON (`choropleth:{period}:{level}:{parent}`) and region summaries (`summary:{regionId}:{from}:{to}`).
4. Add configurable TTL variables to `env.ts`.

---

## 5. Verification Method

To independently verify the survey findings:
1. **Inspect Invalidation Calls**:
   - Check `apps/server/src/jobs/upload-worker.ts` lines 179-182. Notice `invalidateRegionCache()` is absent.
   - Check `apps/server/src/jobs/mv-refresh-cron.ts` lines 21-24. Notice `invalidateRegionCache()` is absent.
2. **Inspect Query Parameter Handling in Controller**:
   - View `apps/server/src/controllers/geo-controller.ts` lines 6-11. Notice `req.query.level` and `req.query.parent` are not extracted or passed to `geoService.buildChoropleth`.
3. **Inspect Cache Hits Counter**:
   - View `apps/server/src/db/redis.ts` line 50. Observe `cacheHits.inc({ cache_type: 'redis' })` tracking `petakeu_cache_hits_total`.
4. **Run Server Test Suite**:
   ```bash
   pnpm --filter server test
   ```

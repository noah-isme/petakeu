# Forensic Audit Report — Milestone M1: Redis Caching & Invalidation

**Work Product**: `@petakeu/server` (Milestone M1)  
**Profile**: General Project  
**Integrity Mode**: Benchmark (Maximum Strictness)  
**Verdict**: CLEAN  

---

## Phase Results

- **Hardcoded output detection**: PASS — No hardcoded test results, expected response literals, or constant returns found in source files.
- **Facade implementation check**: PASS — All functions (`buildChoropleth`, `getRegionSummary`, `getCached`, `invalidateRegionCache`, `invalidateChoroplethCache`) execute real database queries, Redis interactions, or Prometheus metrics calls.
- **Pre-populated artifact detection**: PASS — No pre-existing result files or mock logs were present in the workspace prior to audit test execution.
- **Typecheck verification**: PASS — Executed `pnpm --filter @petakeu/server typecheck` with exit status 0 (0 errors).
- **Behavioral unit test execution**: PASS — Executed `pnpm --filter @petakeu/server test` with exit status 0. Passed 5 test suites (`redis.test.ts`, `geo-service.test.ts`, `region-service.test.ts`, `upload-worker.test.ts`, `health.test.ts`), 40/40 tests passed.
- **Dependency & delegation audit**: PASS — No forbidden external dependencies or third-party execution delegation used for core deliverables. Standard project dependencies (`ioredis`, `pg`, `prom-client`) used appropriately.

---

## 1. Observation

1. **TTL Environment Variable Implementation (`apps/server/src/config/env.ts`, `geo-service.ts`, `region-service.ts`)**:
   - `env.ts` lines 27–33:
     ```ts
     choroplethCacheTtl: Number(process.env.CHOROPLETH_CACHE_TTL ?? 300),
     regionSummaryCacheTtl: Number(process.env.REGION_SUMMARY_CACHE_TTL ?? 180),
     ```
   - `geo-service.ts` line 179:
     ```ts
     { ttl: loadEnv().choroplethCacheTtl, keyPrefix: 'petakeu:geo' }
     ```
   - `region-service.ts` line 182:
     ```ts
     { ttl: loadEnv().regionSummaryCacheTtl, keyPrefix: 'petakeu:regions' }
     ```

2. **Query Parameter Forwarding (`apps/server/src/controllers/geo-controller.ts`)**:
   - Lines 9–11:
     ```ts
     const level = req.query.level ? Number(req.query.level) : undefined;
     const parent = req.query.parent ? String(req.query.parent) : undefined;
     const payload = await geoService.buildChoropleth(period, { publicMode, level, parent });
     ```

3. **Key Prefix Formatting (`apps/server/src/services/geo-service.ts`, `apps/server/src/services/region-service.ts`)**:
   - `geo-service.ts` lines 48–54:
     ```ts
     function buildCacheKey(period: string, options: { publicMode?: boolean; level?: number; parent?: string } = {}): string {
       const parts = ['choropleth', period];
       if (options.level !== undefined) parts.push(String(options.level));
       if (options.parent !== undefined) parts.push(String(options.parent));
       if (options.publicMode) parts.push('public');
       return parts.join(':');
     }
     ```
     With `keyPrefix: 'petakeu:geo'`, evaluates to Redis key `petakeu:geo:choropleth:{period}:{level}:{parent}`.
   - `region-service.ts` lines 32–37:
     ```ts
     function buildRegionSummaryCacheKey(regionId: string, range?: { from?: string; to?: string }): string {
       const parts = ['summary', regionId];
       if (range?.from) parts.push(`from:${range.from}`);
       if (range?.to) parts.push(`to:${range.to}`);
       return parts.join(':');
     }
     ```
     Fixed duplicate prefixing (`regions:regions:summary...`). With `keyPrefix: 'petakeu:regions'`, evaluates to `petakeu:regions:summary:{regionId}:{from}:{to}`.

4. **Metric Increment Reordering (`apps/server/src/db/redis.ts`)**:
   - Lines 48–53:
     ```ts
     const cached = await client.get(fullKey);
     if (cached !== null) {
       const data = JSON.parse(cached) as T;
       cacheHits.inc({ cache_type: 'redis' });
       return data;
     }
     ```
     `JSON.parse(cached)` executes BEFORE `cacheHits.inc(...)`, preventing false metric increments on corrupt JSON cache data.

5. **Explicit Invalidation Hooks (`apps/server/src/jobs/upload-worker.ts`, `apps/server/src/jobs/mv-refresh-cron.ts`)**:
   - `upload-worker.ts` lines 179–185:
     ```ts
     await invalidateChoroplethCache();
     await invalidateRegionCache();
     await invalidateFiscalCache();
     await invalidateDefisitwatchCache();
     await invalidateRankfinCache();
     ```
   - `mv-refresh-cron.ts` lines 27–33:
     ```ts
     await invalidateChoroplethCache();
     await invalidateRegionCache();
     await invalidateFiscalCache();
     await invalidateDefisitwatchCache();
     await invalidateRankfinCache();
     ```

6. **Empirical Execution Output**:
   - `pnpm --filter @petakeu/server typecheck`: Exited with code 0 (0 errors).
   - `pnpm --filter @petakeu/server test`: Exited with code 0.
     Passed 5 test files (`redis.test.ts`, `geo-service.test.ts`, `region-service.test.ts`, `upload-worker.test.ts`, `health.test.ts`), 40/40 tests passed.

---

## 2. Logic Chain

1. **From Observation 1**: `loadEnv().choroplethCacheTtl` (default 300) and `loadEnv().regionSummaryCacheTtl` (default 180) read directly from environment variables `CHOROPLETH_CACHE_TTL` and `REGION_SUMMARY_CACHE_TTL`, ensuring TTLs are configurable at runtime rather than hardcoded.
2. **From Observation 2**: Extracting `level` and `parent` query parameters in `geo-controller.ts` and passing them to `buildChoropleth` ensures level and parent filters are forwarded to the PostgreSQL spatial query and incorporated into the Redis cache key.
3. **From Observation 3**: Setting `keyPrefix: 'petakeu:geo'` and `keyPrefix: 'petakeu:regions'` in combination with `buildCacheKey` and `buildRegionSummaryCacheKey` produces normalized, non-duplicated Redis keys (`petakeu:geo:choropleth...` and `petakeu:regions:summary...`). Invalidation calls (`invalidateCacheByPrefix('geo:choropleth')` and `invalidateCacheByPrefix('regions')`) compute patterns `petakeu:geo:choropleth*` and `petakeu:regions*`, matching cached keys correctly.
4. **From Observation 4**: Reordering `JSON.parse` before `cacheHits.inc` in `getCached` guarantees that Prometheus `petakeu_cache_hits_total` increments only when cached data is successfully deserialized.
5. **From Observation 5**: Calling `invalidateRegionCache()` alongside `invalidateChoroplethCache()` in `upload-worker.ts` and `mv-refresh-cron.ts` ensures that region summary caches are purged immediately whenever new payment data is uploaded or materialized views refresh.
6. **From Observation 6**: All 5 Vitest test suites passed without errors, verifying that functions handle cache hits, misses, JSON parse failures, and invalidation calls correctly.

---

## 3. Caveats

- **No caveats**: All implementation aspects were audited empirically, source code was inspected line-by-line, and tests executed cleanly. No bypassing, facades, or hardcoded results were identified.

---

## 4. Conclusion

The Milestone M1 implementation in `@petakeu/server` is authentic, genuine, non-hardcoded, and compliant with Benchmark Mode integrity standards.
Final Verdict: **CLEAN**.

---

## 5. Verification Method

To independently verify this audit:

1. **TypeScript Typecheck**:
   ```bash
   pnpm --filter @petakeu/server typecheck
   ```
   *Expected*: Status 0, 0 TypeScript errors.

2. **Unit Test Suite Execution**:
   ```bash
   pnpm --filter @petakeu/server test
   ```
   *Expected*: Status 0, 5 test suites passed (40 tests passed total).

3. **Source Code Inspection**:
   - Inspect `apps/server/src/config/env.ts`: Confirm `CHOROPLETH_CACHE_TTL` (default 300) and `REGION_SUMMARY_CACHE_TTL` (default 180).
   - Inspect `apps/server/src/controllers/geo-controller.ts`: Confirm `level` and `parent` query parameter parsing.
   - Inspect `apps/server/src/services/geo-service.ts`: Confirm `buildCacheKey` format `choropleth:{period}:{level}:{parent}` and `keyPrefix: 'petakeu:geo'`.
   - Inspect `apps/server/src/services/region-service.ts`: Confirm `buildRegionSummaryCacheKey` format `summary:{regionId}:{from}:{to}` and `keyPrefix: 'petakeu:regions'`.
   - Inspect `apps/server/src/db/redis.ts`: Confirm `JSON.parse` precedes `cacheHits.inc`.
   - Inspect `apps/server/src/jobs/upload-worker.ts` & `mv-refresh-cron.ts`: Confirm `invalidateRegionCache()` called alongside `invalidateChoroplethCache()`.

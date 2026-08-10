# Handoff Report: Milestone 1 Features 3 & 4 (Region Caching & Cache Metrics)

## 1. Observation

### Observation 1: Region Summary Cache Key Format & Prefixing
- **File**: `apps/server/src/services/region-service.ts`
- **Lines 31–36**:
  ```ts
  function buildRegionSummaryCacheKey(regionId: string, range?: { from?: string; to?: string }): string {
    const parts = ['regions', 'summary', regionId];
    if (range?.from) parts.push(`from:${range.from}`);
    if (range?.to) parts.push(`to:${range.to}`);
    return parts.join(':');
  }
  ```
- **Line 181**:
  ```ts
  { ttl: 180, keyPrefix: 'regions' }
  ```
- **File**: `apps/server/src/db/redis.ts` (Line 44):
  ```ts
  const fullKey = `${options.keyPrefix || 'petakeu'}:${key}`;
  ```
- **Direct Output Result**: When `getRegionSummary('3171', { from: '2024-01', to: '2025-08' })` is executed, `key` is `regions:summary:3171:from:2024-01:to:2025-08` and `keyPrefix` is `'regions'`, yielding a Redis key of `regions:regions:summary:3171:from:2024-01:to:2025-08`.

### Observation 2: Missing `REGION_SUMMARY_CACHE_TTL` in Environment Config
- **File**: `apps/server/src/config/env.ts` (Lines 1–14, 16–30)
- `EnvConfig` interface and `loadEnv()` function currently omit `REGION_SUMMARY_CACHE_TTL` / `regionSummaryCacheTtl`. The TTL value `180` is hardcoded on line 181 of `region-service.ts`.

### Observation 3: Redis Metric Counter Increment in `getCached()`
- **File**: `apps/server/src/db/redis.ts` (Lines 48–53):
  ```ts
  try {
    const cached = await client.get(fullKey);
    if (cached !== null) {
      cacheHits.inc({ cache_type: 'redis' });
      return JSON.parse(cached) as T;
    }
  } catch (error) {
    console.warn('[cache] Get failed:', error);
  }
  ```
- **File**: `apps/server/src/utils/metrics.ts` (Lines 53–58):
  ```ts
  export const cacheHits = new Counter({
    name: 'petakeu_cache_hits_total',
    help: 'Total number of cache hits',
    labelNames: ['cache_type'],
    registers: [register]
  });
  ```
- **Observation**: `cacheHits.inc({ cache_type: 'redis' })` increments `petakeu_cache_hits_total`. However, calling `cacheHits.inc` before `JSON.parse(cached)` causes an invalid cache hit counter increment if `JSON.parse` throws a `SyntaxError` on malformed cache data.

---

## 2. Logic Chain

1. **Step 1**: From Observation 1, `buildRegionSummaryCacheKey` includes `'regions'` as the first element of `parts`, producing `regions:summary:...`. When `getCached` combines `keyPrefix: 'regions'` with `key`, `${options.keyPrefix}:${key}` results in `regions:regions:summary:...` (duplicate prefix).
2. **Step 2**: According to `PROJECT.md` (line 56) and `SCOPE.md` (Feature 3), the expected Redis key for region summary is `petakeu:regions:summary:{regionId}:{from}:{to}`. Changing `buildRegionSummaryCacheKey` to start with `['summary', regionId]` and passing `keyPrefix: 'petakeu:regions'` to `getCached()` produces the exact required Redis key structure `petakeu:regions:summary:{regionId}:from:{from}:to:{to}`.
3. **Step 3**: From Observation 2, `region-service.ts` hardcodes TTL `180`. Adding `regionSummaryCacheTtl: Number(process.env.REGION_SUMMARY_CACHE_TTL ?? 180)` to `env.ts` and referencing `loadEnv().regionSummaryCacheTtl` allows environment variable configuration as required by Feature 3.
4. **Step 4**: From Observation 3, `redis.ts` has `cacheHits.inc({ cache_type: 'redis' })` when `cached !== null`. To ensure strict data validity before metric incrementing, reordering `JSON.parse(cached)` before `cacheHits.inc` guarantees `petakeu_cache_hits_total` is incremented only upon successful JSON deserialization.

---

## 3. Caveats

- **Scope boundary**: This report is a read-only investigation. No source files under `apps/server/src/` were directly modified during this step.
- **Concurrent Feature 2 changes**: Feature 2 (being investigated by Explorer M1_1) modifies `env.ts` to add `choroplethCacheTtl`. Implementers should merge `regionSummaryCacheTtl` and `choroplethCacheTtl` cleanly in `env.ts`.

---

## 4. Conclusion

- **Feature 3**:
  1. Modify `buildRegionSummaryCacheKey` in `apps/server/src/services/region-service.ts` to build `summary:{regionId}:{from}:{to}` (omit starting `'regions'`).
  2. Pass `{ ttl: env.regionSummaryCacheTtl, keyPrefix: 'petakeu:regions' }` to `getCached()` in `getRegionSummary()`.
  3. Add `regionSummaryCacheTtl: Number(process.env.REGION_SUMMARY_CACHE_TTL ?? 180)` in `apps/server/src/config/env.ts`.
- **Feature 4**:
  1. In `apps/server/src/db/redis.ts`, reorder `const data = JSON.parse(cached) as T;` before `cacheHits.inc({ cache_type: 'redis' });` inside `getCached()`.

---

## 5. Verification Method

### 1. Manual Inspection of Code References
- Inspect `apps/server/src/services/region-service.ts` lines 31–36 and line 181.
- Inspect `apps/server/src/db/redis.ts` lines 48–53.
- Inspect `apps/server/src/config/env.ts`.

### 2. Unit Testing
- Execute Vitest unit test suite:
  ```bash
  pnpm --filter @petakeu/server test -- --run
  ```
- Verify that `getCached` receives key `summary:{regionId}:from:{from}:to:{to}` with `keyPrefix: 'petakeu:regions'`.

### 3. Metric Verification
- Verify Prometheus metrics endpoint exports `petakeu_cache_hits_total{cache_type="redis"}` after cache hits occur.

# Feature 5 Technical Analysis Report: Explicit Cache Invalidation Hooks

**Author**: `teamwork_preview_explorer_m1_3`  
**Target Feature**: Feature 5 — Add `invalidateRegionCache()` alongside `invalidateChoroplethCache()` in `upload-worker.ts` & `mv-refresh-cron.ts`, and update unit test mocks in `upload-worker.test.ts`.  
**Scope**: Milestone M1 (Redis Caching & Explicit Invalidation)

---

## 1. Executive Summary

Feature 5 ensures that whenever payment upload processing completes (`processUpload` in `upload-worker.ts`) or the materialized view `mv_payments_with_cut` is refreshed on schedule (`startMvRefreshCron` in `mv-refresh-cron.ts`), the cached regional summary data (`petakeu:regions:*`) is invalidated alongside choropleth GeoJSON data (`petakeu:geo:choropleth:*`).

Currently, both `upload-worker.ts` and `mv-refresh-cron.ts` trigger `invalidateChoroplethCache()`, `invalidateFiscalCache()`, `invalidateDefisitwatchCache()`, and `invalidateRankfinCache()`, but completely omit `invalidateRegionCache()`. Consequently, region summary responses (`GET /api/v1/regions/:id/summary`) remain stale in Redis until TTL expiration (180 seconds). Adding `invalidateRegionCache()` and updating unit test mocks in `upload-worker.test.ts` completes explicit cache invalidation across all dependent modules.

---

## 2. Source Analysis & Evidence Chain

### 2.1 `apps/server/src/jobs/upload-worker.ts`

- **Location**: `apps/server/src/jobs/upload-worker.ts`, lines 5-8 & lines 178-183.
- **Current Imports**:
  ```typescript
  import { invalidateChoroplethCache } from '../services/geo-service';
  import { invalidateFiscalCache } from '../services/fiscal-service';
  import { invalidateDefisitwatchCache } from '../services/defisitwatch-service';
  import { invalidateRankfinCache } from '../services/rankfin-service';
  ```
- **Current Processing Logic** (`processUpload`, lines 178-183):
  ```typescript
  // Invalidate caches after successful data update
  await invalidateChoroplethCache();
  await invalidateFiscalCache();
  await invalidateDefisitwatchCache();
  await invalidateRankfinCache();
  ```
- **Observation**: `invalidateRegionCache` from `../services/region-service` is missing.
- **Impact**: Payment updates written to `payments` table and reflected in `mv_payments_with_cut` do not clear cached region summary statistics in Redis.

### 2.2 `apps/server/src/jobs/mv-refresh-cron.ts`

- **Location**: `apps/server/src/jobs/mv-refresh-cron.ts`, lines 4-7 & lines 20-25.
- **Current Imports**:
  ```typescript
  import { invalidateChoroplethCache } from '../services/geo-service';
  import { invalidateFiscalCache } from '../services/fiscal-service';
  import { invalidateDefisitwatchCache } from '../services/defisitwatch-service';
  import { invalidateRankfinCache } from '../services/rankfin-service';
  ```
- **Current Cron Callback Logic** (`startMvRefreshCron`, lines 20-25):
  ```typescript
  // Invalidate caches after MV refresh
  await invalidateChoroplethCache();
  await invalidateFiscalCache();
  await invalidateDefisitwatchCache();
  await invalidateRankfinCache();
  ```
- **Observation**: `invalidateRegionCache` from `../services/region-service` is missing.
- **Impact**: 15-minute background refresh of `mv_payments_with_cut` leaves cached region summaries in Redis stale.

### 2.3 `apps/server/src/jobs/upload-worker.test.ts`

- **Location**: `apps/server/src/jobs/upload-worker.test.ts`, lines 17-31.
- **Current Mocks**:
  ```typescript
  vi.mock('../services/geo-service', () => ({
    invalidateChoroplethCache: vi.fn().mockResolvedValue(undefined),
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
  ```
- **Observation**: `../services/region-service` is not mocked.
- **Impact**: Calling `processUpload` in unit tests will attempt to execute real `invalidateRegionCache()`, which attempts to contact Redis via `redisClient.keys('petakeu:regions:*')` causing test failures or unhandled promise rejections in non-Redis test environments.

### 2.4 `apps/server/src/services/region-service.ts`

- **Location**: `apps/server/src/services/region-service.ts`, lines 185-188.
- **Existing Implementation**:
  ```typescript
  export async function invalidateRegionCache(): Promise<void> {
    await invalidateCacheByPrefix('regions');
    logger.info('Region cache invalidated');
  }
  ```
- **Verification**: `invalidateRegionCache` is already defined and exported. It calls `invalidateCacheByPrefix('regions')`, which purges all Redis keys matching prefix `petakeu:regions:*` (including `summary:*` and `list:*`).

---

## 3. Proposed Code Changes

### 3.1 `apps/server/src/jobs/upload-worker.ts`

```diff
--- a/apps/server/src/jobs/upload-worker.ts
+++ b/apps/server/src/jobs/upload-worker.ts
@@ -5,2 +5,3 @@
 import { invalidateChoroplethCache } from '../services/geo-service';
+import { invalidateRegionCache } from '../services/region-service';
 import { invalidateFiscalCache } from '../services/fiscal-service';
@@ -179,2 +180,3 @@
       // Invalidate caches after successful data update
+      await invalidateRegionCache();
       await invalidateChoroplethCache();
```

### 3.2 `apps/server/src/jobs/mv-refresh-cron.ts`

```diff
--- a/apps/server/src/jobs/mv-refresh-cron.ts
+++ b/apps/server/src/jobs/mv-refresh-cron.ts
@@ -4,2 +4,3 @@
 import { invalidateChoroplethCache } from '../services/geo-service';
+import { invalidateRegionCache } from '../services/region-service';
 import { invalidateFiscalCache } from '../services/fiscal-service';
@@ -21,2 +22,3 @@
       // Invalidate caches after MV refresh
+      await invalidateRegionCache();
       await invalidateChoroplethCache();
```

### 3.3 `apps/server/src/jobs/upload-worker.test.ts`

```diff
--- a/apps/server/src/jobs/upload-worker.test.ts
+++ b/apps/server/src/jobs/upload-worker.test.ts
@@ -17,2 +17,6 @@
+vi.mock('../services/region-service', () => ({
+  invalidateRegionCache: vi.fn().mockResolvedValue(undefined),
+}));
+
 vi.mock('../services/geo-service', () => ({
   invalidateChoroplethCache: vi.fn().mockResolvedValue(undefined),
 }));
```

Optionally, add explicit assertion in `upload-worker.test.ts`:
```typescript
import { invalidateRegionCache } from '../services/region-service';

// Inside processUpload test case:
expect(invalidateRegionCache).toHaveBeenCalled();
```

---

## 4. Logic Chain & Reasoning

1. **Premise 1**: Region summary endpoints (`/api/v1/regions/:id/summary`) cache data in Redis under key prefix `petakeu:regions:summary:*`.
2. **Premise 2**: Payment uploads (`upload-worker.ts`) and materialized view refreshes (`mv-refresh-cron.ts`) alter the underlying dataset (`payments` table and `mv_payments_with_cut`).
3. **Premise 3**: To avoid serving stale regional summaries after data updates, cache keys under `petakeu:regions:*` must be cleared.
4. **Step 1**: `region-service.ts` provides `invalidateRegionCache()`, which invokes `invalidateCacheByPrefix('regions')`.
5. **Step 2**: Importing and calling `invalidateRegionCache()` in `upload-worker.ts` (post payment upsert) and `mv-refresh-cron.ts` (post MV refresh) ensures region cache is cleared immediately alongside choropleth and fiscal caches.
6. **Step 3**: Unit test suite `upload-worker.test.ts` executes `processUpload()` with Vitest mocks. Mocking `'../services/region-service'` prevents real Redis calls and allows asserting cache invalidation invocation.

---

## 5. Caveats & Risk Analysis

- **Redis Availability**: `invalidateRegionCache()` relies on Redis `keys` / `del` via `invalidateCacheByPrefix`. If Redis connection fails, error logging occurs as configured in `redis.ts`.
- **Mock Isolation**: Vitest mocks must be placed before test executions to ensure `processUpload()` uses the mocked implementation.
- **Performance Impact**: Negligible. Cache invalidation runs async after database transaction completion.

---

## 6. Verification Plan

1. **Unit Test Execution**:
   Run `pnpm --filter @petakeu/server test` or `npx vitest run apps/server/src/jobs/upload-worker.test.ts`.
2. **Mock Invocations**:
   Verify all unit tests pass cleanly without Redis network errors.
3. **Code Inspection**:
   Confirm `invalidateRegionCache` is imported and called in both `upload-worker.ts` and `mv-refresh-cron.ts`.

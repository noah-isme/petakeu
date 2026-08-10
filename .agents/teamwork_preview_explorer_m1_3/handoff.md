# Handoff Report — Feature 5 (Cache Invalidation Hooks)

## 1. Observation

- **`apps/server/src/jobs/upload-worker.ts`**:
  - Line 5: `import { invalidateChoroplethCache } from '../services/geo-service';`
  - Lines 179-182:
    ```typescript
    await invalidateChoroplethCache();
    await invalidateFiscalCache();
    await invalidateDefisitwatchCache();
    await invalidateRankfinCache();
    ```
  - Direct Observation: `invalidateRegionCache` is missing from both imports and execution sequence after payment upload processing.

- **`apps/server/src/jobs/mv-refresh-cron.ts`**:
  - Line 4: `import { invalidateChoroplethCache } from '../services/geo-service';`
  - Lines 21-24:
    ```typescript
    await invalidateChoroplethCache();
    await invalidateFiscalCache();
    await invalidateDefisitwatchCache();
    await invalidateRankfinCache();
    ```
  - Direct Observation: `invalidateRegionCache` is missing from both imports and execution sequence after materialized view refresh.

- **`apps/server/src/jobs/upload-worker.test.ts`**:
  - Lines 17-31: Mocks `geo-service`, `fiscal-service`, `defisitwatch-service`, and `rankfin-service`.
  - Direct Observation: `'../services/region-service'` is NOT mocked. Adding `invalidateRegionCache()` in `upload-worker.ts` without mocking `'../services/region-service'` would cause `processUpload()` unit tests to invoke the unmocked Redis client in `region-service.ts`.

- **`apps/server/src/services/region-service.ts`**:
  - Lines 185-188:
    ```typescript
    export async function invalidateRegionCache(): Promise<void> {
      await invalidateCacheByPrefix('regions');
      logger.info('Region cache invalidated');
    }
    ```
  - Direct Observation: `invalidateRegionCache` already exists, is exported, and purges Redis keys matching `petakeu:regions:*`.

---

## 2. Logic Chain

1. **Step 1 (from Observation 1 & 2)**: Payment processing (`upload-worker.ts`) and scheduled materialized view refresh (`mv-refresh-cron.ts`) alter payment data in Postgres.
2. **Step 2 (from Observation 4)**: Cached region summaries (`GET /api/v1/regions/:id/summary`) use Redis key prefix `petakeu:regions:summary:*` and are invalidated by `invalidateRegionCache()`.
3. **Step 3 (from Observation 1 & 2)**: Neither `upload-worker.ts` nor `mv-refresh-cron.ts` currently call `invalidateRegionCache()`, leaving cached region summary data stale until TTL (180s/600s) expires.
4. **Step 4 (from Observation 1 & 2)**: Importing `invalidateRegionCache` from `'../services/region-service'` and invoking `await invalidateRegionCache();` alongside `await invalidateChoroplethCache();` ensures cache consistency across region endpoints.
5. **Step 5 (from Observation 3)**: Adding `invalidateRegionCache()` to `upload-worker.ts` requires mocking `'../services/region-service'` in `upload-worker.test.ts` with `invalidateRegionCache: vi.fn().mockResolvedValue(undefined)` to prevent unit tests from making real Redis connection calls.

---

## 3. Caveats

- **Scope Limit**: Read-only investigation as instructed; code modifications must be applied by an implementation task/agent.
- **Assumptions**: Redis key prefix convention `petakeu:regions:*` in `region-service.ts` correctly covers all cached region responses.

---

## 4. Conclusion

Feature 5 analysis is complete. To complete Feature 5 implementation:
1. Update `apps/server/src/jobs/upload-worker.ts`:
   - Import `invalidateRegionCache` from `'../services/region-service'`.
   - Call `await invalidateRegionCache();` alongside `invalidateChoroplethCache();` in `processUpload()`.
2. Update `apps/server/src/jobs/mv-refresh-cron.ts`:
   - Import `invalidateRegionCache` from `'../services/region-service'`.
   - Call `await invalidateRegionCache();` alongside `invalidateChoroplethCache();` in `startMvRefreshCron()`.
3. Update `apps/server/src/jobs/upload-worker.test.ts`:
   - Add `vi.mock('../services/region-service', () => ({ invalidateRegionCache: vi.fn().mockResolvedValue(undefined) }));`.

Full diff specifications and line numbers are documented in `/home/noah/project/petakeu/.agents/teamwork_preview_explorer_m1_3/analysis.md`.

---

## 5. Verification Method

1. Inspect `apps/server/src/jobs/upload-worker.ts` and `apps/server/src/jobs/mv-refresh-cron.ts` to ensure `invalidateRegionCache` is imported and called after payment processing and MV refresh respectively.
2. Inspect `apps/server/src/jobs/upload-worker.test.ts` to ensure `'../services/region-service'` is mocked.
3. Run `pnpm --filter @petakeu/server test` (or `npx vitest run apps/server/src/jobs/upload-worker.test.ts`) to verify all unit tests pass cleanly.

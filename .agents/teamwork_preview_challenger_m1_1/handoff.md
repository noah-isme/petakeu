# Empirical Challenge & Verification Handoff Report — Milestone M1

**Author**: teamwork_preview_challenger_m1_1  
**Date**: 2026-08-11  
**Milestone**: M1 (Redis Caching & Explicit Invalidation)  
**Verdict**: **`APPROVE`**

---

## 1. Observation

1. **Empirical Test Suite Execution Results**:
   - Executed 26 independent empirical verification tests across two custom test suites in Vitest:
     - `m1_empirical_verifier.test.ts`: 21 tests passed (0 failures).
     - `m1_stress_and_controller.test.ts`: 5 tests passed (0 failures).
   - Executed project type check:
     - `pnpm --filter @petakeu/server typecheck`: Exited with code 0 (0 errors).
   - Executed full project test suite:
     - `pnpm --filter @petakeu/server test`: Exited with code 0 (5 test files, 40 tests passed).

2. **Cache Key Generation Handling**:
   - `geoService.buildChoropleth(period, options)`:
     - Default options (`period='2025-08'`): key is `choropleth:2025-08`, Redis full key is `petakeu:geo:choropleth:2025-08`.
     - With `level=2`: key is `choropleth:2025-08:2`, Redis full key is `petakeu:geo:choropleth:2025-08:2`.
     - With `parent='3100'`: key is `choropleth:2025-08:3100`, Redis full key is `petakeu:geo:choropleth:2025-08:3100`.
     - With `level=2, parent='3100'`: key is `choropleth:2025-08:2:3100`, Redis full key is `petakeu:geo:choropleth:2025-08:2:3100`.
     - With `publicMode=true`: suffix `:public` is appended correctly (`petakeu:geo:choropleth:2025-08:2:3100:public`).
     - Handled `undefined` level/parent without creating invalid key fragments or trailing colons.
   - `regionService.getRegionSummary(regionId, range)`:
     - Default range (`regionId='3171'`): key is `summary:3171`, Redis full key is `petakeu:regions:summary:3171`.
     - With `from='2024-01', to='2025-08'`: key is `summary:3171:from:2024-01:to:2025-08`, Redis full key is `petakeu:regions:summary:3171:from:2024-01:to:2025-08`.
     - Handled `from` only and `to` only parameter combinations cleanly.

3. **Key Prefix Matching & Invalidation**:
   - `invalidateChoroplethCache()` in `geo-service.ts` invokes `invalidateCacheByPrefix('geo:choropleth')`.
     - Pattern built in `redis.ts`: `petakeu:geo:choropleth*`.
     - Empirically matched and deleted all generated choropleth variants (`petakeu:geo:choropleth:2025-08`, `petakeu:geo:choropleth:2025-08:2:3100:public`).
   - `invalidateRegionCache()` in `region-service.ts` invokes `invalidateCacheByPrefix('regions')`.
     - Pattern built in `redis.ts`: `petakeu:regions*`.
     - Empirically matched and deleted all generated region summary variants (`petakeu:regions:summary:3171:from:2024-01:to:2025-08`).
   - `upload-worker.ts` and `mv-refresh-cron.ts` both invoke `await invalidateChoroplethCache()` and `await invalidateRegionCache()` on data updates.

4. **Cache Hit Metric Counter Guarding (`petakeu_cache_hits_total`)**:
   - `getCached` in `apps/server/src/db/redis.ts` evaluates `JSON.parse(cached)` inside a `try` block *before* triggering `cacheHits.inc({ cache_type: 'redis' })`.
   - Empirically tested with corrupted JSON strings (`{invalid-json`), empty strings (`""`), string `"undefined"`, and Redis connection exceptions:
     - In all failure scenarios, `cacheHits.inc` was **NOT** invoked.
     - `cacheMisses.inc` was invoked, and the fallback database fetcher was executed successfully.

5. **TTL Configuration & Concurrency Stress**:
   - `choroplethCacheTtl` default is 300s (overridable via `CHOROPLETH_CACHE_TTL`).
   - `regionSummaryCacheTtl` default is 180s (overridable via `REGION_SUMMARY_CACHE_TTL`).
   - Under 100 parallel concurrent `getCached` calls, no race conditions or unhandled rejections occurred.

---

## 2. Logic Chain

1. **From Observation 1 & 2**: Standardized key generation in `geo-service.ts` (`choropleth:{period}:{level}:{parent}`) and `region-service.ts` (`summary:{regionId}:{from}:{to}`) produces deterministic, collision-free key structures under all parameter combinations (including `undefined` values and optional flags).
2. **From Observation 3**: The key prefixes (`petakeu:geo` and `petakeu:regions`) directly match the glob patterns evaluated by `invalidateCacheByPrefix` (`petakeu:geo:choropleth*` and `petakeu:regions*`). Calling both invalidation functions in `upload-worker.ts` and `mv-refresh-cron.ts` ensures cache freshness after any payment ingestion or materialized view refresh.
3. **From Observation 4**: Guarding `cacheHits.inc` behind a successful `JSON.parse(cached)` call eliminates false positive metric increments on corrupted or unparseable Redis cache entries.
4. **From Observation 5**: High-concurrency empirical testing confirms stability under load, and configurable TTLs allow environment-specific cache retention policy management.

---

## 3. Caveats

- **Existing Stale Cache Keys**: Keys created prior to prefix standardization will remain in Redis until their TTL expires (default 300s/180s) or until Redis memory eviction, as invalidation patterns now target `petakeu:geo:choropleth*` and `petakeu:regions*`.
- No caveats affecting code correctness, stability, or specification compliance.

---

## 4. Conclusion & Evaluation Report

### Challenge Summary

- **Overall Risk Assessment**: **`LOW`**
- **Verdict**: **`APPROVE`**

### Stress Test Results Summary

| Scenario | Target Component | Expected Behavior | Actual Behavior | Pass / Fail |
|---|---|---|---|---|
| Default choropleth key (`period="2025-08"`) | `geoService.buildChoropleth` | Redis key `petakeu:geo:choropleth:2025-08` | Key matches expected format | **PASS** |
| Level & parent choropleth key (`level=2, parent="3100"`) | `geoService.buildChoropleth` | Redis key `petakeu:geo:choropleth:2025-08:2:3100` | Key matches expected format | **PASS** |
| Public mode choropleth key (`publicMode=true`) | `geoService.buildChoropleth` | Appends `:public` to Redis key | Key matches expected format | **PASS** |
| Region summary key with range (`from="2024-01", to="2025-08"`) | `regionService.getRegionSummary` | Redis key `petakeu:regions:summary:3171:from:2024-01:to:2025-08` | Key matches expected format | **PASS** |
| Invalidate choropleth cache | `invalidateChoroplethCache` | Purges pattern `petakeu:geo:choropleth*` | Matches and deletes all variants | **PASS** |
| Invalidate region summary cache | `invalidateRegionCache` | Purges pattern `petakeu:regions*` | Matches and deletes all variants | **PASS** |
| Cache hit on valid JSON | `getCached` | Increments `cacheHits` metric, returns object, skips fetcher | `cacheHits.inc` called, fetcher skipped | **PASS** |
| Cache hit on corrupt JSON string | `getCached` | Does NOT increment `cacheHits`, falls back to fetcher | `cacheHits.inc` skipped, fetcher invoked | **PASS** |
| Cache hit on empty/undefined string | `getCached` | Does NOT increment `cacheHits`, falls back to fetcher | `cacheHits.inc` skipped, fetcher invoked | **PASS** |
| Redis connection failure on get | `getCached` | Does NOT crash, falls back to fetcher | Handled gracefully, returns data | **PASS** |
| Redis setEx failure on cache update | `getCached` | Does NOT crash caller, returns fetched data | Handled gracefully, returns data | **PASS** |
| 100 concurrent parallel cache requests | `getCached` | Concurrent resolution without race conditions | 100/100 resolved successfully | **PASS** |

The implementation supplied by `teamwork_preview_worker_m1_1` satisfies all requirements and acceptance criteria in M1 SCOPE.md and PROJECT.md.

---

## 5. Verification Method

To independently verify this evaluation:

1. **Run Empirical Verification Test Suites**:
   ```bash
   pnpm --filter @petakeu/server test
   npx vitest run .agents/teamwork_preview_challenger_m1_1/m1_empirical_verifier.test.ts
   npx vitest run .agents/teamwork_preview_challenger_m1_1/m1_stress_and_controller.test.ts
   ```
   *Expected*: All test suites pass with status 0 (0 errors).

2. **Run TypeScript Check**:
   ```bash
   pnpm --filter @petakeu/server typecheck
   ```
   *Expected*: Status code 0 (0 errors).

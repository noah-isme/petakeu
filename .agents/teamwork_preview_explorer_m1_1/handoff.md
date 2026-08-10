# Handoff Report: Choropleth Query Parameters Wiring & Redis Caching Standardization (Features 1 & 2)

**Author**: teamwork_preview_explorer_m1_1  
**Date**: 2026-08-11  
**Target Scope**: Milestone M1 — Features 1 & 2  

---

## 1. Observation

1. **`apps/server/src/controllers/geo-controller.ts` (Lines 6–11)**:
   ```typescript
   const getChoropleth = asyncHandler(async (req: Request, res: Response) => {
     const period = (req.query.period as string) ?? "2025-08";
     const publicMode = req.query.public === "1" || req.query.public === "true";
     const payload = await geoService.buildChoropleth(period, { publicMode });
     res.json(payload);
   });
   ```
   `req.query.level` and `req.query.parent` are neither extracted nor passed to `geoService.buildChoropleth`.

2. **`apps/server/src/services/geo-service.ts` (Lines 47–53, 178)**:
   ```typescript
   function buildCacheKey(period: string, options: { publicMode?: boolean; level?: number; parent?: string } = {}): string {
     const parts = ['choropleth', period];
     if (options.publicMode) parts.push('public');
     if (options.level) parts.push(`level${options.level}`);
     if (options.parent) parts.push(`parent${options.parent}`);
     return parts.join(':');
   }
   ...
   return getCached<ChoroplethResponse>(
     cacheKey,
     async () => { ... },
     { ttl: 300, keyPrefix: 'geo' }
   );
   ```
   Cache key format is `choropleth:{period}[:public][:level{level}][:parent{parent}]`, TTL is hardcoded to 300s, and `keyPrefix` is `'geo'`.

3. **`apps/server/src/db/redis.ts` (Lines 44 & 71)**:
   ```typescript
   const fullKey = `${options.keyPrefix || 'petakeu'}:${key}`;
   ...
   const fullPattern = `petakeu:${pattern}*`;
   ```
   With `keyPrefix: 'geo'`, `fullKey` evaluates to `geo:choropleth:...`.
   However, `invalidateCacheByPrefix('geo:choropleth')` in `geo-service.ts` (line 186) constructs `fullPattern` as `petakeu:geo:choropleth*`.
   Because `geo:choropleth:...` does not match `petakeu:geo:choropleth*`, cache invalidation silently fails to purge cached items.

4. **`apps/server/src/config/env.ts` (Lines 1–30)**:
   Does not export or load `CHOROPLETH_CACHE_TTL` (env variable for choropleth TTL).

---

## 2. Logic Chain

1. **From Observation 1**: Because `geoController.getChoropleth` does not parse `req.query.level` or `req.query.parent`, incoming HTTP GET requests for sub-region choropleths (e.g. `GET /api/v1/geo/choropleth?level=2&parent=<uuid>`) return un-filtered choropleths instead of region-filtered data.
   - *Fix*: Extract `req.query.level` and `req.query.parent`, convert types safely (`Number` and `String`), and include them in the `options` object passed to `geoService.buildChoropleth(period, { publicMode, level, parent })`.

2. **From Observation 2 & 3**:
   - The contract mandates key format `choropleth:{period}:{level}:{parent}` (prefixed with `petakeu:geo:` via `redis.ts`).
   - The key prefix discrepancy between `getCached({ keyPrefix: 'geo' })` (producing `geo:choropleth:...`) and `invalidateCacheByPrefix('geo:choropleth')` (searching `petakeu:geo:choropleth*`) causes cache invalidation to miss all cached choropleth entries.
   - *Fix*: Update `buildCacheKey` in `geo-service.ts` to construct `choropleth:{period}:{level}:{parent}` (with `:public` tag if `publicMode` is true), and change `keyPrefix` in `getCached` call to `'petakeu:geo'`.

3. **From Observation 4**:
   - The system needs a configurable TTL for choropleth data.
   - *Fix*: Add `CHOROPLETH_CACHE_TTL` (default 300) to `env.ts` (`EnvConfig` interface and `loadEnv()` function) and use `env.choroplethCacheTtl` in `geo-service.ts`.

---

## 3. Caveats

- **Existing cached keys**: Standardizing Redis key formatting will invalidate any existing stale keys under the old format (`geo:choropleth:...`), which will naturally expire or be overwritten upon deployment.
- **Other Milestone Features**: Features 3, 4, and 5 deal with region summary caching, Prometheus cache hits metric incrementing in `redis.ts`, and explicit invalidation hooks in `upload-worker.ts` & `mv-refresh-cron.ts`. Those features are assigned to parallel explorer tasks (`teamwork_preview_explorer_m1_2` and `teamwork_preview_explorer_m1_3`).

---

## 4. Conclusion

Features 1 & 2 require localized modifications across 3 files:
1. `apps/server/src/controllers/geo-controller.ts`: Parse `req.query.level` and `req.query.parent` and forward them to `geoService.buildChoropleth`.
2. `apps/server/src/config/env.ts`: Add `choroplethCacheTtl: Number(process.env.CHOROPLETH_CACHE_TTL ?? 300)`.
3. `apps/server/src/services/geo-service.ts`: Update `buildCacheKey` to `choropleth:{period}:{level}:{parent}`, update `getCached` options to `{ ttl: env.choroplethCacheTtl, keyPrefix: 'petakeu:geo' }`.

---

## 5. Verification Method

1. **Full Analysis Report**: Inspect `/home/noah/project/petakeu/.agents/teamwork_preview_explorer_m1_1/analysis.md`.
2. **Code Inspection**:
   - Verify `req.query.level` and `req.query.parent` in `apps/server/src/controllers/geo-controller.ts`.
   - Verify `choroplethCacheTtl` in `apps/server/src/config/env.ts`.
   - Verify `buildCacheKey` and `getCached` in `apps/server/src/services/geo-service.ts`.
3. **Automated Tests**:
   - Run `pnpm --filter @petakeu/server test` to run Vitest unit and integration test suite.

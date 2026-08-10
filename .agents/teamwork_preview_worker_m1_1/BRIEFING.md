# BRIEFING — 2026-08-11T01:42:50Z

## Mission
Implement Milestone M1: Redis Caching & Invalidation for @petakeu/server.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: /home/noah/project/petakeu/.agents/teamwork_preview_worker_m1_1
- Original parent: 1e7e7b75-720d-4f33-ba82-d56f812c5213
- Milestone: M1: Redis Caching & Explicit Invalidation

## 🔒 Key Constraints
- File ownership:
  - apps/server/src/config/env.ts
  - apps/server/src/controllers/geo-controller.ts
  - apps/server/src/services/geo-service.ts
  - apps/server/src/services/region-service.ts
  - apps/server/src/db/redis.ts
  - apps/server/src/jobs/upload-worker.ts
  - apps/server/src/jobs/mv-refresh-cron.ts
  - apps/server/src/jobs/upload-worker.test.ts
- Verification requirements:
  - pnpm --filter @petakeu/server test
  - pnpm --filter @petakeu/server typecheck
  - Report outputs in handoff.md and send message to parent.

## Current Parent
- Conversation ID: 1e7e7b75-720d-4f33-ba82-d56f812c5213
- Updated: 2026-08-11T01:42:50Z

## Task Summary
- **What to build**: 
  1. Add `choroplethCacheTtl` and `regionSummaryCacheTtl` to `env.ts`.
  2. Parse `level` and `parent` in `geo-controller.ts` and pass to `buildChoropleth`.
  3. Standardize choropleth cache key format and prefix (`petakeu:geo:choropleth:{period}:{level}:{parent}`) in `geo-service.ts`.
  4. Fix duplicate prefixing for region summary cache key (`petakeu:regions:summary:{regionId}:{from}:{to}`) in `region-service.ts`.
  5. Increment `cacheHits.inc` only after successful `JSON.parse` in `redis.ts`.
  6. Add `invalidateRegionCache()` in `upload-worker.ts` and `mv-refresh-cron.ts`, update mocks in `upload-worker.test.ts`.
- **Success criteria**: All tests pass (5 test files, 40 tests), typecheck passes, cache keys match contracts, metric increment on valid parse, cache invalidation covers region summaries.
- **Interface contracts**: PROJECT.md & SCOPE.md.

## Change Tracker
- **Files modified**:
  - `apps/server/src/config/env.ts` — Added `CHOROPLETH_CACHE_TTL` (300) and `REGION_SUMMARY_CACHE_TTL` (180) env exports.
  - `apps/server/src/controllers/geo-controller.ts` — Wired `req.query.level` and `req.query.parent` query params.
  - `apps/server/src/services/geo-service.ts` — Formatted key to `choropleth:{period}:{level}:{parent}` with prefix `petakeu:geo` and TTL `loadEnv().choroplethCacheTtl`.
  - `apps/server/src/services/region-service.ts` — Fixed key format to `summary:{regionId}:{from}:{to}` with prefix `petakeu:regions` and TTL `loadEnv().regionSummaryCacheTtl`.
  - `apps/server/src/db/redis.ts` — Moved `cacheHits.inc({ cache_type: 'redis' })` after successful `JSON.parse(cached)`.
  - `apps/server/src/jobs/upload-worker.ts` — Added `invalidateRegionCache()` call after payment upload processing.
  - `apps/server/src/jobs/mv-refresh-cron.ts` — Added `invalidateRegionCache()` call after materialized view refresh.
  - `apps/server/src/jobs/upload-worker.test.ts` — Mocked `invalidateRegionCache` from `../services/region-service`.
  - `apps/server/src/services/geo-service.test.ts` — Added Vitest mocks for DB and Redis.
  - `apps/server/src/services/region-service.test.ts` — Added Vitest tests for region summary keying & invalidation.
  - `apps/server/src/db/redis.test.ts` — Added Vitest tests for `getCached` metric increments.
- **Build status**: PASS (`pnpm --filter @petakeu/server test` -> 5 test files, 40 tests passed; `typecheck` -> 0 errors)
- **Pending issues**: None

## Quality Status
- **Build/test result**: PASS (5 passed, 40 passed)
- **Lint/Typecheck status**: 0 violations / 0 errors
- **Tests added/modified**: `geo-service.test.ts`, `upload-worker.test.ts`, `region-service.test.ts`, `redis.test.ts`

## Loaded Skills
- None

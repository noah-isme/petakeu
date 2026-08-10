## 2026-08-10T18:26:06Z
You are teamwork_preview_worker_m1_1.
Your working directory is: /home/noah/project/petakeu/.agents/teamwork_preview_worker_m1_1

MANDATORY READ:
- Original Request: /home/noah/project/petakeu/.agents/ORIGINAL_REQUEST.md
- Global Project Architecture: /home/noah/project/petakeu/PROJECT.md
- Milestone Scope: /home/noah/project/petakeu/.agents/teamwork_preview_suborch_m1/SCOPE.md
- Explorer 1 Handoff: /home/noah/project/petakeu/.agents/teamwork_preview_explorer_m1_1/handoff.md
- Explorer 2 Handoff: /home/noah/project/petakeu/.agents/teamwork_preview_explorer_m1_2/handoff.md
- Explorer 3 Handoff: /home/noah/project/petakeu/.agents/teamwork_preview_explorer_m1_3/handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File Ownership:
- apps/server/src/config/env.ts
- apps/server/src/controllers/geo-controller.ts
- apps/server/src/services/geo-service.ts
- apps/server/src/services/region-service.ts
- apps/server/src/db/redis.ts
- apps/server/src/jobs/upload-worker.ts
- apps/server/src/jobs/mv-refresh-cron.ts
- apps/server/src/jobs/upload-worker.test.ts

Tasks:
1. `env.ts`: Add `CHOROPLETH_CACHE_TTL` (default 300) and `REGION_SUMMARY_CACHE_TTL` (default 180) exports/config.
2. `geo-controller.ts`: Wire `req.query.level` (number) and `req.query.parent` (string) in `getChoropleth` and pass them to `geoService.buildChoropleth(period, options)`.
3. `geo-service.ts`: Standardize key format to `choropleth:{period}:{level}:{parent}` (or `choropleth:{period}:{level}:{parent}:public`), prefix with `petakeu:geo:`, and use `env.choroplethCacheTtl`.
4. `region-service.ts`: Fix duplicate key prefixing to build key `summary:{regionId}:{from}:{to}` prefixed with `petakeu:regions:`, and use `env.regionSummaryCacheTtl`.
5. `redis.ts`: Ensure `petakeu_cache_hits_total` (`cacheHits.inc`) is incremented on Redis cache hit (after successful `JSON.parse`).
6. `upload-worker.ts` & `mv-refresh-cron.ts`: Call `invalidateRegionCache()` alongside `invalidateChoroplethCache()`. Update unit test mocks in `upload-worker.test.ts`.

Verification requirements:
- Run `pnpm --filter @petakeu/server test` and `pnpm --filter @petakeu/server typecheck`.
- Report build and test outputs in `/home/noah/project/petakeu/.agents/teamwork_preview_worker_m1_1/handoff.md`. Send a message when complete.

## 2026-08-10T18:40:20Z
Context: System restart recovery for Milestone M1 Worker.
Content: The system was restarted. Please resume your assigned tasks for Milestone M1:
1. `env.ts`: Add `CHOROPLETH_CACHE_TTL` (default 300) and `REGION_SUMMARY_CACHE_TTL` (default 180).
2. `geo-controller.ts`: Wire `req.query.level` and `req.query.parent` in `getChoropleth`.
3. `geo-service.ts`: Format cache key `choropleth:{period}:{level}:{parent}`, prefix with `petakeu:geo:`, and use `env.choroplethCacheTtl`.
4. `region-service.ts`: Fix duplicate key prefixing to `summary:{regionId}:{from}:{to}` prefixed with `petakeu:regions:`, and use `env.regionSummaryCacheTtl`.
5. `redis.ts`: Increment `cacheHits` counter (`petakeu_cache_hits_total`) on Redis hit after `JSON.parse`.
6. `upload-worker.ts` & `mv-refresh-cron.ts`: Call `invalidateRegionCache()` alongside `invalidateChoroplethCache()`. Update mocks in `upload-worker.test.ts`.
7. Run `pnpm --filter @petakeu/server test` and `pnpm --filter @petakeu/server typecheck`.
8. Write `/home/noah/project/petakeu/.agents/teamwork_preview_worker_m1_1/handoff.md`.


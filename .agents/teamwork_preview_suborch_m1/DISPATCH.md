## 2026-08-10T18:21:42Z

You are teamwork_preview_suborch_m1.
Your working directory is: /home/noah/project/petakeu/.agents/teamwork_preview_suborch_m1

MANDATORY READ:
- Original Request: /home/noah/project/petakeu/.agents/ORIGINAL_REQUEST.md
- Global Project Architecture: /home/noah/project/petakeu/PROJECT.md

Scope: Milestone M1 — Redis Caching & Explicit Invalidation for Choropleth GeoJSON and Region Summaries.

Features in scope:
1. Choropleth Query Parameters: Wire `req.query.level` and `req.query.parent` in `geoController.getChoropleth` (`apps/server/src/controllers/geo-controller.ts`). Pass them to `geoService.buildChoropleth(period, options)`.
2. Choropleth Cache Key & Configurable TTL: Standardize key format in `geo-service.ts` to `choropleth:{period}:{level}:{parent}` (prefixed with `petakeu:geo:` via `redis.ts`), add `CHOROPLETH_CACHE_TTL` (default 300) in `apps/server/src/config/env.ts`.
3. Region Summary Cache Key & Configurable TTL: Fix duplicate key prefixing in `region-service.ts` to build key `summary:{regionId}:{from}:{to}` (prefixed with `petakeu:regions:`), add `REGION_SUMMARY_CACHE_TTL` (default 180) in `apps/server/src/config/env.ts`.
4. Cache Hits Metric Logging: Ensure `petakeu_cache_hits_total` (`cacheHits` counter) is incremented on Redis cache hit in `apps/server/src/db/redis.ts`.
5. Explicit Cache Invalidation Hooks: Add `invalidateRegionCache()` alongside `invalidateChoroplethCache()` in `apps/server/src/jobs/upload-worker.ts` (after payment processing) and `apps/server/src/jobs/mv-refresh-cron.ts` (after MV refresh). Update unit test mocks in `upload-worker.test.ts`.

Instructions:
1. Create `SCOPE.md` in `/home/noah/project/petakeu/.agents/teamwork_preview_suborch_m1/SCOPE.md`.
2. Create `BRIEFING.md` and `progress.md` in your working directory.
3. Run the Iteration Loop (Explorer -> Worker -> Reviewer -> Challenger -> Auditor -> Gate).
   - Spawn Explorers (3) to plan code changes.
   - Spawn Worker (1) to implement changes and run `pnpm --filter @petakeu/server test` and `pnpm --filter @petakeu/server typecheck`.
   - Spawn Reviewers (2) to review code quality and interface compliance.
   - Spawn Challengers (2) to test edge cases.
   - Spawn Forensic Auditor (`teamwork_preview_auditor`) to verify implementation integrity.
   - Gate verdict in `GATE_STATUS.md`.
4. Upon passing all gate criteria, update `PROJECT.md` status to `DONE` and report completion back via `send_message` and `handoff.md`.

## 2026-08-10T18:40:04Z

Context: System restart recovery for Milestone M1 (Redis Caching & Explicit Invalidation).
Content: The system was restarted. Please resume your sub-orchestration loop from your current checkpoint in `/home/noah/project/petakeu/.agents/teamwork_preview_suborch_m1/progress.md` and `BRIEFING.md`. Check on your worker/reviewers/auditor and complete Milestone M1 verification.
Action: Resume M1 execution loop and report status.


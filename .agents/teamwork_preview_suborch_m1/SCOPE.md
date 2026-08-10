# Scope: Milestone M1 — Redis Caching & Explicit Invalidation

## Scope Overview
Milestone M1 focuses on standardizing and enhancing Redis caching and explicit invalidation mechanisms across choropleth GeoJSON queries and region summaries in `@petakeu/server`.

## Features in Scope
1. **Choropleth Query Parameters**: Wire `req.query.level` and `req.query.parent` in `geoController.getChoropleth` (`apps/server/src/controllers/geo-controller.ts`). Pass them to `geoService.buildChoropleth(period, options)`.
2. **Choropleth Cache Key & Configurable TTL**: Standardize key format in `geo-service.ts` to `choropleth:{period}:{level}:{parent}` (prefixed with `petakeu:geo:` via `redis.ts`), add `CHOROPLETH_CACHE_TTL` (default 300) in `apps/server/src/config/env.ts`.
3. **Region Summary Cache Key & Configurable TTL**: Fix duplicate key prefixing in `region-service.ts` to build key `summary:{regionId}:{from}:{to}` (prefixed with `petakeu:regions:`), add `REGION_SUMMARY_CACHE_TTL` (default 180) in `apps/server/src/config/env.ts`.
4. **Cache Hits Metric Logging**: Ensure `petakeu_cache_hits_total` (`cacheHits` counter) is incremented on Redis cache hit in `apps/server/src/db/redis.ts`.
5. **Explicit Cache Invalidation Hooks**: Add `invalidateRegionCache()` alongside `invalidateChoroplethCache()` in `apps/server/src/jobs/upload-worker.ts` (after payment processing) and `apps/server/src/jobs/mv-refresh-cron.ts` (after MV refresh). Update unit test mocks in `upload-worker.test.ts`.

## Interface Contracts & Key Specifications
- **Choropleth Key**: `petakeu:geo:choropleth:{period}:{level}:{parent}` (handled by `geo-service.ts` with prefix `petakeu:geo:`)
- **Choropleth TTL**: Configurable via `CHOROPLETH_CACHE_TTL` env var (default: 300 seconds)
- **Region Summary Key**: `petakeu:regions:summary:{regionId}:{from}:{to}` (handled by `region-service.ts` with prefix `petakeu:regions:`)
- **Region Summary TTL**: Configurable via `REGION_SUMMARY_CACHE_TTL` env var (default: 180 seconds)
- **Cache Hits Metric**: Increment Prometheus counter `cacheHits.inc()` when Redis cache hit occurs in `getCached()`
- **Invalidation**: Call both `invalidateRegionCache()` and `invalidateChoroplethCache()` in `upload-worker.ts` and `mv-refresh-cron.ts`

## Target Files
- `apps/server/src/config/env.ts`
- `apps/server/src/controllers/geo-controller.ts`
- `apps/server/src/services/geo-service.ts`
- `apps/server/src/services/region-service.ts`
- `apps/server/src/db/redis.ts`
- `apps/server/src/jobs/upload-worker.ts`
- `apps/server/src/jobs/mv-refresh-cron.ts`
- `apps/server/src/jobs/upload-worker.test.ts`
